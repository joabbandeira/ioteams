import { resolve } from 'node:path'
import { readMarkdown } from '@ioteams/catalog'
import { GitShaSchema, KnowledgeCitationSchema, type KnowledgeCitation } from '@ioteams/core'
import { z } from 'zod'
import { connection, type KnowledgeIndex } from './database.js'
import { lexicalQuery } from './query.js'
import { readSnapshot, sha256, verifySourceContext } from './source.js'

export const IndexCatalogOptionsSchema = z.strictObject({ root: z.string().min(1), commitSha: GitShaSchema })
export type IndexCatalogOptions = z.infer<typeof IndexCatalogOptionsSchema>
export interface IndexCatalogResult { added: number; updated: number; deleted: number; unchanged: number; documents: number; commitSha: string }
export { SearchKnowledgeOptionsSchema } from './contracts.js'
export type { SearchKnowledgeOptions } from './contracts.js'
import { SearchKnowledgeOptionsSchema, type SearchKnowledgeOptions } from './contracts.js'
export interface KnowledgeSearchResult {
  status: 'evidence' | 'no_evidence'
  reason?: 'empty_index' | 'empty_query' | 'no_matches' | 'stale_sources' | 'context_limit'
  citations: KnowledgeCitation[]
}

/** Validate all input before publishing one transactional add/update/delete snapshot. */
export async function indexCatalog(index: KnowledgeIndex, input: IndexCatalogOptions): Promise<IndexCatalogResult> {
  const options = IndexCatalogOptionsSchema.parse(input)
  const state = connection(index), db = state.database
  if (state.indexing) throw new Error('Indexação em andamento')
  const existingRoot = db.prepare("SELECT value FROM metadata WHERE key = 'corpusRoot'").get()?.value
  if (existingRoot && existingRoot !== resolve(options.root)) throw new Error('Índice vinculado a outra raiz de corpus')
  state.indexing = true
  try {
    const { root, metadataHash, documents } = await readSnapshot(options.root, options.commitSha)
    const result: IndexCatalogResult = { added: 0, updated: 0, deleted: 0, unchanged: 0, documents: documents.length, commitSha: options.commitSha }
    db.exec('BEGIN IMMEDIATE')
    try {
      const boundRoot = db.prepare("SELECT value FROM metadata WHERE key = 'corpusRoot'").get()?.value
      if (boundRoot && boundRoot !== root) throw new Error('Índice vinculado a outra raiz de corpus')
      const oldDocuments = new Map(db.prepare('SELECT id, contentHash, labelsHash FROM documents').all().map(row => [row.id as string, row]))
      const removeChunks = db.prepare('DELETE FROM chunks WHERE documentId = ?')
      const removeLabels = db.prepare('DELETE FROM labels WHERE documentId = ?')
      const upsert = db.prepare(`INSERT INTO documents(id,path,kind,entityId,contentHash,commitSha,labelsHash) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET contentHash=excluded.contentHash,commitSha=excluded.commitSha,labelsHash=excluded.labelsHash,
          kind=excluded.kind,entityId=excluded.entityId`)
      const addChunk = db.prepare('INSERT INTO chunks(documentId,heading,lineStart,lineEnd,excerpt) VALUES(?,?,?,?,?)')
      const addLabel = db.prepare('INSERT INTO labels(documentId,type,value) VALUES(?,?,?)')
      for (const doc of documents) {
        const old = oldDocuments.get(doc.id)
        const changed = !old || old.contentHash !== doc.contentHash || old.labelsHash !== doc.labelsHash
        if (!old) result.added++
        else if (changed) result.updated++
        else result.unchanged++
        upsert.run(doc.id, doc.path, doc.kind, doc.entityId, doc.contentHash, options.commitSha, doc.labelsHash)
        if (changed) {
          removeChunks.run(doc.id); removeLabels.run(doc.id)
          for (const chunk of doc.chunks) addChunk.run(doc.id, chunk.heading, chunk.lineStart, chunk.lineEnd, chunk.excerpt)
          for (const [type, value] of doc.labels) addLabel.run(doc.id, type, value)
        }
        oldDocuments.delete(doc.id)
      }
      for (const id of oldDocuments.keys()) { db.prepare('DELETE FROM documents WHERE id = ?').run(id); result.deleted++ }
      db.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('corpusRoot', root)
      db.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('metadataHash', metadataHash)
      db.exec('COMMIT')
      return result
    } catch (error) { db.exec('ROLLBACK'); throw error }
  } finally { state.indexing = false }
}

