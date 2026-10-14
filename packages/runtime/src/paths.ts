import { lstat, readdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { RelativePathSchema } from '@ioteams/core'
import { fail } from './errors.js'
export const contains = (root: string, path: string) => root === path || path.startsWith(root + sep)
export const overlaps = (a: string, b: string) => contains(a, b) || contains(b, a)
export async function maybeStat(path: string) {
  try { return await lstat(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}
/** No symlink traversal, including missing descendants of an existing directory. */
export async function canonicalAbsolute(path: string): Promise<string> {
  if (!isAbsolute(path) || path !== resolve(path) || /[\x00-\x1f\x7f]/u.test(path)) fail('UNSAFE_PATH', 'Caminho absoluto canônico obrigatório.')
  let cursor = parse(path).root
  const parts = relative(cursor, path).split(sep).filter(Boolean)
  for (const part of parts) {
    cursor = join(cursor, part)
    const info = await maybeStat(cursor)
    if (info?.isSymbolicLink()) fail('UNSAFE_PATH', 'Links simbólicos não são permitidos no caminho.')
    if (info && !info.isDirectory() && cursor !== path) fail('UNSAFE_PATH', 'Ancestral não é diretório.')
  }
  return path
}
export async function resolvedRoot(path: string): Promise<string> {
  await canonicalAbsolute(path)
  const info = await lstat(path)
  if (!info.isDirectory() || info.uid !== process.getuid?.()) fail('UNSAFE_PATH', 'Diretório deve pertencer ao usuário atual.')
  if (await realpath(path) !== path) fail('UNSAFE_PATH', 'Diretório possui alias.')
  return path
}
const controlNames = new Set(['.git', '.codex', '.agents', '.aws', '.ssh', '.claude'])
export function protectedPath(path: string): boolean {
  return path.split('/').some(part => controlNames.has(part.toLowerCase()) || /^(?:agents(?:\.override)?|claude|gemini)\.md$/i.test(part) || part.toLowerCase() === '.mcp.json')
}
export function safeRelative(path: string): string { return RelativePathSchema.parse(path) }
export async function checkoutPath(root: string, path: string): Promise<string> {
  safeRelative(path)
  const target = join(root, path)
  await canonicalAbsolute(target)
  const info = await maybeStat(target)
  if (info && !info.isDirectory() && (!info.isFile() || info.nlink !== 1)) fail('UNSAFE_PATH', 'Arquivo especial ou hardlink recusado.')
  return target
}
export async function privateState(directory: string, roots: readonly string[]): Promise<string> {
  await resolvedRoot(directory)
  const info = await lstat(directory)
  const personal = protectedHomes()
  if (directory === homedir() || directory === sep || (info.mode & 0o077) !== 0 || [...roots, ...personal].some(root => overlaps(resolve(root), directory)))
    fail('UNSAFE_STATE', 'Estado deve ser privado e separado dos checkouts e dados pessoais.')
  return directory
}

/** Check existing descendants before granting a writable subtree, including ignored artifacts. */
export async function assertSafeSubtree(root: string): Promise<void> {
  let count = 0
  async function visit(path: string, depth: number): Promise<void> {
    if (++count > 100_000 || depth > 64) fail('INVENTORY_LIMIT', 'Escopo excede o limite de inspeção segura.')
    await canonicalAbsolute(path)
    const info = await maybeStat(path)
    if (!info) return
    if (info.isDirectory()) { for (const name of await readdir(path)) await visit(join(path, name), depth + 1) }
    else if (!info.isFile() || info.nlink !== 1) fail('UNSAFE_PATH', 'Escopo contém link ou arquivo especial.')
  }
  await visit(root, 0)
}

export function protectedHomes(): string[] {
  return [join(homedir(), '.codex'), join(homedir(), '.chatgpt'), join(homedir(), '.agents'), process.env.CODEX_HOME, process.env.CODEX_SQLITE_HOME].filter((p): p is string => !!p)
}
