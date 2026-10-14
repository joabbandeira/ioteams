/** Host boundary: production factories must provide a native sandbox. No unconfined fallback. */
export interface ApprovedCheckArgv { executable: string; args: string[]; cwd: string; timeoutMs: number }
export interface CheckResult { exitCode: number; contentHash: string }
export interface CheckSandbox {
  execute(command: ApprovedCheckArgv, signal?: AbortSignal): Promise<CheckResult>
  dispose(): Promise<void>
}

import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, open, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { IdentifierSchema } from '@ioteams/core'
import { buildPermissionConfig } from './permissions.js'
import { assertCheckCommand, canonicalJson, sha256, taskPolicy, ApprovedPolicy } from './policy.js'
import { canonicalAbsolute, contains, maybeStat } from './paths.js'
import { RuntimePolicyError, fail } from './errors.js'
export interface NativeCheckOptions { policy: ApprovedPolicy; taskId: string; runtimeHome: string; codexExecutable: string; searchPath: string[] }
const resultSchema = z.strictObject({ code: z.number().int().min(0).max(255).nullable(), signal: z.string().nullable() })
/** One check per dedicated runtime. No login, inference, active personal data or config inheritance.
 * Native CLI support is explicit: sandbox --include-managed-config -P profile -C cwd -- argv. */
