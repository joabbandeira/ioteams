import { createHash } from 'node:crypto'
import { IdentifierSchema } from '@ioteams/core'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { canonicalJson, parseEntity, EventSchema, EntitySchemas } from './entities.js'
import type {
  CommandInput, CommandReceipt, EntityKind, EntityMap, JsonValue, MutableKind,
  StoreEvent, StoreEventInput, Versioned, WritableKind,
} from './entities.js'

export class ConflictError extends Error {
  constructor(message = 'Conflito de versão ou identidade') { super(message); this.name = 'ConflictError' }
}
function requireIntegrity(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function equal(a: unknown, b: unknown) { return canonicalJson(a) === canonicalJson(b) }
type Link = { relation: string; kind: EntityKind; id: string }

/** Synchronous unit of work. Only openStore constructs and owns the SQLite connection. */
export class Store {
  #database: DatabaseSync
  #depth = 0
  constructor(database: DatabaseSync) { this.#database = database }

  close() {
    requireIntegrity(this.#depth === 0, 'Fechamento durante transação não permitido')
    if (this.#database.isOpen) this.#database.close()
  }
  #assertOpen() { requireIntegrity(this.#database.isOpen, 'Store fechado') }

  transaction<T>(operation: (store: Store) => T): T {
    this.#assertOpen()
    requireIntegrity(operation.constructor.name !== 'AsyncFunction', 'Transações exigem callback síncrono')
    const nested = this.#depth > 0
    this.#database.exec(nested ? 'SAVEPOINT store_nested' : 'BEGIN IMMEDIATE')
    this.#depth++
    try {
      const result = operation(this)
      requireIntegrity(!result || typeof (result as { then?: unknown }).then !== 'function', 'Transações exigem resultado síncrono')
      this.#database.exec(nested ? 'RELEASE store_nested' : 'COMMIT')
      return result
    } catch (error) {
      this.#database.exec(nested ? 'ROLLBACK TO store_nested; RELEASE store_nested' : 'ROLLBACK')
      throw error
    } finally { this.#depth-- }
  }

  get<K extends EntityKind>(kind: K, id: string): Versioned<EntityMap[K]> | undefined {
    this.#assertOpen(); IdentifierSchema.parse(id)
    requireIntegrity(Object.hasOwn(EntitySchemas, kind), 'Tipo de entidade inválido')
    const row = this.#database.prepare('SELECT body,version FROM entities WHERE kind = ? AND id = ?').get(kind, id)
    return row ? { version: Number(row.version), data: parseEntity(kind, JSON.parse(String(row.body))) } : undefined
  }
  list<K extends EntityKind>(kind: K, projectId?: string): Versioned<EntityMap[K]>[] {
    this.#assertOpen()
    requireIntegrity(Object.hasOwn(EntitySchemas, kind), 'Tipo de entidade inválido')
    if (projectId !== undefined) IdentifierSchema.parse(projectId)
    const rows = this.#database.prepare(`SELECT body,version FROM entities
      WHERE kind = ? AND (? IS NULL OR project_id = ? OR (kind = 'project' AND id = ?)) ORDER BY id`)
      .all(kind, projectId ?? null, projectId ?? null, projectId ?? null)
    return rows.map(row => ({ version: Number(row.version), data: parseEntity(kind, JSON.parse(String(row.body))) }))
  }
  create<K extends WritableKind>(kind: K, input: EntityMap[K]): Versioned<EntityMap[K]> {
    requireIntegrity(kind !== ('attempt' as string) && kind !== ('evidence' as string), 'Projeções são somente leitura')
    return this.transaction(() => this.#write(kind, input))
  }
  update<K extends MutableKind>(kind: K, input: EntityMap[K], expectedVersion: number): Versioned<EntityMap[K]> {
    requireIntegrity(!['attempt', 'evidence', 'approvedPlan'].includes(kind), 'Registro imutável')
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1).parse(expectedVersion)
    return this.transaction(() => this.#write(kind, input, expectedVersion))
  }

  #write<K extends EntityKind>(kind: K, input: EntityMap[K], expectedVersion?: number): Versioned<EntityMap[K]> {
    const data = parseEntity(kind, input)
    const previous = this.get(kind, data.id)
    if (expectedVersion === undefined ? previous : !previous || previous.version !== expectedVersion) throw new ConflictError()
    if (previous) this.#validateUpdate(kind, previous.data, data)
    const links = this.#links(kind, data)
    const projectId = 'projectId' in data ? data.projectId : null
    for (const link of links) {
      const target = this.get(link.kind, link.id)
      requireIntegrity(target, 'Referência ausente')
      const targetProject = 'projectId' in target.data ? target.data.projectId : target.data.id
      requireIntegrity(targetProject === projectId, 'Referência de outro projeto')
    }
    this.#validateRelations(kind, data)
    const body = JSON.stringify(data)
    const version = (expectedVersion ?? 0) + 1
    if (expectedVersion === undefined) {
      this.#database.prepare('INSERT INTO entities(kind,id,project_id,body,version) VALUES (?,?,?,?,1)')
        .run(kind, data.id, projectId, body)
    } else {
      const result = this.#database.prepare('UPDATE entities SET body = ?, version = version + 1 WHERE kind = ? AND id = ? AND version = ?')
        .run(body, kind, data.id, expectedVersion)
      if (result.changes !== 1) throw new ConflictError()
      this.#database.prepare('DELETE FROM entity_links WHERE source_kind = ? AND source_id = ?').run(kind, data.id)
    }
    for (const link of links) this.#database.prepare(`INSERT INTO entity_links
      (source_kind,source_id,relation,target_kind,target_id) VALUES (?,?,?,?,?)`).run(kind, data.id, link.relation, link.kind, link.id)
    if (kind === 'task') this.#projectTask(data as EntityMap['task'])
    return { version, data }
  }

  #links(kind: EntityKind, data: EntityMap[EntityKind]): Link[] {
    const result: Link[] = []
    if ('projectId' in data) result.push({ relation: 'project', kind: 'project', id: data.projectId })
    if ('demandId' in data) result.push({ relation: 'demand', kind: 'demand', id: data.demandId })
    if ('planId' in data && data.planId) result.push({ relation: 'plan', kind: 'approvedPlan', id: data.planId })
    if ('sprintId' in data && data.sprintId) result.push({ relation: 'sprint', kind: 'sprint', id: data.sprintId })
    if ('taskId' in data && data.taskId) result.push({ relation: 'task', kind: 'task', id: data.taskId })
    if ('attemptId' in data && data.attemptId) result.push({ relation: 'attempt', kind: 'attempt', id: data.attemptId })
    if (kind === 'attempt') result.push({ relation: 'task', kind: 'task', id: (data as EntityMap['attempt']).attempt.taskId })
    if (kind === 'evidence') {
      const value = data as EntityMap['evidence']
      result.push({ relation: 'task', kind: 'task', id: value.evidence.taskId },
        { relation: 'attempt', kind: 'attempt', id: value.evidence.attemptId })
    }
    if (kind === 'approval') result.push({ relation: 'run', kind: 'run', id: (data as EntityMap['approval']).runId })
    return result
  }

  #validateRelations(kind: EntityKind, data: EntityMap[EntityKind]) {
    if (kind === 'task') {
      const value = data as EntityMap['task']
      if (value.planId) {
        const plan = this.get('approvedPlan', value.planId)!.data.plan
        requireIntegrity(equal(plan.tasks.find(task => task.id === value.id) ?? null, value.state.plan), 'Tarefa fora do plano aprovado')
        requireIntegrity(plan.teamId === value.state.teamId && equal(plan.definitionOfDone, value.state.definitionOfDone) &&
          plan.branch === value.state.delivery.branch && plan.remote === value.state.delivery.remote, 'Política da tarefa divergente')
      }
      if (value.sprintId) {
        const sprint = this.get('sprint', value.sprintId)!.data
        requireIntegrity(!sprint.planId || value.planId === sprint.planId, 'Sprint de outro plano')
      }
    }
    if (kind === 'run') {
      const value = data as EntityMap['run']
      if (value.taskId) requireIntegrity(this.get('task', value.taskId)!.data.planId === value.planId, 'Run de outro plano')
      if (value.attemptId) requireIntegrity(this.get('attempt', value.attemptId)!.data.attempt.taskId === value.taskId, 'Tentativa de outra tarefa')
    }
    if (kind === 'approval') {
      const value = data as EntityMap['approval']
      const run = this.get('run', value.runId)!.data
      requireIntegrity(run.threadId === value.threadId && run.turnId === value.turnId, 'Aprovação de outro turno/thread')
    }
    if (kind === 'evidence') {
      const value = data as EntityMap['evidence']
      requireIntegrity(this.get('attempt', value.evidence.attemptId)!.data.attempt.taskId === value.evidence.taskId, 'Evidência de outra tentativa')
    }
  }

  #validateUpdate(kind: EntityKind, previous: EntityMap[EntityKind], next: EntityMap[EntityKind]) {
    if ('projectId' in previous && 'projectId' in next) requireIntegrity(previous.projectId === next.projectId, 'Projeto imutável')
    if (kind === 'task') {
      const old = previous as EntityMap['task'], value = next as EntityMap['task']
      const fixed = (record: EntityMap['task']) => ({ planId: record.planId ?? null, sprintId: record.sprintId ?? null,
        mode: record.state.mode, plan: record.state.plan, teamId: record.state.teamId, requirements: record.state.requirements,
        definitionOfDone: record.state.definitionOfDone, delivery: record.state.delivery })
      requireIntegrity(equal(fixed(old), fixed(value)), 'Identidade e política de tarefa imutáveis')
      requireIntegrity(equal(old.state.history, value.state.history.slice(0, old.state.history.length)), 'Histórico não pode ser reescrito')
      requireIntegrity(value.state.attempts.length >= old.state.attempts.length, 'Tentativas não podem ser removidas')
      for (const attempt of old.state.attempts) {
        const current = value.state.attempts.find(item => item.id === attempt.id)
        requireIntegrity(current && (attempt.status === 'IN_PROGRESS' || equal(attempt, current)), 'Tentativa encerrada imutável')
      }
      for (const evidence of old.state.evidence) {
        const current = value.state.evidence.find(item => item.id === evidence.id)
        requireIntegrity(current ? equal(evidence, current) : value.state.attempts.some(a => a.id === evidence.attemptId && a.status === 'REJECTED'),
          'Evidência não pode ser alterada ou removida de tentativa válida')
      }
    }
    if (kind === 'approval') {
      const old = previous as EntityMap['approval'], value = next as EntityMap['approval']
      const { status: before, ...oldIdentity } = old, { status: after, ...newIdentity } = value
      requireIntegrity(equal(oldIdentity, newIdentity), 'Solicitação de aprovação imutável')
      requireIntegrity(before === after || (before === 'pending' && after !== 'pending'), 'Decisão de aprovação terminal')
    }
    if (kind === 'sprint') requireIntegrity((previous as EntityMap['sprint']).planId === (next as EntityMap['sprint']).planId,
      'Plano da sprint imutável')
    if (kind === 'run') requireIntegrity((previous as EntityMap['run']).planId === (next as EntityMap['run']).planId, 'Plano de run imutável')
  }

  #projectTask(value: EntityMap['task']) {
    for (const attempt of value.state.attempts) {
      const previous = this.get('attempt', attempt.id)
      const data = { id: attempt.id, projectId: value.projectId, attempt }
      if (!previous) this.#write('attempt', data)
      else if (!equal(previous.data, data)) {
        requireIntegrity(previous.data.attempt.taskId === value.id && previous.data.attempt.status === 'IN_PROGRESS', 'Tentativa histórica imutável')
        const { status: _oldStatus, evidenceIds: oldIds, reason: _oldReason, resultSha: _oldSha, ...oldIdentity } = previous.data.attempt
        const { status: _status, evidenceIds: newIds, reason: _reason, resultSha: _sha, ...identity } = attempt
        requireIntegrity(equal(oldIdentity, identity) && oldIds.every(id => newIds.includes(id)), 'Identidade e provas da tentativa imutáveis')
        this.#write('attempt', data, previous.version)
      }
    }
    for (const evidence of value.state.evidence) {
      const previous = this.get('evidence', evidence.id)
      const data = { id: evidence.id, projectId: value.projectId, evidence }
      if (!previous) this.#write('evidence', data)
      else requireIntegrity(equal(previous.data, data), 'Evidência histórica imutável')
    }
    for (const attempt of value.state.attempts) {
      for (const id of attempt.evidenceIds) {
        const evidence = this.get('evidence', id)?.data
        requireIntegrity(evidence && evidence.projectId === value.projectId && evidence.evidence.taskId === value.id &&
          evidence.evidence.attemptId === attempt.id, 'Referência de evidência ausente ou de outra tentativa')
        this.#database.prepare(`INSERT INTO entity_links(source_kind,source_id,relation,target_kind,target_id)
          VALUES ('attempt',?,?,'evidence',?) ON CONFLICT(source_kind,source_id,relation) DO NOTHING`)
          .run(attempt.id, `proof:${id}`, id)
      }
    }
  }

  appendEvent(input: StoreEventInput): StoreEvent {
    return this.transaction(() => {
      const value = EventSchema.parse(input)
      requireIntegrity(this.get('project', value.projectId), 'Projeto ausente')
      if (value.runId) requireIntegrity(this.get('run', value.runId)?.data.projectId === value.projectId, 'Run de outro projeto ou ausente')
      if (this.#database.prepare('SELECT 1 FROM events WHERE id = ?').get(value.id)) throw new ConflictError()
      const result = this.#database.prepare('INSERT INTO events(id,project_id,run_id,body) VALUES (?,?,?,?)')
        .run(value.id, value.projectId, value.runId ?? null, JSON.stringify(value))
      return { ...value, sequence: Number(result.lastInsertRowid) }
    })
  }
  eventsAfter(sequence: number, options: { projectId?: string; limit?: number } = {}): StoreEvent[] {
    this.#assertOpen()
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(sequence)
    const limit = z.number().int().min(1).max(1000).parse(options.limit ?? 100)
    if (options.projectId !== undefined) IdentifierSchema.parse(options.projectId)
    return this.#database.prepare(`SELECT sequence,body FROM events
      WHERE sequence > ? AND (? IS NULL OR project_id = ?) ORDER BY sequence LIMIT ?`)
      .all(sequence, options.projectId ?? null, options.projectId ?? null, limit)
      .map(row => ({ ...EventSchema.parse(JSON.parse(String(row.body))), sequence: Number(row.sequence) }))
  }

  getReceipt(id: string): CommandReceipt | undefined {
    this.#assertOpen(); IdentifierSchema.parse(id)
    const row = this.#database.prepare('SELECT id,input_hash,result FROM command_receipts WHERE id = ?').get(id)
    return row && row.result !== null ? { id, inputHash: String(row.input_hash), result: z.json().parse(JSON.parse(String(row.result))) } : undefined
  }
  /** Atomic database effects only. Network/process/Git effects need host reconciliation, never blind retry. */
  command(input: CommandInput, operation: (store: Store) => JsonValue): JsonValue {
    const value = z.strictObject({ id: IdentifierSchema, input: z.json() }).parse(input)
    requireIntegrity(operation.constructor.name !== 'AsyncFunction', 'Comandos exigem callback síncrono')
    const inputHash = createHash('sha256').update(canonicalJson(value.input)).digest('hex')
    return this.transaction(() => {
      const previous = this.#database.prepare('SELECT input_hash,result FROM command_receipts WHERE id = ?').get(value.id)
      if (previous) {
        if (previous.input_hash !== inputHash || previous.result === null) throw new ConflictError('Chave idempotente reutilizada ou em execução')
        return z.json().parse(JSON.parse(String(previous.result)))
      }
      this.#database.prepare('INSERT INTO command_receipts(id,input_hash,result) VALUES (?,?,NULL)').run(value.id, inputHash)
      const result = canonicalJson(operation(this))
      this.#database.prepare('UPDATE command_receipts SET result = ? WHERE id = ?').run(result, value.id)
      return JSON.parse(result) as JsonValue
    })
  }
}
