import { lstat, mkdir, readdir, readFile, readlink, realpath, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { CodexHostError } from './errors.js'
import { isVerifiedExecutable, type VerifiedCodexExecutable } from './executable.js'
const marker = '.ioteams-runtime.json'
const fail = () => { throw new CodexHostError('UNSAFE_RUNTIME', 'Runtime deve ser privado, dedicado e separado de checkouts e dados pessoais.') }
const contains = (root: string, path: string) => path === root || path.startsWith(root + sep)
const nativeHelpers = new Set(['apply_patch', 'applypatch', 'codex-execve-wrapper', ...process.platform === 'linux' ? ['codex-linux-sandbox'] : []])
async function canonical(path: string): Promise<string> {
  if (!isAbsolute(path)) return fail()
  try { return await realpath(path) } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    const parent = resolve(path, '..')
    if (parent === path) return fail()
    return join(await canonical(parent), relative(parent, path))
  }
}
export interface RuntimeOptions { runtimeHome: string; checkoutRoots: string[]; protectedHomes?: string[]; nativeExecutable?: VerifiedCodexExecutable }
async function checkedPath(options: RuntimeOptions): Promise<string> {
  const path = await canonical(options.runtimeHome)
  // Reject aliases even when they resolve to a task-owned directory.
  try { if ((await lstat(options.runtimeHome)).isSymbolicLink()) fail() } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
  const personal = [join(homedir(), '.codex'), join(homedir(), '.chatgpt'), join(homedir(), '.agents'),
    process.env.CODEX_HOME, process.env.CODEX_SQLITE_HOME, ...options.protectedHomes ?? []].filter((p): p is string => !!p)
  for (const root of [...personal, ...options.checkoutRoots]) {
    const resolved = await canonical(root)
    if (contains(resolved, path) || contains(path, resolved)) fail()
  }
  if (path === homedir() || path === sep) fail()
  return path
}
async function inspectTree(path: string, root: string, executable?: VerifiedCodexExecutable): Promise<void> {
  const info = await lstat(path)
  if (info.uid !== process.getuid?.()) fail()
  if (info.isSymbolicLink()) {
    const helper = /^tmp\/arg0\/codex-arg0[a-zA-Z0-9]{6}\/([^/]+)$/.exec(relative(root, path))
    if (!executable || !helper || !nativeHelpers.has(helper[1]) || await readlink(path) !== executable.path || await realpath(path) !== executable.path) fail()
    const parent = resolve(path, '..'), lock = await lstat(join(parent, '.lock'))
    for (const directory of [join(root, 'tmp'), join(root, 'tmp', 'arg0'), parent]) {
      const stat = await lstat(directory)
      // Native tempfile uses 0755 for the session, below the mandatory private tmp/arg0 ancestors.
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || stat.mode & (directory === parent ? 0o022 : 0o077)) fail()
    }
    if (!lock.isFile() || lock.isSymbolicLink() || lock.nlink !== 1 || lock.uid !== process.getuid?.() || lock.mode & 0o022) fail()
    return
  }
  if (!info.isDirectory() && (!info.isFile() || info.nlink !== 1)) fail()
  if (info.isDirectory()) for (const name of await readdir(path)) await inspectTree(join(path, name), root, executable)
}
export async function initializeRuntimeHome(options: RuntimeOptions): Promise<void> {
  const path = await checkedPath(options)
  let entries: string[] = []
  try { entries = await readdir(path) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
  if (entries.length) { await validateRuntimeHome(options); return }
  await mkdir(path, { recursive: true, mode: 0o700 })
  if (((await lstat(path)).mode & 0o077) !== 0) fail()
  await writeFile(join(path, marker), JSON.stringify({ application: 'ioteams', version: 1 }), { flag: 'wx', mode: 0o600 })
  for (const directory of ['home', 'sqlite', 'tmp', 'logs']) await mkdir(join(path, directory), { mode: 0o700 })
}
export async function validateRuntimeHome(options: RuntimeOptions): Promise<string> {
  const path = await checkedPath(options)
  if (((await lstat(path)).mode & 0o077) !== 0) fail()
  if (options.nativeExecutable) {
    if (!isVerifiedExecutable(options.nativeExecutable)) fail()
    await options.nativeExecutable.assertUnchanged()
  }
  await inspectTree(path, path, options.nativeExecutable)
  const owner = JSON.parse(await readFile(join(path, marker), 'utf8'))
  if (owner.application !== 'ioteams' || owner.version !== 1) fail()
  for (const directory of ['home', 'sqlite', 'tmp', 'logs']) if (!(await lstat(join(path, directory))).isDirectory()) fail()
  return path
}
export function runtimeEnvironment(runtimeHome: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: join(runtimeHome, 'home'),
    CODEX_HOME: runtimeHome, CODEX_SQLITE_HOME: join(runtimeHome, 'sqlite'), TMPDIR: join(runtimeHome, 'tmp'),
    LANG: 'en_US.UTF-8',
  }
}
