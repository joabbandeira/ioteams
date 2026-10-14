import { z } from 'zod'
import { IdentifierSchema } from '@ioteams/core'
import { join } from 'node:path'
import { lstat, readFile } from 'node:fs/promises'
import { assertSafeSubtree, canonicalAbsolute, checkoutPath, overlaps, privateState } from './paths.js'
import { taskPolicy, type ApprovedPolicy, sha256 } from './policy.js'
import { verifyInstructions, assertInertAncestors } from './instructions.js'
import { fail } from './errors.js'
const phaseSchema = z.enum(['plan', 'implement', 'review'])
const profilesSchema = z.array(z.object({ id: z.string(), description: z.string().nullable(), allowed: z.boolean() }))
export function requirePermissionProfile(name: string, discovered: unknown): void {
  const profiles = profilesSchema.parse(discovered)
  if (profiles.filter(profile => profile.id === name).length !== 1 || !profiles.find(profile => profile.id === name)?.allowed)
    fail('PERMISSIONS_UNAVAILABLE', 'Perfil exato ausente ou proibido; nenhum fallback é permitido.')
}
/** Install this config only into an initialized dedicated runtime, before starting its adapter. */
export async function buildPermissionConfig(policy: ApprovedPolicy, options: { taskId: string; phase: 'plan' | 'implement' | 'review'; runtimeHome: string }): Promise<{ name: string; config: string; trustedInstructionSources: string[] }> {
  options = z.strictObject({ taskId: IdentifierSchema, phase: phaseSchema, runtimeHome: z.string() }).parse(options)
  const phase = phaseSchema.parse(options.phase), task = taskPolicy(policy, options.taskId)
  await canonicalAbsolute(options.runtimeHome)
  if (overlaps(options.runtimeHome, policy.snapshot.workspaceRoot) || overlaps(options.runtimeHome, policy.snapshot.repository.root) || overlaps(options.runtimeHome, join(policy.file, '..')))
    fail('UNSAFE_RUNTIME', 'Runtime deve ser independente do checkout e da política.')
  await privateState(options.runtimeHome, [policy.snapshot.workspaceRoot, policy.snapshot.repository.root, join(policy.file, '..'), ...policy.snapshot.toolReadRoots, ...policy.snapshot.corpusRoots])
  const marker = join(options.runtimeHome, '.ioteams-runtime.json')
  await canonicalAbsolute(marker)
  const markerInfo = await lstat(marker)
  if (!markerInfo.isFile() || markerInfo.nlink !== 1 || markerInfo.uid !== process.getuid?.() || markerInfo.mode & 0o077 || markerInfo.size > 256) fail('UNSAFE_RUNTIME', 'Marcador do runtime inválido.')
  const stamp = JSON.parse(await readFile(marker, 'utf8'))
  if (!z.strictObject({ application: z.literal('ioteams'), version: z.literal(1) }).safeParse(stamp).success) fail('UNSAFE_RUNTIME', 'Runtime não foi inicializado pelo ioteams.')
  for (const name of ['home', 'sqlite', 'tmp', 'logs']) {
    const path = join(options.runtimeHome, name); await canonicalAbsolute(path)
    const info = await lstat(path)
    if (!info.isDirectory() || info.uid !== process.getuid?.() || info.mode & 0o077) fail('UNSAFE_RUNTIME', 'Diretórios do runtime devem ser privados.')
  }
  for (const path of task.allowedPaths) await assertSafeSubtree(await checkoutPath(policy.snapshot.workspaceRoot, path))
  await assertInertAncestors(policy.snapshot.workspaceRoot)
  const trustedInstructionSources = await verifyInstructions(policy)
  const name = `ioteams-${sha256(`${policy.snapshot.plan.policyHash}:${options.taskId}:${phase}:${options.runtimeHome}`).slice(0, 24)}`
  const q = JSON.stringify
  const lines = [
    `default_permissions = ${q(name)}`, 'approval_policy = "on-request"', 'approvals_reviewer = "user"', 'cli_auth_credentials_store = "file"', 'web_search = "disabled"', 'project_doc_fallback_filenames = []',
    `sqlite_home = ${q(join(options.runtimeHome, 'sqlite'))}`, `log_dir = ${q(join(options.runtimeHome, 'logs'))}`,
    '[features]', 'multi_agent = false', 'hooks = false', 'plugins = false', 'memories = false', 'apps = false',
    `[permissions.${name}.filesystem]`, 'glob_scan_max_depth = 64', '":root" = "deny"', '":minimal" = "read"', '":slash_tmp" = "deny"',
    ...policy.snapshot.toolReadRoots.map(path => `${q(path)} = "read"`),
    ...policy.snapshot.corpusRoots.map(path => `${q(path)} = "deny"`),
    `${q(options.runtimeHome)} = "deny"`, `${q(join(options.runtimeHome, 'tmp'))} = "write"`, `${q(join(policy.file, '..'))} = "deny"`, `${q(policy.snapshot.repository.root)} = "deny"`,
    `[permissions.${name}.filesystem.${q(policy.snapshot.workspaceRoot)}]`, '"." = "read"',
    ...phase === 'implement' ? task.allowedPaths.map(path => `${q(path)} = "write"`) : [],
    '".git" = "read"', '".agents" = "read"', '".codex" = "read"', '".aws" = "deny"', '".ssh" = "deny"',
    ...['**/.git', '**/.codex', '**/.agents', '**/.claude', '**/.aws', '**/.ssh', '**/CLAUDE.md', '**/GEMINI.md', '**/.mcp.json', '**/.env', '**/.env.*', '**/AGENTS.md', '**/AGENTS.override.md'].map(path => `${q(path.replace(/[a-z]/gi, letter => `[${letter.toLowerCase()}${letter.toUpperCase()}]`))} = "deny"`),
    // Deny globs protect existing and future instructions. Explicit trust is checked separately
    // through hashes and instructionSources; it does not grant command access to these files.
    `[permissions.${name}.network]`, 'enabled = false', '',
  ]
  return { name, config: lines.join('\n'), trustedInstructionSources }
}
