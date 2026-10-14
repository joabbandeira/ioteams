import { constants } from 'node:fs'
import { access, lstat, mkdir, open, readFile, realpath, unlink } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute, join, sep } from 'node:path'
import { z } from 'zod'
import { createCodexHost, initializeRuntimeHome } from '@ioteams/codex'
import type { HostAdapter } from '@ioteams/core'
import { buildPermissionConfig, createNativeCheckSandbox, type PlanningHostRequest, type ExecutionHostRequest, type ApprovedPolicy } from '@ioteams/runtime'
import { ApiError } from './contracts.js'
const inside = (root: string, path: string) => path === root || path.startsWith(root + sep)
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
export async function verifyNativeExecutable(path: string, checkoutRoots: string[]) {
  const roots = await Promise.all(checkoutRoots.map(async root => {
    if (!isAbsolute(root) || await realpath(root) !== root) throw new ApiError(409, 'UNSAFE_EXECUTABLE')
    return root
  }))
  async function inspect() {
    if (!isAbsolute(path) || await realpath(path) !== path || roots.some(root => inside(root, path))) throw new ApiError(409, 'UNSAFE_EXECUTABLE')
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.mode & 0o022 || ![0, process.getuid?.()].includes(stat.uid) || stat.size > 268_435_456) throw new ApiError(409, 'UNSAFE_EXECUTABLE')
    await access(path, constants.X_OK)
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const actual = await file.stat()
      if (actual.ino !== stat.ino || actual.dev !== stat.dev) throw new ApiError(409, 'UNSAFE_EXECUTABLE')
      const bytes = await file.readFile()
      // ELF, thin Mach-O and universal Mach-O. JS/shell launchers are never treated as the configured native binary.
      if (bytes.length < 4 || !['7f454c46', 'cffaedfe', 'feedfacf', 'cefaedfe', 'feedface', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca'].includes(bytes.subarray(0, 4).toString('hex'))) throw new ApiError(409, 'UNSAFE_EXECUTABLE')
      const after = await file.stat()
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || await realpath(path) !== path) throw new ApiError(409, 'UNSAFE_EXECUTABLE')
      return { hash: hash(bytes), ino: stat.ino, dev: stat.dev, size: stat.size, mode: stat.mode }
    } finally { await file.close() }
  }
  const original = await inspect()
  return { path, async assertUnchanged() { if (JSON.stringify(await inspect()) !== JSON.stringify(original)) throw new ApiError(409, 'EXECUTABLE_CHANGED') } }
}
/** A native accept requires a trusted adapter guard; a human click alone cannot extend the immutable plan.
 * Until T15 supplies policy-aware native validation, accept fails closed. Decline/cancel retain native semantics. */
export function guardNativeApprovals(host: HostAdapter, assertAccept?: (requestId: string) => Promise<void>): HostAdapter {
  return {
    start: (input, signal) => host.start(input, signal), interrupt: id => host.interrupt(id),
    async respondToApproval(id, decision) {
      if (decision === 'accept') {
        if (!assertAccept) throw new ApiError(409, 'NATIVE_APPROVAL_GUARD_REQUIRED')
        await assertAccept(id)
      }
      await host.respondToApproval(id, decision)
    },
  }
}
type HostRequest = PlanningHostRequest | ExecutionHostRequest
export interface NativeFactoryOptions {
  codexExecutable: string; runtimeHome: string; checkRuntimeRoot: string; checkoutRoots: string[]; searchPath: string[]; model?: string
  assertNativeApproval?(context: { host: HostAdapter; policy: ApprovedPolicy; taskId: string; phase: HostRequest['phase']; requestId: string }): Promise<void>
}
async function reserve(home: string) {
  const path = join(home, '.ioteams-server.lock'), contents = JSON.stringify({ owner: 'ioteams-server', token: randomUUID(), pid: process.pid })
  const file = await open(path, 'wx', 0o600).catch(() => { throw new ApiError(409, 'RUNTIME_BUSY') })
  const original = await file.stat()
  await file.writeFile(contents); await file.sync()
  return async () => {
    try {
      const current = await lstat(path)
      if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1 || current.ino !== original.ino || current.dev !== original.dev || await readFile(path, 'utf8') !== contents) throw new ApiError(409, 'RUNTIME_LOCK_CHANGED')
      await unlink(path)
    } finally { await file.close() }
  }
}
async function installConfig(home: string, config: string) {
  // Ownership file only permits replacing a profile previously installed by this factory.
  const path = join(home, 'config.toml'), stamp = join(home, '.ioteams-server-config.json')
  let previous: string | undefined
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== process.getuid?.() || info.mode & 0o077) throw new ApiError(409, 'UNOWNED_CONFIG')
    previous = await readFile(path, 'utf8')
    if (previous !== config) {
      const marker = await lstat(stamp)
      if (!marker.isFile() || marker.isSymbolicLink() || marker.nlink !== 1 || marker.mode & 0o077) throw new ApiError(409, 'UNOWNED_CONFIG')
      const owned = z.strictObject({ version: z.literal(1), hash: z.string().regex(/^[a-f0-9]{64}$/) }).parse(JSON.parse(await readFile(stamp, 'utf8')))
      if (owned.hash !== hash(previous)) throw new ApiError(409, 'UNOWNED_CONFIG')
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || previous !== undefined) throw error }
  for (const [target, data] of [[path, config], [stamp, JSON.stringify({ version: 1, hash: hash(config) })]]) {
    let exists = false
    try {
      const info = await lstat(target); exists = true
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== process.getuid?.() || info.mode & 0o077) throw new ApiError(409, 'UNOWNED_CONFIG')
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const handle = await open(target, constants.O_WRONLY | constants.O_NOFOLLOW | (exists ? 0 : constants.O_CREAT | constants.O_EXCL), 0o600)
    try { await handle.truncate(0); await handle.writeFile(data); await handle.sync() } finally { await handle.close() }
  }
}
/** Operator composition, never a REST configuration endpoint. Shared authenticated runtime is serialized;
 * every host/session is new. Checks use fresh, unauthenticated homes. No credential copying or PATH discovery. */
