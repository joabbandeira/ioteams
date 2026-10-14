import { closeSync, lstatSync, openSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { Store } from './store.js'
import { APPLICATION_ID, migrate } from './migrations.js'

export type OpenStoreOptions = { memory: true } | { directory: string; checkoutRoots: readonly string[] }
const OptionsSchema = z.union([
  z.strictObject({ memory: z.literal(true) }),
  z.strictObject({ directory: z.string().min(1), checkoutRoots: z.array(z.string().min(1)).min(1) }),
])
function inside(root: string, path: string) {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}
function checkApplication(database: DatabaseSync) {
  if (database.prepare('PRAGMA application_id').get()!.application_id !== APPLICATION_ID)
    throw new Error('Arquivo não pertence ao armazenamento operacional ioteams')
}
function existingFile(path: string) {
  try { return lstatSync(path) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}

/** Disk storage is opt-in in an existing, dedicated directory outside all supplied checkouts. */
export function openStore(input: OpenStoreOptions): Store {
  const options = OptionsSchema.parse(input)
  let filename = ':memory:'
  let fresh = true
  if (!('memory' in options)) {
    if (!isAbsolute(options.directory) || !options.checkoutRoots.length) throw new Error('Declare diretório absoluto e checkouts protegidos')
    const directory = realpathSync(options.directory)
    if (!lstatSync(directory).isDirectory()) throw new Error('Diretório operacional inválido')
    for (const checkout of options.checkoutRoots) {
      if (!isAbsolute(checkout)) throw new Error('Checkout exige caminho absoluto')
      if (inside(realpathSync(checkout), directory)) throw new Error('Banco operacional deve ficar fora do checkout')
    }
    filename = join(directory, 'operations.sqlite')
    const stat = existingFile(filename)
    for (const auxiliary of [`${filename}-wal`, `${filename}-shm`, `${filename}-journal`]) {
      const sidecar = existingFile(auxiliary)
      if (sidecar && (!sidecar.isFile() || sidecar.isSymbolicLink() || sidecar.nlink !== 1))
        throw new Error('Arquivos auxiliares exigem arquivos regulares, sem links')
      if (sidecar && !stat) throw new Error('Arquivos auxiliares sem banco identificado')
    }
    if (stat) {
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Banco exige arquivo regular exclusivo, sem links')
      // Inspect unknown databases read-only before any migration, journal or write pragma.
      const probe = new DatabaseSync(filename, { readOnly: true })
      try { checkApplication(probe) } finally { probe.close() }
      fresh = false
    } else closeSync(openSync(filename, 'wx', 0o600))
  }
  const database = new DatabaseSync(filename, { enableForeignKeyConstraints: true, allowExtension: false, timeout: 1000 })
  try {
    if (fresh) database.exec('PRAGMA application_id = 1229935699')
    else checkApplication(database)
    database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL')
    migrate(database)
    return new Store(database)
  } catch (error) { database.close(); throw error }
}