export async function createNativeCheckSandbox(options: NativeCheckOptions): Promise<CheckSandbox> {
  options = z.strictObject({ policy: z.custom<ApprovedPolicy>(value => value instanceof ApprovedPolicy), taskId: IdentifierSchema, runtimeHome: z.string(), codexExecutable: z.string(), searchPath: z.array(z.string()) }).parse(options)
  const { policy, taskId, runtimeHome, codexExecutable } = options
  const profile = await buildPermissionConfig(policy, { taskId, phase: 'implement', runtimeHome })
  await canonicalAbsolute(codexExecutable)
  if (!(await lstat(codexExecutable)).isFile()) fail('CHECK_INFRASTRUCTURE', 'Executável Codex inválido.')
  const node = await realpath(process.execPath)
  if (!policy.snapshot.toolReadRoots.some(root => contains(root, node))) fail('CHECK_INFRASTRUCTURE', 'Node do launcher exige raiz de ferramenta explicitamente aprovada.')
  const searchPath = z.array(z.string().min(1)).min(1).max(30).parse(options.searchPath)
  for (const path of searchPath) {
    await canonicalAbsolute(path)
    if (!(await lstat(path)).isDirectory() || !['/usr/bin', '/bin', '/usr/sbin', '/sbin', dirname(node)].includes(path) && !policy.snapshot.toolReadRoots.some(root => contains(root, path)))
      fail('CHECK_INFRASTRUCTURE', 'PATH deve conter somente ferramentas aprovadas e diretórios do sistema.')
  }
  const configFile = join(runtimeHome, 'config.toml'), previous = await maybeStat(configFile)
  if (previous) {
    await canonicalAbsolute(configFile)
    if (!previous.isFile() || previous.nlink !== 1 || previous.mode & 0o077 || await readFile(configFile, 'utf8') !== profile.config) fail('CHECK_INFRASTRUCTURE', 'Configuração de checks diverge do perfil aprovado.')
  } else await writeFile(configFile, profile.config, { flag: 'wx', mode: 0o600 })
  let claim
  try { claim = await open(join(runtimeHome, '.ioteams-check-used.json'), 'wx', 0o400) } catch { fail('CHECK_INFRASTRUCTURE', 'Runtime de check já reservado; use um runtime novo após reconciliação.') }
  try { await claim.writeFile(JSON.stringify({ version: 1, policyHash: policy.snapshot.plan.policyHash, taskId })); await claim.sync() } finally { await claim.close() }
  async function assertConfig() {
    await canonicalAbsolute(configFile)
    const info = await lstat(configFile)
    if (!info.isFile() || info.nlink !== 1 || info.mode & 0o077 || await readFile(configFile, 'utf8') !== profile.config) fail('CHECK_INFRASTRUCTURE', 'Configuração nativa mudou antes ou durante o check.')
  }
  let used = false, disposed = false, processChild: ChildProcess | undefined
  const stop = () => {
    if (!processChild?.pid) return
    // This group was created by this factory using detached=true, never selected by name.
    try { process.kill(-processChild.pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
  return {
    async execute(command, signal) {
      if (used || disposed) fail('CHECK_INFRASTRUCTURE', 'Sandbox de check é exclusivo de uma chamada.')
      used = true
      let authorized = false
      for (const check of taskPolicy(policy, taskId).checks) if (canonicalJson(await assertCheckCommand(policy, taskId, check)) === canonicalJson(command)) authorized = true
      if (!authorized) fail('UNAPPROVED_CHECK', 'Argv não corresponde ao check aprovado.')
      if (signal?.aborted) fail('CHECK_INTERRUPTED', 'Check cancelado antes de iniciar.')
      await assertConfig()
      const stamp = randomUUID(), launcher = join(runtimeHome, 'tmp', `${stamp}.mjs`), resultFile = join(runtimeHome, 'tmp', `${stamp}.result.json`)
      // No inline shell/interpreter code. The host writes its own fixed launcher.
      // A result created by the parent of the checked process distinguishes an
      // actual nonzero check from sandbox/bootstrap/launch infrastructure failure.
      const source = `import {spawn} from 'node:child_process';\nimport {writeFileSync} from 'node:fs';\nconst child=spawn(${JSON.stringify(command.executable)},${JSON.stringify(command.args)},{cwd:${JSON.stringify(command.cwd)},stdio:'inherit'});\nchild.on('error',()=>process.exit(125));\nchild.on('close',(code,signal)=>{writeFileSync(${JSON.stringify(resultFile)},JSON.stringify({code,signal}),{flag:'wx',mode:0o600});});\n`
      await writeFile(launcher, source, { flag: 'wx', mode: 0o600 })
      const env = { PATH: searchPath.join(':'), HOME: join(runtimeHome, 'home'), CODEX_HOME: runtimeHome,
        CODEX_SQLITE_HOME: join(runtimeHome, 'sqlite'), TMPDIR: join(runtimeHome, 'tmp'), LANG: 'en_US.UTF-8' }
      const stdout = createHash('sha256'), stderr = createHash('sha256')
      let failure: string | undefined, size = 0
      await new Promise<void>((resolve, reject) => {
        processChild = spawn(codexExecutable, ['sandbox', '--include-managed-config', '-P', profile.name, '-C', command.cwd, '--', node, launcher], {
          cwd: command.cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
        })
        const terminate = (code: string) => { failure ??= code; stop() }
        const timer = setTimeout(() => terminate('CHECK_TIMEOUT'), command.timeoutMs)
        const abort = () => terminate('CHECK_INTERRUPTED')
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) abort()
        processChild.stdout!.on('data', (chunk: Buffer) => { size += chunk.length; stdout.update(chunk); if (size > 8_388_608) terminate('CHECK_OUTPUT_LIMIT') })
        processChild.stderr!.on('data', (chunk: Buffer) => { size += chunk.length; stderr.update(chunk); if (size > 8_388_608) terminate('CHECK_OUTPUT_LIMIT') })
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
        processChild.once('error', () => { cleanup(); reject(new RuntimePolicyError('CHECK_INFRASTRUCTURE', 'Sandbox não iniciou o check.')) })
        processChild.once('close', code => { cleanup(); stop(); processChild = undefined; if (failure) reject(new RuntimePolicyError(failure, 'Check não terminou com resultado seguro.')); else if (code !== 0) reject(new RuntimePolicyError('CHECK_INFRASTRUCTURE', 'Sandbox não confirmou execução do check.')); else resolve() })
      })
      await canonicalAbsolute(resultFile)
      const resultInfo = await lstat(resultFile)
      if (!resultInfo.isFile() || resultInfo.nlink !== 1 || resultInfo.size > 256) fail('CHECK_INFRASTRUCTURE', 'Resultado nativo inválido.')
      const result = resultSchema.parse(JSON.parse(await readFile(resultFile, 'utf8')))
      if (result.signal || result.code === null) fail('CHECK_INTERRUPTED', 'Processo de check foi interrompido.')
      await assertConfig()
      return { exitCode: result.code, contentHash: sha256(canonicalJson({ stdout: stdout.digest('hex'), stderr: stderr.digest('hex') })) }
    },
    async dispose() { disposed = true; stop() },
  }
}
