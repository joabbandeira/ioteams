import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { lstat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { z } from 'zod'
import { GitShaSchema } from '@ioteams/core'
import { fail, RuntimePolicyError } from './errors.js'
import { assertSafeSubtree, resolvedRoot, canonicalAbsolute, maybeStat } from './paths.js'
const exec = promisify(execFile)
const remoteName = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/)
const number = z.number().int().nonnegative()
export const RepositorySchema = z.strictObject({ root: z.string(), commonDir: z.string(), rootDev: number, rootIno: number, gitDev: number, gitIno: number, branch: z.string(), head: GitShaSchema, remote: remoteName, remoteUrl: z.string().min(1).max(4096) })
export type RepositoryIdentity = z.infer<typeof RepositorySchema>
/** Internal fixed argv only. No inherited Git configuration, tokens, aliases or shell. */
export async function gitCommand(cwd: string, args: readonly string[]): Promise<string> {
  try {
    const result = await exec('/usr/bin/git', ['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'submodule.recurse=false', ...args], {
      cwd, env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: cwd, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_ALLOW_PROTOCOL: 'file:https:ssh', LANG: 'C' }, timeout: 30_000, maxBuffer: 8_388_608,
    })
    return result.stdout
  } catch { throw new RuntimePolicyError('GIT_FAILED', 'Git não confirmou a operação; reconcilie o resultado antes de repetir.') }
}
export function validateRemoteUrl(value: string): string {
  if (/[\s\x00-\x1f\x7f]/u.test(value) && !isAbsolute(value)) fail('UNSAFE_REMOTE', 'Destino remoto inválido.')
  if (/[\x00-\x1f\x7f]/u.test(value)) fail('UNSAFE_REMOTE', 'Destino remoto inválido.')
  if (isAbsolute(value)) return value
  if (/^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9_./-]+$/.test(value)) return value
  try {
    const url = new URL(value)
    if (!['https:', 'ssh:'].includes(url.protocol) || url.password || url.search || url.hash || (url.username && !(url.protocol === 'ssh:' && url.username === 'git')) || !url.hostname)
      fail('UNSAFE_REMOTE', 'Destino remoto ou credenciais inline recusados.')
  } catch { fail('UNSAFE_REMOTE', 'Transporte remoto não suportado.') }
  return value
}
async function safeLocalConfig(root: string): Promise<void> {
  const values = (await gitCommand(root, ['config', '--local', '--no-includes', '--null', '--list'])).split('\0').filter(Boolean)
  for (const value of values) {
    const key = value.split('\n', 1)[0].toLowerCase()
    // Only inert repository bookkeeping is accepted. All executable/config include surfaces fail closed.
    if (!/^(?:core\.(?:repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|autocrlf|eol|symlinks|quotepath)|remote\.[a-z0-9._-]+\.(?:url|fetch|pushurl)|branch\..+\.(?:remote|merge)|user\.(?:name|email)|extensions\.objectformat)$/.test(key))
      fail('UNSAFE_GIT_CONFIG', 'Configuração Git exige revisão explícita e não é suportada neste checkout.')
  }
}
export async function inspectRepository(root: string, remote: string): Promise<RepositoryIdentity> {
  await resolvedRoot(root); remoteName.parse(remote)
  // Reject symlinked .git before allowing Git to inspect its metadata.
  await canonicalAbsolute(join(root, '.git'))
  if (!(await lstat(join(root, '.git'))).isDirectory()) fail('UNSAFE_REPOSITORY', 'Origem deve ser checkout independente, sem metadata Git compartilhada.')
  await assertSafeSubtree(join(root, '.git'))
  if (await maybeStat(join(root, '.git/objects/info/alternates')) || await maybeStat(join(root, '.git/info/grafts')) || await maybeStat(join(root, '.git/commondir'))) fail('UNSAFE_REPOSITORY', 'Object store externo ou histórico substituído não suportado.')
  for (const file of ['index.lock', 'HEAD.lock', 'config.lock', 'packed-refs.lock', 'shallow.lock'])
    if (await maybeStat(join(root, '.git', file))) fail('WORKSPACE_BUSY', 'Git possui operação nativa pendente; não remova a reserva automaticamente.')
  await safeLocalConfig(root)
  if ((await gitCommand(root, ['rev-parse', '--show-toplevel'])).trim() !== root || (await gitCommand(root, ['rev-parse', '--show-superproject-working-tree'])).trim())
    fail('UNSAFE_REPOSITORY', 'Raiz Git divergente ou submódulo não suportado.')
  const commonDir = (await gitCommand(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim()
  await resolvedRoot(commonDir)
  const fetch = (await gitCommand(root, ['remote', 'get-url', '--all', remote])).trim().split('\n')
  const push = (await gitCommand(root, ['remote', 'get-url', '--push', '--all', remote])).trim().split('\n')
  if (fetch.length !== 1 || push.length !== 1 || fetch[0] !== push[0]) fail('UNSAFE_REMOTE', 'Exige um único destino idêntico para fetch e push.')
  const remoteUrl = validateRemoteUrl(fetch[0])
  if (isAbsolute(remoteUrl)) await resolvedRoot(remoteUrl)
  const branch = (await gitCommand(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
  const head = GitShaSchema.parse((await gitCommand(root, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim())
  const rootInfo = await lstat(root), gitInfo = await lstat(commonDir)
  return Object.freeze(RepositorySchema.parse({ root, commonDir, branch, head, remote, remoteUrl, rootDev: rootInfo.dev, rootIno: rootInfo.ino, gitDev: gitInfo.dev, gitIno: gitInfo.ino }))
}
export async function changedPaths(root: string, baseSha?: string): Promise<string[]> {
  if (baseSha) GitShaSchema.parse(baseSha)
  const tracked = await gitCommand(root, ['diff', '--name-only', '--no-renames', '-z', baseSha ?? 'HEAD', '--'])
  const committed = baseSha ? await gitCommand(root, ['log', '--format=', '--name-only', '--no-renames', '-z', `${baseSha}..HEAD`, '--']) : ''
  // Include ignored files too: checks cannot quietly create artifacts outside approved scope.
  const others = await gitCommand(root, ['ls-files', '--others', '-z'])
  return [...new Set((tracked + committed + others).split('\0').filter(Boolean))].sort()
}
export async function verifyRepository(expected: RepositoryIdentity, options: { expectedSha?: string; clean?: boolean; allowWriter?: boolean } = {}): Promise<RepositoryIdentity> {
  expected = RepositorySchema.parse(expected)
  options = z.strictObject({ expectedSha: GitShaSchema.optional(), clean: z.boolean().optional(), allowWriter: z.boolean().optional() }).parse(options)
  const current = await inspectRepository(expected.root, expected.remote)
  for (const key of ['root', 'commonDir', 'rootDev', 'rootIno', 'gitDev', 'gitIno', 'branch', 'remote', 'remoteUrl'] as const)
    if (current[key] !== expected[key]) fail('REPOSITORY_CHANGED', 'Identidade, branch ou destino Git mudou desde a aprovação.')
  if (current.head !== (options.expectedSha ?? expected.head)) fail('REPOSITORY_CHANGED', 'SHA Git diverge da revisão esperada.')
  if (options.clean && (await gitCommand(expected.root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).length)
    fail('DIRTY_REPOSITORY', 'Checkout deve estar limpo antes da execução.')
  if (!options.allowWriter && await maybeStat(join(current.commonDir, 'ioteams-writer.lock'))) fail('WORKSPACE_BUSY', 'Checkout possui escritor reservado; reconciliação necessária.')
  return current
}
