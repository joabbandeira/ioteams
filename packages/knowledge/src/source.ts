import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { CORPUS_ROOTS, isCorpusMarkdownPath, listCorpusMarkdown, loadCatalog, readMarkdown, type CatalogEntry } from '@ioteams/catalog'
import { GitShaSchema, type CatalogMetadata } from '@ioteams/core'
import { splitMarkdown, type MarkdownChunk } from './chunks.js'

const execute = promisify(execFile)
export const sha256 = (content: string) => createHash('sha256').update(content, 'utf8').digest('hex')
export interface SourceDocument {
  id: string; path: string; kind: string; entityId: string | null; contentHash: string
  labelsHash: string; labels: [string, string][]; chunks: MarkdownChunk[]
}
async function git(root: string, args: string[], maxBuffer = 1_048_576): Promise<string> {
  // Read-only plumbing; no hooks, filters, submodule commands, shell, network or project executables.
  const result = await execute('git', ['--no-replace-objects', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', root, ...args],
    { encoding: 'utf8', maxBuffer, timeout: 10_000, env: {
      PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    } })
  return result.stdout
}
function labelsFor(owner: CatalogMetadata | undefined, entries: CatalogEntry[]): [string, string][] {
  if (!owner) return []
  const labels: [string, string][] = [[owner.kind, owner.id]]
  const addProfessional = (id: string) => {
    const professional = entries.find(e => e.metadata.kind === 'professional' && e.metadata.id === id)!.metadata
    if (professional.kind !== 'professional') throw new Error('Relação inválida no catálogo')
    labels.push(['professional', id], ...professional.professionIds.map(id => ['profession', id] as [string, string]),
      ...professional.stackIds.map(id => ['stack', id] as [string, string]))
  }
  if (owner.kind === 'professional') {
    addProfessional(owner.id)
    for (const { metadata } of entries) if (metadata.kind === 'team' && metadata.members.some(m => m.professionalId === owner.id))
      labels.push(['team', metadata.id])
  }
  if (owner.kind === 'team') for (const member of owner.members) addProfessional(member.professionalId)
  return [...new Map(labels.map(label => [JSON.stringify(label), label])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
function assertNoCredentials(source: string) {
  if (/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/u.test(source))
    throw new Error('Material de credencial reconhecível no corpus; indexação recusada')
}
export async function readSnapshot(inputRoot: string, commitSha: string): Promise<{ root: string; metadataHash: string; documents: SourceDocument[] }> {
  GitShaSchema.parse(commitSha)
  const root = resolve(inputRoot)
  if ((await lstat(root)).isSymbolicLink() || await realpath(root) !== root) throw new Error('Symlink na raiz do corpus')
  if ((await git(root, ['rev-parse', '--show-toplevel'])).trim() !== root) throw new Error('Declare a raiz Git do corpus')
  if ((await git(root, ['rev-parse', '--verify', `${commitSha}^{commit}`])).trim() !== commitSha)
    throw new Error('Commit SHA não corresponde a uma revisão verificável')
  const paths = await listCorpusMarkdown(root)
  if (paths.length > 5000) throw new Error('Corpus excede limite de 5000 documentos')
  const entries = await loadCatalog(root)
  const tree = await git(root, ['ls-tree', '-r', '-z', commitSha, '--', ...Object.keys(CORPUS_ROOTS)], 4_194_304)
  const blobs = new Map(tree.split('\0').filter(Boolean).map(record => {
    const separator = record.indexOf('\t'), [mode, type, oid] = record.slice(0, separator).split(' ')
    return [record.slice(separator + 1), { mode, type, oid }]
  }))
  const committedPaths = [...blobs.keys()].filter(isCorpusMarkdownPath).sort()
  if (JSON.stringify(paths) !== JSON.stringify(committedPaths)) throw new Error('Lista de documentos difere do commit; atualize a revisão do corpus')
  const documents: SourceDocument[] = []
  let bytes = 0, chunks = 0
  for (const path of paths) {
    const source = await readMarkdown(root, path)
    bytes += Buffer.byteLength(source)
    if (bytes > 33_554_432) throw new Error('Corpus excede limite total de 32 MiB')
    assertNoCredentials(source)
    const blob = blobs.get(path)
    if (!blob || blob.type !== 'blob' || !['100644', '100755'].includes(blob.mode)) throw new Error('Documento não pertence ao commit autorizado')
    const contentHash = sha256(source)
    if (sha256(await git(root, ['cat-file', 'blob', blob.oid], 1_048_577)) !== contentHash)
      throw new Error('Documento difere do commit; atualize a revisão do corpus')
    const owner = entries.find(entry => path.startsWith(`${entry.path.slice(0, entry.path.lastIndexOf('/'))}/`))?.metadata
    const labels = labelsFor(owner, entries)
    const sections = splitMarkdown(source)
    chunks += sections.length
    if (chunks > 20_000) throw new Error('Corpus excede limite total de trechos')
    documents.push({ id: `doc-${sha256(path)}`, path, kind: CORPUS_ROOTS[path.split('/')[0] as keyof typeof CORPUS_ROOTS],
      entityId: owner?.id ?? null, contentHash, labelsHash: sha256(JSON.stringify(labels)), labels, chunks: sections })
  }
  // Every catalog metadata read must be the same snapshot as the document used for its labels.
  const verified = await loadCatalog(root)
  if (JSON.stringify(entries) !== JSON.stringify(verified)) throw new Error('Metadados alterados durante a indexação')
  return { root, metadataHash: sha256(JSON.stringify(entries)), documents }
}

/** The selected commit must still exist and relation metadata must still match the indexed snapshot. */
export async function verifySourceContext(root: string, commitSha: string, metadataHash: string): Promise<boolean> {
  try {
    if (await realpath(root) !== root) return false
    if ((await git(root, ['rev-parse', '--show-toplevel'])).trim() !== root ||
      (await git(root, ['rev-parse', '--verify', `${GitShaSchema.parse(commitSha)}^{commit}`])).trim() !== commitSha) return false
    return sha256(JSON.stringify(await loadCatalog(root))) === metadataHash
  } catch { return false }
}
