import { constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { CatalogSchema, RelativePathSchema, SlugSchema, type CatalogMetadata } from '@ioteams/core'
import { parseFrontmatter } from './frontmatter.js'

export const CORPUS_ROOTS = { profissoes: 'profession', stacks: 'stack', profissionais: 'professional', equipes: 'team' } as const
const MAX_MARKDOWN_BYTES = 1_048_576
const excludedDirectories = new Set(['node_modules', 'dist', 'build', 'coverage', 'runtime', 'logs', 'receipts', 'artifacts'])
const excludedFiles = new Set(['agents.md', 'claude.md', 'gemini.md', 'skill.md', 'instructions.md'])
const excluded = (name: string) => name.startsWith('.') || excludedDirectories.has(name.toLowerCase()) || excludedFiles.has(name.toLowerCase())
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
async function assertRoot(root: string): Promise<string> {
  const absolute = resolve(root)
  const stat = await lstat(absolute)
  if (stat.isSymbolicLink() || await realpath(absolute) !== absolute) throw new Error('Symlink na raiz do corpus')
  if (!stat.isDirectory()) throw new Error('Raiz do corpus não é diretório')
  return absolute
}
async function assertPath(root: string, relative: string) {
  RelativePathSchema.parse(relative)
  let current = root
  const parts = relative.split('/')
  for (const [index, part] of parts.entries()) {
    current = join(current, part)
    const stat = await lstat(current)
    if (stat.isSymbolicLink()) throw new Error(`Symlink não permitido: ${relative}`)
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error(`Diretório inválido: ${relative}`)
  }
  return current
}
function assertCorpusPath(relative: string) {
  RelativePathSchema.parse(relative)
  const parts = relative.split('/')
  if (!(Object.hasOwn(CORPUS_ROOTS, parts[0])) || parts.some(excluded) || !relative.endsWith('.md'))
    throw new Error('Caminho fora do corpus Markdown autorizado')
}
export async function readMarkdown(root: string, relative: string): Promise<string> {
  assertCorpusPath(relative)
  const absolute = await assertRoot(root)
  const path = await assertPath(absolute, relative)
  const before = await lstat(path)
  if (!before.isFile()) throw new Error('Markdown precisa ser arquivo regular')
  if (before.size > MAX_MARKDOWN_BYTES) throw new Error('Markdown excede o limite de 1 MiB')
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const actual = await handle.stat()
    if (!actual.isFile() || actual.dev !== before.dev || actual.ino !== before.ino || await realpath(path) !== path)
      throw new Error('Arquivo alterado durante a leitura segura')
    const buffer = Buffer.alloc(MAX_MARKDOWN_BYTES + 1)
    let size = 0
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size)
      if (!bytesRead) break
      size += bytesRead
    }
    if (size > MAX_MARKDOWN_BYTES) throw new Error('Markdown excede o limite de 1 MiB')
    const after = await handle.stat()
    if (after.size !== actual.size || after.mtimeMs !== actual.mtimeMs || await realpath(path) !== path)
      throw new Error('Arquivo alterado durante a leitura segura')
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size))
  } finally { await handle.close() }
}
export async function listCorpusMarkdown(root: string): Promise<string[]> {
  const absolute = await assertRoot(root)
  const result: string[] = []
  async function walk(relative: string) {
    const path = await assertPath(absolute, relative)
    for (const item of await readdir(path, { withFileTypes: true })) {
      if (excluded(item.name)) continue
      const child = `${relative}/${item.name}`
      if (item.isSymbolicLink()) throw new Error(`Symlink não permitido: ${child}`)
      if (item.isDirectory()) await walk(child)
      else if (item.isFile() && item.name.endsWith('.md')) result.push(child)
    }
  }
  for (const name of Object.keys(CORPUS_ROOTS)) {
    try { await walk(name) } catch (error) {
      // Only an absent top-level root is an empty catalog, never a broken nested entity.
      if (!missing(error) || await lstat(join(absolute, name)).then(() => true, e => { if (missing(e)) return false; throw e })) throw error
    }
  }
  return result.sort()
}
export interface CatalogEntry { metadata: CatalogMetadata; path: string }
export async function loadCatalog(root: string): Promise<CatalogEntry[]> {
  const absolute = await assertRoot(root)
  const documents = await listCorpusMarkdown(absolute)
  const entries: CatalogEntry[] = []
  // An entity directory must identify itself, including when it contains only associated content.
  for (const [folder, kind] of Object.entries(CORPUS_ROOTS)) {
    let children
    try { children = await readdir(join(absolute, folder), { withFileTypes: true }) }
    catch (error) { if (missing(error)) continue; throw error }
    for (const child of children) {
      if (!child.isDirectory() || excluded(child.name)) continue
      SlugSchema.parse(child.name)
      const path = `${folder}/${child.name}/${kind === 'professional' ? 'perfil.md' : 'descricao.md'}`
      if (!documents.includes(path)) throw new Error(`Metadados ausentes: ${path}`)
      const { metadata } = parseFrontmatter(await readMarkdown(absolute, path))
      if (!metadata) throw new Error(`Metadados ausentes: ${path}`)
      if (metadata.kind !== kind || metadata.id !== child.name)
        throw new Error(`Identidade não corresponde ao diretório: ${path}`)
      entries.push({ metadata, path })
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path))
  CatalogSchema.parse(entries.map(entry => entry.metadata))
  return entries
}
