import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { z } from 'zod'
import { initializeRuntimeHome, type VerifiedCodexExecutable } from '@ioteams/codex'
export class CliError extends Error { constructor(readonly code: string, readonly exitCode = 1) { super(code) } }
export function fail(code: string, exitCode = 1): never { throw new CliError(code, exitCode) }
const inside = (root: string, path: string) => root === path || path.startsWith(root + sep)
const protectedRoots = () => [join(homedir(), '.codex'), join(homedir(), '.chatgpt'), join(homedir(), '.agents'), process.env.CODEX_HOME, process.env.CODEX_SQLITE_HOME].filter((p): p is string => !!p)
export async function canonical(path: string): Promise<string> {
  if (!isAbsolute(path) || path !== resolve(path) || /[\x00-\x1f\x7f]/.test(path)) fail('UNSAFE_PATH', 2)
  let cursor: string = sep
  for (const part of path.split(sep).filter(Boolean)) {
    cursor = join(cursor, part)
    try { if ((await lstat(cursor)).isSymbolicLink()) fail('UNSAFE_PATH', 2) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  return path
}
export async function privateDirectory(path: string) {
  await canonical(path)
  const info = await lstat(path)
  if (!info.isDirectory() || info.uid !== process.getuid?.() || info.mode & 0o077) fail('UNSAFE_STATE', 4)
}
export async function readPrivateJson(path: string): Promise<unknown> {
  await canonical(path)
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || info.mode & 0o077 || info.size > 1_048_576) fail('UNSAFE_STATE', 4)
    return JSON.parse(await file.readFile('utf8'))
  } finally { await file.close() }
}
export const ConfigSchema = z.strictObject({ version: z.literal(1), catalogRoot: z.string(), codexExecutable: z.string().optional(), checkoutRoots: z.array(z.string()) })
export type ProductConfig = z.infer<typeof ConfigSchema>
export async function loadProduct(home: string): Promise<ProductConfig> {
  await privateDirectory(home)
  if (home === sep || home === homedir() || protectedRoots().some(root => inside(root, home) || inside(home, root))) fail('UNSAFE_STATE', 4)
  const config = ConfigSchema.parse(await readPrivateJson(join(home, 'config.json')))
  const marker = z.strictObject({ application: z.literal('ioteams-cli'), version: z.literal(1) }).parse(await readPrivateJson(join(home, '.ioteams-product.json')))
  void marker
  for (const root of [config.catalogRoot, ...config.checkoutRoots]) {
    await canonical(root)
    if (inside(root, home) || inside(home, root)) fail('UNSAFE_STATE', 4)
  }
  for (const name of ['operations', 'knowledge', 'policies', 'checks', 'runtime']) await privateDirectory(join(home, name))
  return config
}
export async function initializeProduct(input: { home: string; catalogRoot: string; checkoutRoots: string[]; codexExecutable?: string }) {
  const {home} = input
  await canonical(home); await canonical(input.catalogRoot)
  const config = ConfigSchema.parse({ version: 1, catalogRoot: input.catalogRoot, checkoutRoots: input.checkoutRoots, ...(input.codexExecutable ? { codexExecutable: input.codexExecutable } : {}) })
  for (const root of [config.catalogRoot, ...config.checkoutRoots]) { await canonical(root); if (!(await lstat(root)).isDirectory()) fail('UNSAFE_PATH', 2) }
  if (home === sep || home === homedir() || [...protectedRoots(), config.catalogRoot, ...config.checkoutRoots].some(root => inside(root, home) || inside(home, root))) fail('UNSAFE_STATE', 4)
  let exists = false
  try { exists = true; if ((await readdir(home)).length) { await loadProduct(home); fail('ALREADY_INITIALIZED', 4) } }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; exists = false }
  if (!exists) await mkdir(home, { mode: 0o700 })
  await privateDirectory(home)
  for (const name of ['operations', 'knowledge', 'policies', 'checks']) await mkdir(join(home, name), { mode: 0o700 })
  await initializeRuntimeHome({ runtimeHome: join(home, 'runtime'), checkoutRoots: config.checkoutRoots })
  for (const [name, value] of [['.ioteams-product.json', { application: 'ioteams-cli', version: 1 }], ['config.json', config]] as const)
    await writeFile(join(home, name), JSON.stringify(value), { flag: 'wx', mode: 0o600 })
}
/** Exclusive task-owned reservation; never remove another owner's/stale lock. */
export async function reserve(path: string): Promise<() => Promise<void>> {
  let file
  try { file = await open(path, 'wx', 0o600) } catch { return fail('OWNER_BUSY', 4) }
  const original = await file.stat()
  const contents = JSON.stringify({ application: 'ioteams-cli', pid: process.pid, token: randomUUID() })
  await file.writeFile(contents); await file.sync()
  return async () => {
    try {
      const current = await lstat(path)
      if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1 || current.ino !== original.ino || current.dev !== original.dev || await readFile(path, 'utf8') !== contents) fail('LOCK_CHANGED', 4)
      await unlink(path)
    } finally { await file.close() }
  }
}
export async function offline<T>(home: string, work: (config: ProductConfig) => Promise<T>): Promise<T> {
  const config = await loadProduct(home), release = await reserve(join(home, '.ioteams-product-owner.lock'))
  try { return await work(config) } finally { await release() }
}
export async function withNativeRuntime<T>(home: string, executable: VerifiedCodexExecutable, work: (config: ProductConfig) => Promise<T>): Promise<T> {
  return offline(home, async config => {
    await executable.assertUnchanged()
    await initializeRuntimeHome({ runtimeHome: join(home, 'runtime'), checkoutRoots: config.checkoutRoots, nativeExecutable: executable })
    const release = await reserve(join(home, 'runtime', '.ioteams-server.lock'))
    try {
      try { await lstat(join(home, 'runtime', '.ioteams-adapter.lock')); fail('OWNER_BUSY', 4) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      await executable.assertUnchanged()
      return await work(config)
    } finally { await release() }
  })
}