export async function createNativeFactories(options: NativeFactoryOptions) {
  const executable = await verifyNativeExecutable(options.codexExecutable, options.checkoutRoots)
  let busy = false
  return {
    async createHost(request: HostRequest, signal?: AbortSignal) {
      if (busy) throw new ApiError(409, 'RUNTIME_BUSY')
      busy = true
      let release: (() => Promise<void>) | undefined, host: Awaited<ReturnType<typeof createCodexHost>> | undefined
      try {
        if (signal?.aborted) throw new ApiError(409, 'INTERRUPTED')
        await executable.assertUnchanged()
        const checkoutRoots = [...options.checkoutRoots, request.policy.snapshot.repository.root, request.policy.snapshot.workspaceRoot]
        await initializeRuntimeHome({ runtimeHome: options.runtimeHome, checkoutRoots })
        release = await reserve(options.runtimeHome)
        try { await lstat(join(options.runtimeHome, '.ioteams-adapter.lock')); throw new ApiError(409, 'RUNTIME_BUSY') }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        const profile = await buildPermissionConfig(request.policy, { taskId: request.taskId, phase: request.phase, runtimeHome: options.runtimeHome })
        await installConfig(options.runtimeHome, profile.config)
        if (signal?.aborted) throw new ApiError(409, 'INTERRUPTED')
        await executable.assertUnchanged()
        host = await createCodexHost({ executable: executable.path, runtimeHome: options.runtimeHome, cwd: request.policy.snapshot.workspaceRoot,
          runId: 'runId' in request ? request.runId : randomUUID(), permissionProfile: profile.name, trustedInstructionSources: profile.trustedInstructionSources })
        const native = host
        if ((await native.status()).requiresOpenaiAuth && !(await native.status()).authenticated) throw new ApiError(409, 'AUTH_REQUIRED')
        const models = await native.models(), chosen = options.model ?? models.find(model => !model.hidden)?.model
        if (!chosen) throw new ApiError(409, 'MODEL_UNAVAILABLE')
        await native.selectModel(chosen)
        if (signal?.aborted) throw new ApiError(409, 'INTERRUPTED')
        const guarded = guardNativeApprovals(native, options.assertNativeApproval ? requestId => options.assertNativeApproval!({ host: native,
          policy: request.policy, taskId: request.taskId, phase: request.phase, requestId }) : undefined)
        let disposed = false
        return { host: guarded, async dispose() {
          if (disposed) return
          disposed = true
          try { await native.dispose(); await release!() } finally { busy = false }
        } }
      } catch (error) {
        try { await host?.dispose(); await release?.() } finally { busy = false }
        throw error
      }
    },
    async createCheckSandbox(request: { policy: ApprovedPolicy; taskId: string }, signal?: AbortSignal) {
      if (signal?.aborted) throw new ApiError(409, 'INTERRUPTED')
      await executable.assertUnchanged()
      if (!isAbsolute(options.checkRuntimeRoot) || await realpath(options.checkRuntimeRoot) !== options.checkRuntimeRoot) throw new ApiError(409, 'UNSAFE_RUNTIME')
      const root = await lstat(options.checkRuntimeRoot)
      if (!root.isDirectory() || root.mode & 0o077 || root.uid !== process.getuid?.()) throw new ApiError(409, 'UNSAFE_RUNTIME')
      const checkoutRoots = [...options.checkoutRoots, request.policy.snapshot.repository.root, request.policy.snapshot.workspaceRoot]
      // Validate the dedicated parent before mkdir, including protected personal homes and all checkout roots.
      await initializeRuntimeHome({ runtimeHome: options.checkRuntimeRoot, checkoutRoots, protectedHomes: [options.runtimeHome] })
      const runtimeHome = join(options.checkRuntimeRoot, randomUUID())
      await mkdir(runtimeHome, { mode: 0o700 })
      await initializeRuntimeHome({ runtimeHome, checkoutRoots: [...options.checkoutRoots, request.policy.snapshot.repository.root, request.policy.snapshot.workspaceRoot], protectedHomes: [options.runtimeHome] })
      return createNativeCheckSandbox({ ...request, runtimeHome, codexExecutable: executable.path, searchPath: options.searchPath })
    },
  }
}
