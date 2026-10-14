import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, lstatSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { spawnSync } from 'node:child_process'
import { openStore, ConflictError } from '@ioteams/storage'
import type { Store } from '@ioteams/storage'
import { project, demand, approvedPlan, sprint, taskRecord, runningTask, run, approval, event } from '../../unit/storage/fixtures.js'

const owned: string[] = [], opened: Store[] = []
afterEach(() => {
  for (const store of opened.splice(0)) store.close()
  for (const directory of owned.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function location() {
  const root = mkdtempSync(join(tmpdir(), 'ioteams-storage-T08-')); owned.push(root)
  const directory = join(root, 'product'), checkout = join(root, 'checkout')
  mkdirSync(directory); mkdirSync(checkout)
  return { root, directory, checkout, filename: join(directory, 'operations.sqlite'), checkoutRoots: [checkout] }
}
function fileOptions(where: { directory: string; checkoutRoots: string[] }) {
  return { directory: where.directory, checkoutRoots: where.checkoutRoots }
}
function disk(where = location()) { const store = openStore(fileOptions(where)); opened.push(store); return { ...where, store } }

describe('SQLite operacional em diretório descartável', () => {
  it('restaura o grafo inteiro, versões, provas, sequência e recibos após reiniciar', () => {
    const where = disk(), { store } = where
    store.command({ id: 'initialize', input: { project: project.id } }, tx => {
      tx.create('project', project); tx.create('demand', demand); tx.create('approvedPlan', approvedPlan)
      tx.create('sprint', sprint); tx.create('task', { ...taskRecord, state: runningTask() }); tx.create('run', run)
      tx.create('approval', { ...approval, projectId: project.id }); tx.appendEvent(event)
      return { runId: run.id }
    })
    store.close()
    const restarted = disk(where).store
    expect(restarted.command({ id: 'initialize', input: { project: project.id } }, () => { throw new Error('efeito duplicado') })).toEqual({ runId: run.id })
    expect(restarted.get('task', taskRecord.id)?.data.state.attempts[0].evidenceIds).toEqual(['evidence-1'])
    expect(restarted.get('evidence', 'evidence-1')?.data.evidence.exitCode).toBe(0)
    expect(restarted.get('approval', approval.id)?.data.status).toBe('pending')
    expect(restarted.get('run', run.id)?.version).toBe(1)
    expect(restarted.appendEvent({ ...event, id: 'after-restart' }).sequence).toBe(2)
    expect(restarted.eventsAfter(1).map(e => e.id)).toEqual(['after-restart'])
    expect(lstatSync(where.filename).mode & 0o777).toBe(0o600)
  })
  it('observa CAS entre conexões independentes sem sobrescrever a versão vencedora', () => {
    const first = disk(); first.store.create('project', project)
    const second = disk(first).store
    const stale = second.get('project', project.id)!
    first.store.update('project', { ...project, name: 'vencedor' }, 1)
    expect(() => second.update('project', { ...stale.data, name: 'perdedor' }, stale.version)).toThrow(ConflictError)
    expect(second.get('project', project.id)).toEqual({ version: 2, data: { ...project, name: 'vencedor' } })
    first.store.command({ id: 'once', input: null }, () => ({ ok: true }))
    expect(second.command({ id: 'once', input: null }, () => { throw new Error('duplicado') })).toEqual({ ok: true })
  })
  it('faz upgrade transacional de versão anterior preservando dados e detecta adulteração', () => {
    const where = disk(); where.store.create('project', project); where.store.close()
    const legacy = new DatabaseSync(where.filename)
    legacy.exec('DROP TABLE events; DROP TABLE command_receipts; DELETE FROM schema_migrations WHERE version = 2; PRAGMA user_version = 1')
    legacy.close()
    const upgraded = disk(where).store
    expect(upgraded.get('project', project.id)?.data.name).toBe('ioteams')
    upgraded.command({ id: 'migrated', input: null }, () => 'ok'); upgraded.close()
    const corrupted = new DatabaseSync(where.filename)
    corrupted.prepare('UPDATE schema_migrations SET checksum = ? WHERE version = 1').run('modified')
    corrupted.close()
    expect(() => openStore(fileOptions(where))).toThrow('Checksum')
  })
  it('reverte DDL e histórico quando uma migração falha e recusa versões futuras', () => {
    const where = disk(); where.store.create('project', project); where.store.close()
    const legacy = new DatabaseSync(where.filename)
    legacy.exec(`DROP TABLE events; DROP TABLE command_receipts; DELETE FROM schema_migrations WHERE version = 2;
      PRAGMA user_version = 1; CREATE TABLE command_receipts (unrelated TEXT)`)
    legacy.close()
    expect(() => openStore(fileOptions(where))).toThrow()
    const inspect = new DatabaseSync(where.filename)
    expect(inspect.prepare("SELECT name FROM sqlite_schema WHERE name = 'events'").get()).toBeUndefined()
    expect(inspect.prepare('PRAGMA user_version').get()?.user_version).toBe(1)
    expect(inspect.prepare('SELECT count(*) AS n FROM schema_migrations').get()?.n).toBe(1)
    inspect.exec('PRAGMA user_version = 999'); inspect.close()
    expect(() => openStore(fileOptions(where))).toThrow('mais recente')
  })
  it('mantém foreign keys e rejeita referências órfãs mesmo em escrita SQL direta', () => {
    const where = disk(); where.store.create('project', project)
    const inspect = new DatabaseSync(where.filename)
    expect(() => inspect.prepare('INSERT INTO entities(kind,id,project_id,body,version) VALUES (?,?,?,?,?)')
      .run('demand', 'orphan', 'missing', JSON.stringify({ ...demand, id: 'orphan', projectId: 'missing' }), 1)).toThrow()
    expect(() => inspect.prepare('INSERT INTO entity_links VALUES (?,?,?,?,?)')
      .run('project', project.id, 'invalid', 'run', 'missing')).toThrow()
    expect(inspect.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    inspect.close()
  })
  it('recupera após processo interrompido dentro de transação sem estado ou recibo parciais', () => {
    const where = disk(); where.store.create('project', project); where.store.close()
    const script = join(where.root, 'interrupted.mjs')
    writeFileSync(script, `import { DatabaseSync } from 'node:sqlite';
      const db = new DatabaseSync(process.argv[2]);
      db.exec('BEGIN IMMEDIATE');
      db.prepare('UPDATE entities SET version = 2 WHERE kind = ? AND id = ?').run('project', 'ioteams');
      db.prepare('INSERT INTO command_receipts VALUES (?,?,?)').run('interrupted', 'hash', 'null');
      process.exit(23);`)
    const child = spawnSync(process.execPath, [script, where.filename], { encoding: 'utf8' })
    expect(child.status).toBe(23)
    const restarted = disk(where).store
    expect(restarted.get('project', project.id)?.version).toBe(1)
    expect(restarted.getReceipt('interrupted')).toBeUndefined()
  })
  it('recusa diretórios dentro do checkout, links e bancos sem identidade do produto', () => {
    const where = location()
    expect(() => openStore({ directory: where.checkout, checkoutRoots: where.checkoutRoots })).toThrow('fora do checkout')
    symlinkSync(where.checkout, join(where.root, 'alias'))
    expect(() => openStore({ directory: join(where.root, 'alias'), checkoutRoots: where.checkoutRoots })).toThrow()
    expect(() => openStore({ directory: 'relative', checkoutRoots: where.checkoutRoots })).toThrow()
    expect(() => openStore({ directory: where.directory, checkoutRoots: [] })).toThrow()
    const foreign = new DatabaseSync(where.filename)
    foreign.exec('CREATE TABLE unrelated (id TEXT)'); foreign.close()
    const before = readFileSync(where.filename)
    expect(() => openStore(fileOptions(where))).toThrow('não pertence')
    expect(readFileSync(where.filename)).toEqual(before)
    const linked = location()
    symlinkSync(where.filename, linked.filename)
    expect(() => openStore(fileOptions(linked))).toThrow('sem links')
  })
  it('recusa links em arquivos auxiliares antes de abrir o banco', () => {
    const where = location()
    const target = join(where.root, 'unrelated')
    writeFileSync(target, 'preservar')
    symlinkSync(target, `${where.filename}-wal`)
    expect(() => openStore(fileOptions(where))).toThrow('sem links')
    expect(readFileSync(target, 'utf8')).toBe('preservar')
  })
  it('recusa opções de abertura desconhecidas e auxiliares sem banco identificado', () => {
    const where = location()
    expect(() => openStore({ memory: false } as never)).toThrow()
    expect(() => openStore({ memory: true, directory: where.directory } as never)).toThrow()
    writeFileSync(`${where.filename}-wal`, 'auxiliar desconhecido')
    expect(() => openStore(fileOptions(where))).toThrow('sem banco identificado')
    expect(readFileSync(`${where.filename}-wal`, 'utf8')).toBe('auxiliar desconhecido')
  })
})
