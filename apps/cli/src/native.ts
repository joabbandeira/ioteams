import { spawn } from 'node:child_process'
import { statfs } from 'node:fs/promises'
import { join } from 'node:path'
import { loadCatalog } from '@ioteams/catalog'
import { verifyCodexExecutable, runtimeEnvironment } from '@ioteams/codex'
import { CliError, fail, loadProduct, withNativeRuntime } from './state.js'
export interface NativeResult { code: number; stdout: string }
export type NativeRunner = (executable: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; signal?: AbortSignal; interactive?: boolean }) => Promise<NativeResult>
export const nativeRunner: NativeRunner = (executable, args, options) => new Promise((resolve, reject) => {
  if (options.signal?.aborted) return reject(new CliError('INTERRUPTED', 130))
  const child = spawn(executable, args, { cwd: options.cwd, env: options.env, shell: false, stdio: options.interactive ? 'inherit' : ['ignore', 'pipe', 'pipe'] })
  let stdout = '', bytes = 0, failure: CliError | undefined, escalation: NodeJS.Timeout | undefined
  const stop = (error: CliError) => {
    failure ??= error
    // Child reference is owned by this invocation. Never signal after exit or close.
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGTERM') } catch { failure = new CliError('TERMINATION_UNCERTAIN', 4) }
      escalation ??= setTimeout(() => { if (child.exitCode === null && child.signalCode === null) { try { child.kill('SIGKILL') } catch { failure = new CliError('TERMINATION_UNCERTAIN', 4) } } }, 1000)
    }
  }
  const abort = () => stop(new CliError('INTERRUPTED', 130))
  const timer = setTimeout(() => stop(new CliError('NATIVE_TIMEOUT', 4)), options.interactive ? 300_000 : 15_000)
  options.signal?.addEventListener('abort', abort, { once: true })
  child.stdout?.on('data', (buffer: Buffer) => { bytes += buffer.length; if (bytes > 131_072) stop(new CliError('OUTPUT_LIMIT')); else stdout += buffer.toString('utf8') })
  child.stderr?.on('data', (buffer: Buffer) => { bytes += buffer.length; if (bytes > 131_072) stop(new CliError('OUTPUT_LIMIT')) })
  child.on('error', () => { failure = new CliError('NATIVE_UNAVAILABLE') })
  child.on('close', code => {
    clearTimeout(timer); clearTimeout(escalation); options.signal?.removeEventListener('abort', abort)
    if (failure) reject(failure); else resolve({ code: code ?? 1, stdout })
  })
  if (options.signal?.aborted) abort()
})
export async function doctor(home: string, runner: NativeRunner = nativeRunner, signal?: AbortSignal) {
  const config = await loadProduct(home)
  const checks: Record<string, boolean> = { node24: /^v24\./.test(process.version), disk: false, corpus: false, git: false, codex: false, capabilities: false, authenticated: false }
  try { const space = await statfs(home, { bigint: true }); checks.disk = space.bavail * space.bsize >= 5_000_000_000n } catch { /* Report only bounded status. */ }
  try { await loadCatalog(config.catalogRoot); checks.corpus = true } catch { /* No paths/content in diagnostics. */ }
  try {
    const git = await runner('/usr/bin/git', ['--version'], { cwd: home, env: { PATH: '/usr/bin:/bin', HOME: join(home, 'runtime', 'home') }, signal })
    checks.git = git.code === 0 && git.stdout.startsWith('git version ')
  } catch { /* Independent checks still run. */ }
  if (config.codexExecutable) try {
    const executable = await verifyCodexExecutable(config.codexExecutable, config.checkoutRoots)
    await withNativeRuntime(home, executable, async () => {
      const options = { cwd: join(home, 'runtime'), env: runtimeEnvironment(join(home, 'runtime')), signal }
      const version = await runner(executable.path, ['--version'], options)
      checks.codex = version.code === 0 && version.stdout.trim() === 'codex-cli 0.162.1'
      if (!checks.codex) return
      const help = await runner(executable.path, ['--help'], options)
      checks.capabilities = help.code === 0 && /app-server/.test(help.stdout) && /login/.test(help.stdout)
      const auth = await runner(executable.path, ['-c', 'cli_auth_credentials_store="file"', 'login', 'status'], options)
      checks.authenticated = auth.code === 0
    })
  } catch (error) { if (signal?.aborted) throw error }
  return { status: Object.values(checks).every(Boolean) ? 'ready' : 'attention_required', checks }
}
export async function login(home: string, runner: NativeRunner = nativeRunner, signal?: AbortSignal, deviceAuth = false) {
  const config = await loadProduct(home)
  if (!config.codexExecutable) return fail('CODEX_EXECUTABLE_REQUIRED', 2)
  const executable = await verifyCodexExecutable(config.codexExecutable, config.checkoutRoots)
  return withNativeRuntime(home, executable, async () => {
    const options = { cwd: join(home, 'runtime'), env: runtimeEnvironment(join(home, 'runtime')), signal }
    const version = await runner(executable.path, ['--version'], options)
    if (version.code !== 0 || version.stdout.trim() !== 'codex-cli 0.162.1') return fail('UNSUPPORTED_VERSION', 4)
    const result = await runner(executable.path, ['-c', 'cli_auth_credentials_store="file"', 'login', ...deviceAuth ? ['--device-auth'] : []], { ...options, interactive: true })
    if (result.code !== 0) return fail('LOGIN_INCOMPLETE', 3)
    const auth = await runner(executable.path, ['-c', 'cli_auth_credentials_store="file"', 'login', 'status'], options)
    if (auth.code !== 0) return fail('AUTH_REQUIRED', 3)
    return { status: 'authenticated' }
  })
}
