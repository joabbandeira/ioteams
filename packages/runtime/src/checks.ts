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
/** Result settlement and resource closure are independent. Only the live leader
 * created with detached=true authenticates a signal target; never signal at close.
 * The scoped boundary makes OS signal failures testable without global kill mocks. */
export function superviseCheckProcess(child: ChildProcess, timeoutMs: number, signal?: AbortSignal,
  signalOwnedGroup: (pid: number) => void = pid => { process.kill(-pid, 'SIGKILL') },
  groupAbsent: (pid: number) => boolean = pid => {
    // Signal zero is an absence observation only, never authority to signal a
    // recycled numeric group. Positive/EPERM remains uncertain.
    try { process.kill(-pid, 0); return false }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true; throw error }
  }) {
  let exited = false, quiescent = false, signalled = false, settled = false
  let resolve!: () => void, reject!: (error: unknown) => void, close!: () => void, quiet!: () => void
  const result = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  const closure = new Promise<void>(yes => { close = yes })
  const absence = new Promise<void>(yes => { quiet = yes })
  let timer: ReturnType<typeof setTimeout>
  const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  const settle = (error?: RuntimePolicyError) => {
    if (settled) return
    settled = true; cleanup()
    if (error) reject(error); else resolve()
  }
  const infrastructure = (cause: unknown) => Object.assign(new RuntimePolicyError('CHECK_INFRASTRUCTURE', 'Falha ao controlar o processo próprio do check; encerramento exige confirmação.'), { cause })
  const stop = (reason: 'CHECK_TIMEOUT' | 'CHECK_INTERRUPTED' | 'CHECK_OUTPUT_LIMIT') => {
    if (quiescent || signalled) return
    signalled = true
    if (!exited && child.exitCode === null && child.signalCode === null && child.pid) {
      try { signalOwnedGroup(child.pid) }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') { settle(infrastructure(error)); return }
      }
    }
    settle(new RuntimePolicyError(reason, 'Check não terminou com resultado seguro.'))
  }
  const abort = () => stop('CHECK_INTERRUPTED')
  child.once('exit', () => { exited = true })
  child.once('error', error => { settle(infrastructure(error)) })
  child.once('close', code => {
    exited = true; close()
    const confirmAbsence = () => {
      let cause: unknown
      try {
        if (!child.pid || groupAbsent(child.pid)) {
          quiescent = true; quiet()
          if (code !== 0) settle(new RuntimePolicyError('CHECK_INFRASTRUCTURE', 'Sandbox não confirmou execução do check.'))
          else settle()
          return
        }
      } catch (error) { cause = error }
      settle(Object.assign(new RuntimePolicyError('CHECK_TERMINATION_UNCERTAIN', 'Ausência do grupo do check não confirmada; recursos permanecem reservados.'), { cause }))
      // No further termination attempts. Read-only observations may later prove
      // absence, allowing dispose/caller ownership barriers to finish safely.
      setTimeout(confirmAbsence, 20)
    }
    confirmAbsence()
  })
  timer = setTimeout(() => stop('CHECK_TIMEOUT'), timeoutMs)
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  return { result, closed: closure, quiescent: absence, stop }
}
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
  let used = false, disposed = false
  let operation: Promise<CheckResult> | undefined, closing: Promise<void> = Promise.resolve(), disposing: Promise<void> | undefined
  let supervisor: ReturnType<typeof superviseCheckProcess> | undefined
  const assertActive = (signal?: AbortSignal) => { if (disposed || signal?.aborted) fail('CHECK_INTERRUPTED', 'Check cancelado antes do próximo efeito.') }
  async function execute(command: ApprovedCheckArgv, signal?: AbortSignal): Promise<CheckResult> {

    let authorized = false
    for (const check of taskPolicy(policy, taskId).checks) if (canonicalJson(await assertCheckCommand(policy, taskId, check)) === canonicalJson(command)) authorized = true
    if (!authorized) fail('UNAPPROVED_CHECK', 'Argv não corresponde ao check aprovado.')
    assertActive(signal)
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
    assertActive(signal)
    let size = 0
    let child: ChildProcess
    try { child = spawn(codexExecutable, ['sandbox', '--include-managed-config', '-P', profile.name, '-C', command.cwd, '--', node, launcher], {
      cwd: command.cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    }) } catch (cause) { throw Object.assign(new RuntimePolicyError('CHECK_INFRASTRUCTURE', 'Sandbox não iniciou o check.'), { cause }) }
    supervisor = superviseCheckProcess(child, command.timeoutMs, signal)
    closing = supervisor.quiescent
    void supervisor.result.catch(() => {})
    if (!child.stdout || !child.stderr) fail('CHECK_INFRASTRUCTURE', 'Sandbox não disponibilizou streams do check.')
    child.stdout!.on('data', (chunk: Buffer) => { size += chunk.length; stdout.update(chunk); if (size > 8_388_608) supervisor!.stop('CHECK_OUTPUT_LIMIT') })
    child.stderr!.on('data', (chunk: Buffer) => { size += chunk.length; stderr.update(chunk); if (size > 8_388_608) supervisor!.stop('CHECK_OUTPUT_LIMIT') })
    await supervisor.result
    await canonicalAbsolute(resultFile)
    const resultInfo = await lstat(resultFile)
    if (!resultInfo.isFile() || resultInfo.nlink !== 1 || resultInfo.size > 256) fail('CHECK_INFRASTRUCTURE', 'Resultado nativo inválido.')
    const result = resultSchema.parse(JSON.parse(await readFile(resultFile, 'utf8')))
    if (result.signal || result.code === null) fail('CHECK_INTERRUPTED', 'Processo de check foi interrompido.')
    await assertConfig()
    assertActive(signal)
    return { exitCode: result.code, contentHash: sha256(canonicalJson({ stdout: stdout.digest('hex'), stderr: stderr.digest('hex') })) }
  }
  return {
    execute(command, signal) {
      if (used || disposed) return Promise.reject(new RuntimePolicyError('CHECK_INFRASTRUCTURE', 'Sandbox de check é exclusivo de uma chamada.'))
      used = true
      return operation = execute(command, signal)
    },
    dispose() {
      if (disposing) return disposing
      disposed = true
      supervisor?.stop('CHECK_INTERRUPTED')
      // Preflight may still be awaiting filesystem checks. It observes disposed
      // before spawn; an existing child remains owned until its close event.
      return disposing = (async () => {
        if (operation) await Promise.allSettled([operation])
        await closing
      })()
    },
  }
}
