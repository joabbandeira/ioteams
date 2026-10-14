import { closeSync, lstatSync, openSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { sha256 } from './source.js'

export type OpenKnowledgeOptions = { memory: true } | { directory: string; checkoutRoots: readonly string[] }
export interface KnowledgeIndex { close(): void }
interface Connection { database: DatabaseSync; indexing: boolean; closed: boolean }
const connections = new WeakMap<KnowledgeIndex, Connection>()
const APPLICATION_ID = 0x494f4b4e
const schema = `
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE documents (
  id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, entityId TEXT,
  contentHash TEXT NOT NULL, commitSha TEXT NOT NULL, labelsHash TEXT NOT NULL
) STRICT;
CREATE TABLE labels (
  documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  type TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (documentId, type, value)
) STRICT;
CREATE INDEX labels_lookup ON labels(type, value, documentId);
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY, documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  heading TEXT NOT NULL, lineStart INTEGER NOT NULL CHECK(lineStart > 0),
  lineEnd INTEGER NOT NULL CHECK(lineEnd >= lineStart), excerpt TEXT NOT NULL
) STRICT;
CREATE INDEX chunks_document ON chunks(documentId);
CREATE VIRTUAL TABLE chunk_fts USING fts5(heading, excerpt, content='chunks', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER chunks_insert AFTER INSERT ON chunks BEGIN
  INSERT INTO chunk_fts(rowid, heading, excerpt) VALUES(new.id, new.heading, new.excerpt);
END;
CREATE TRIGGER chunks_delete AFTER DELETE ON chunks BEGIN
  INSERT INTO chunk_fts(chunk_fts, rowid, heading, excerpt) VALUES('delete', old.id, old.heading, old.excerpt);
END;
`
const OptionsSchema = z.union([
  z.strictObject({ memory: z.literal(true) }),
  z.strictObject({ directory: z.string().min(1), checkoutRoots: z.array(z.string().min(1)).min(1) }),
])
const exists = (path: string) => {
  try { return lstatSync(path) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}
function checkIdentity(db: DatabaseSync) {
  if (db.prepare('PRAGMA application_id').get()!.application_id !== APPLICATION_ID)
    throw new Error('Arquivo não pertence ao índice de conhecimento ioteams')
  if (db.prepare('PRAGMA user_version').get()!.user_version !== 1 ||
    db.prepare("SELECT value FROM metadata WHERE key = 'schemaHash'").get()?.value !== sha256(schema))
    throw new Error('Versão/esquema do índice incompatível')
}
export function connection(index: KnowledgeIndex): Connection {
  const state = connections.get(index)
  if (!state || state.closed) throw new Error('Índice de conhecimento fechado ou inválido')
  return state
}
/** Opt-in, dedicated storage. The operational Store and arbitrary SQLite files are never opened for writes. */
export function openKnowledge(input: OpenKnowledgeOptions): KnowledgeIndex {
  const options = OptionsSchema.parse(input)
  let filename = ':memory:', fresh = true
  if (!('memory' in options)) {
    if (!isAbsolute(options.directory)) throw new Error('Declare diretório absoluto para o índice')
    const directory = realpathSync(options.directory)
    if (directory !== options.directory || !lstatSync(directory).isDirectory()) throw new Error('Diretório do índice inválido ou symlink')
    for (const checkout of options.checkoutRoots) {
      if (!isAbsolute(checkout)) throw new Error('Checkout exige caminho absoluto')
      const rel = relative(realpathSync(checkout), directory)
      if (rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)))
        throw new Error('Índice deve ficar fora do checkout')
    }
    filename = join(directory, 'knowledge.sqlite')
    const stat = exists(filename)
    for (const auxiliary of [`${filename}-wal`, `${filename}-shm`, `${filename}-journal`]) {
      const sidecar = exists(auxiliary)
      if (sidecar && (!sidecar.isFile() || sidecar.isSymbolicLink() || sidecar.nlink !== 1 || !stat))
        throw new Error('Arquivo auxiliar do índice inválido ou sem banco identificado')
    }
    if (stat) {
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Índice exige arquivo regular exclusivo, sem links')
      const probe = new DatabaseSync(filename, { readOnly: true, allowExtension: false })
      try { checkIdentity(probe) } finally { probe.close() }
      fresh = false
    } else closeSync(openSync(filename, 'wx', 0o600))
  }
  const database = new DatabaseSync(filename, { enableForeignKeyConstraints: true, allowExtension: false, timeout: 1000 })
  try {
    database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL')
    if (fresh) {
      database.exec('BEGIN IMMEDIATE')
      try {
        database.exec(schema)
        database.prepare('INSERT INTO metadata VALUES (?, ?)').run('schemaHash', sha256(schema))
        database.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = 1; COMMIT`)
      } catch (error) { database.exec('ROLLBACK'); throw error }
    } else checkIdentity(database)
    if (database.prepare('PRAGMA quick_check').get()!.quick_check !== 'ok' || database.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Integridade do índice inválida')
    const state = { database, indexing: false, closed: false }
    const handle: KnowledgeIndex = Object.freeze({ close() {
      if (state.closed) return
      if (state.indexing) throw new Error('Indexação em andamento')
      database.close(); state.closed = true
    } })
    connections.set(handle, state)
    return handle
  } catch (error) { database.close(); throw error }
}