/** The corpus is untrusted data. Search returns bounded, verified citations; it grants no execution authority. */
export async function searchKnowledge(index: KnowledgeIndex, input: SearchKnowledgeOptions): Promise<KnowledgeSearchResult> {
  const options = SearchKnowledgeOptionsSchema.parse(input)
  const db = connection(index).database
  const none = (reason: KnowledgeSearchResult['reason']): KnowledgeSearchResult => ({ status: 'no_evidence', reason, citations: [] })
  if (!db.prepare('SELECT 1 FROM documents LIMIT 1').get()) return none('empty_index')
  const query = lexicalQuery(options.query)
  if (!query) return none('empty_query')
  const predicates = ['chunk_fts MATCH ?'], params: string[] = [query]
  for (const column of ['kind', 'entityId'] as const) {
    if (options.filters[column]) { predicates.push(`d.${column} = ?`); params.push(options.filters[column]) }
  }
  for (const [filter, type] of [['professionId', 'profession'], ['stackId', 'stack'], ['professionalId', 'professional'], ['teamId', 'team']] as const) {
    if (options.filters[filter]) {
      predicates.push('EXISTS (SELECT 1 FROM labels l WHERE l.documentId = d.id AND l.type = ? AND l.value = ?)')
      params.push(type, options.filters[filter])
    }
  }
  const rows = db.prepare(`SELECT d.id AS documentId,d.path,d.contentHash,d.commitSha,c.heading,c.lineStart,c.lineEnd,c.excerpt
    FROM chunk_fts JOIN chunks c ON c.id = chunk_fts.rowid JOIN documents d ON d.id = c.documentId
    WHERE ${predicates.join(' AND ')} ORDER BY bm25(chunk_fts,2.0,1.0),d.path,c.lineStart LIMIT 1000`).all(...params)
  const root = db.prepare("SELECT value FROM metadata WHERE key = 'corpusRoot'").get()!.value as string
  const metadataHash = db.prepare("SELECT value FROM metadata WHERE key = 'metadataHash'").get()!.value as string
  if (rows.length && !await verifySourceContext(root, rows[0].commitSha as string, metadataHash)) return none('stale_sources')
  const sources = new Map<string, string | null>(), citations: KnowledgeCitation[] = []
  let contextChars = 2, stale = false, limited = false
  for (const row of rows) {
    const citation = KnowledgeCitationSchema.parse(row)
    if (!sources.has(citation.path)) {
      let source: string | null = null
      try { source = await readMarkdown(root, citation.path) } catch { /* Missing, denied, unsafe or changed sources are not evidence. */ }
      sources.set(citation.path, source)
    }
    const source = sources.get(citation.path)
    if (source === null || source === undefined || sha256(source) !== citation.contentHash ||
      source.split('\n').slice(citation.lineStart - 1, citation.lineEnd).join('\n') !== citation.excerpt) { stale = true; continue }
    const size = JSON.stringify(citation).length + (citations.length ? 1 : 0)
    if (contextChars + size > options.maxContextChars) { limited = true; continue }
    citations.push(citation); contextChars += size
    if (citations.length === options.topK) break
  }
  return citations.length ? { status: 'evidence', citations } : none(stale ? 'stale_sources' : limited ? 'context_limit' : 'no_matches')
}
