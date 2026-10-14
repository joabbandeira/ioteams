import { afterEach, describe, expect, it } from 'vitest'
import { transitionTask } from '@ioteams/core'
import * as storage from '@ioteams/storage'
import { project, demand, approvedPlan, sprint, taskRecord, runningTask, run, approval, event, sha } from './fixtures.js'

const opened: storage.Store[] = []
function memory() { const store = storage.openStore({ memory: true }); opened.push(store); return store }
afterEach(() => { for (const store of opened.splice(0)) store.close() })
function graph(store: storage.Store) {
  store.create('project', project)
  store.create('demand', demand)
  store.create('approvedPlan', approvedPlan)
  store.create('sprint', sprint)
  store.create('task', { ...taskRecord, state: runningTask() })
  store.create('run', run)
  store.create('approval', { ...approval, projectId: project.id })
}

describe('Store operacional', () => {
  it('persiste entidades tipadas e suas relações, snapshots e projeções de tentativas/evidências', () => {
    const store = memory(); graph(store)
    expect(store.get('project', project.id)).toEqual({ version: 1, data: project })
    expect(store.get('approvedPlan', approvedPlan.id)?.data.plan.baseSha).toBe(sha)
    expect(store.get('sprint', sprint.id)?.data.goal.objective).toBe('Entregar persistência')
    expect(store.get('task', taskRecord.id)?.data.state.status).toBe('IN_PROGRESS')
    expect(store.get('attempt', 'attempt-1')?.data.attempt.status).toBe('IN_PROGRESS')
    expect(store.get('evidence', 'evidence-1')?.data.evidence.exitCode).toBe(0)
    expect(store.get('run', run.id)?.data.status).toBe('running')
    expect(store.get('approval', approval.id)?.data.requestId).toBe('request-1')
    expect(store.list('task', project.id).map(row => row.data.id)).toEqual(['T01'])
    expect(store.list('task', 'missing')).toEqual([])
  })
  it('isola objetos lidos e valida payloads de controle sem executar texto SQL', () => {
    const store = memory()
    store.create('project', { ...project, name: "'); DROP TABLE entities; --" })
    const row = store.get('project', project.id)!
    row.data.name = 'mutado'
    expect(store.get('project', project.id)?.data.name).toBe("'); DROP TABLE entities; --")
    expect(() => store.create('project', { ...project, id: 'other', unknown: true } as never)).toThrow()
    expect(() => store.get('project', "' OR 1=1 --")).toThrow()
    expect(() => store.create('project; DROP TABLE entities' as never, project as never)).toThrow()
    expect(store.list('project')).toHaveLength(1)
  })
  it('aceita opcionais undefined dos contratos TypeScript e restaura a mesma representação persistida', () => {
    const store = memory(); store.create('project', project); store.create('demand', demand)
    const plannedTask = { ...taskRecord.state.plan, checks: taskRecord.state.plan.checks.map(check => ({ ...check, cwd: undefined })) }
    store.create('approvedPlan', { ...approvedPlan, plan: { ...approvedPlan.plan, tasks: [plannedTask] } })
    const saved = store.create('task', { ...taskRecord, sprintId: undefined, state: { ...taskRecord.state, plan: plannedTask, reason: undefined } })
    expect(store.get('task', taskRecord.id)).toEqual(saved)
    expect(saved.data.state.plan.checks[0].cwd).toBeUndefined()
  })
  it('recusa órfãos e relações entre projetos diferentes sem persistência parcial', () => {
    const store = memory()
    expect(() => store.create('demand', demand)).toThrow()
    graph(store)
    store.create('project', { ...project, id: 'other' })
    expect(() => store.create('sprint', { ...sprint, id: 'bad', projectId: 'other' })).toThrow()
    expect(() => store.create('run', { ...run, id: 'bad', taskId: 'missing' })).toThrow()
    expect(() => store.create('approval', { ...approval, id: 'bad', projectId: project.id, turnId: 'other-turn' })).toThrow()
    expect(store.get('sprint', 'bad')).toBeUndefined()
    expect(store.get('run', 'bad')).toBeUndefined()
    expect(store.get('approval', 'bad')).toBeUndefined()
  })
  it('aplica CAS e rejeita criação duplicada, versão stale e mudanças de identidade', () => {
    const store = memory(); store.create('project', project)
    expect(() => store.create('project', project)).toThrow(storage.ConflictError)
    expect(store.update('project', { ...project, name: 'novo' }, 1).version).toBe(2)
    expect(() => store.update('project', { ...project, name: 'stale' }, 1)).toThrow(storage.ConflictError)
    expect(() => store.update('project', project, 0)).toThrow()
    expect(() => store.update('project', { ...project, id: 'missing' }, 1)).toThrow(storage.ConflictError)
    expect(store.get('project', project.id)?.data.name).toBe('novo')
    graphWithoutProject(store)
    expect(() => store.update('demand', { ...demand, projectId: 'other' }, 1)).toThrow()
    expect(() => store.update('approvedPlan' as never, approvedPlan as never, 1)).toThrow()
  })
  it('faz rollback de estado, projeções, eventos e recibos como uma unidade', () => {
    const store = memory(); graph(store)
    expect(() => store.command({ id: 'cmd-fail', input: { action: 'pause' } }, tx => {
      tx.update('run', { ...run, status: 'paused' }, 1)
      tx.appendEvent(event)
      throw new Error('falha depois da escrita')
    })).toThrow('falha depois da escrita')
    expect(store.get('run', run.id)?.data.status).toBe('running')
    expect(store.eventsAfter(0)).toEqual([])
    expect(store.getReceipt('cmd-fail')).toBeUndefined()
    expect(() => store.transaction(tx => {
      tx.create('project', { ...project, id: 'rolled-back' })
      tx.transaction(nested => nested.create('demand', { ...demand, id: 'nested', projectId: 'rolled-back' }))
      throw new Error('outer')
    })).toThrow('outer')
    expect(store.get('project', 'rolled-back')).toBeUndefined()
    expect(store.get('demand', 'nested')).toBeUndefined()
  })
  it('isola falha interna de transação aninhada e proíbe callbacks assíncronos', () => {
    const store = memory()
    store.transaction(tx => {
      tx.create('project', project)
      expect(() => tx.transaction(inner => { inner.create('demand', demand); throw new Error('inner') })).toThrow('inner')
      tx.create('demand', { ...demand, id: 'kept' })
    })
    expect(store.get('demand', demand.id)).toBeUndefined()
    expect(store.get('demand', 'kept')).toBeDefined()
    expect(() => store.transaction(async tx => { tx.create('project', { ...project, id: 'async' }) })).toThrow()
    expect(store.get('project', 'async')).toBeUndefined()
  })
  it('repete recibo sem executar callback e vincula a chave à entrada canônica completa', () => {
    const store = memory(); graph(store)
    const first = store.command({ id: 'pause', input: { action: 'pause', runId: run.id } }, tx => {
      tx.update('run', { ...run, status: 'paused' }, 1)
      tx.appendEvent(event)
      return { status: 'paused', version: 2 }
    })
    expect(first).toEqual({ status: 'paused', version: 2 })
    expect(store.command({ id: 'pause', input: { runId: run.id, action: 'pause' } }, () => { throw new Error('não repetir') })).toEqual(first)
    expect(() => store.command({ id: 'pause', input: { runId: run.id, action: 'cancel' } }, () => null)).toThrow(storage.ConflictError)
    expect(store.get('run', run.id)?.version).toBe(2)
    expect(store.eventsAfter(0)).toHaveLength(1)
    expect(store.getReceipt('pause')?.result).toEqual(first)
  })
  it('rejeita resultados não JSON e reentrada do mesmo comando sem efeito parcial', () => {
    const store = memory(); store.create('project', project)
    expect(() => store.command({ id: 'bad', input: null }, tx => {
      tx.update('project', { ...project, name: 'bad' }, 1)
      return undefined as never
    })).toThrow()
    expect(store.get('project', project.id)?.version).toBe(1)
    expect(() => store.command({ id: 'recursive', input: null }, tx =>
      tx.command({ id: 'recursive', input: null }, () => 'duplicate'))).toThrow(storage.ConflictError)
    expect(store.getReceipt('recursive')).toBeUndefined()
  })
  it('mantém sequência global e pagina eventos para reconexão SSE sem duplicá-los', () => {
    const store = memory(); graph(store)
    expect(store.appendEvent(event).sequence).toBe(1)
    expect(() => store.appendEvent(event)).toThrow(storage.ConflictError)
    expect(store.appendEvent({ ...event, id: 'event-2' }).sequence).toBe(2)
    expect(store.eventsAfter(0, { limit: 1 }).map(e => e.sequence)).toEqual([1])
    expect(store.eventsAfter(1, { projectId: project.id }).map(e => e.sequence)).toEqual([2])
    expect(store.eventsAfter(0, { projectId: 'missing' })).toEqual([])
    expect(() => store.eventsAfter(-1)).toThrow()
    expect(() => store.eventsAfter(0, { limit: 0 })).toThrow()
  })
  it('preserva tentativas rejeitadas e evidências históricas ao replanejar', () => {
    const store = memory(); graph(store)
    const rejected = transitionTask(runningTask(), { target: 'REJECTED', eventId: 'reject', at: '2026-10-14T10:00:02Z', reason: 'Falha reproduzida' })
    store.update('task', { ...taskRecord, state: rejected }, 1)
    let state = rejected
    for (const target of ['TODO', 'IN_PLANNING', 'READY', 'IN_PROGRESS'] as const) state = transitionTask(state, {
      target, eventId: `retry-${target}`, at: '2026-10-14T10:00:03Z',
      ...(target === 'IN_PROGRESS' ? { execution: { mode: 'operational', attemptId: 'attempt-2', baseSha: sha } } : {}),
    })
    store.update('task', { ...taskRecord, state }, 2)
    expect(store.get('task', taskRecord.id)?.data.state.evidence).toEqual([])
    expect(store.get('attempt', 'attempt-1')?.data.attempt.reason).toBe('Falha reproduzida')
    expect(store.get('attempt', 'attempt-2')?.data.attempt.attempt).toBe(2)
    expect(store.get('evidence', 'evidence-1')?.data.evidence.attemptId).toBe('attempt-1')
    expect(() => store.update('task', taskRecord, 3)).toThrow()
    expect(store.list('attempt')).toHaveLength(2)
  })
  it('bloqueia alterações de provas, plano aprovado, vínculo de aprovação e histórico anterior', () => {
    const store = memory(); graph(store)
    const current = runningTask()
    expect(() => store.update('task', { ...taskRecord, state: { ...current,
      evidence: current.evidence.map(e => ({ ...e, exitCode: 1 })) } }, 1)).toThrow()
    expect(() => store.update('task', { ...taskRecord, state: { ...current,
      history: current.history.map(e => ({ ...e, at: '2026-10-14T09:59:59Z' })),
      attempts: current.attempts.map(a => ({ ...a, startedAt: '2026-10-14T09:59:59Z' })) } }, 1)).toThrow()
    expect(() => store.update('approval', { ...approval, projectId: project.id, requestId: 'other' }, 1)).toThrow()
    expect(() => store.create('approvedPlan', { ...approvedPlan, id: 'other' })).toThrow()
    expect(() => store.create('task', { ...taskRecord, id: 'other' })).toThrow()
    expect(store.get('task', taskRecord.id)?.version).toBe(1)
  })
  it('não aceita referências de provas inexistentes ou remove provas históricas de tentativa ativa', () => {
    const store = memory(); graph(store)
    const current = runningTask()
    const bad = { ...current, attempts: current.attempts.map(a => ({ ...a, evidenceIds: [...a.evidenceIds, 'missing-proof'] })) }
    expect(() => store.update('task', { ...taskRecord, state: bad }, 1)).toThrow()
    expect(() => store.update('task', { ...taskRecord, state: { ...current, evidence: [],
      attempts: current.attempts.map(a => ({ ...a, evidenceIds: [] })) } }, 1)).toThrow()
    expect(store.get('task', taskRecord.id)?.version).toBe(1)
    expect(store.get('attempt', 'attempt-1')?.data.attempt.evidenceIds).toEqual(['evidence-1'])
  })
  it('não permite retargetar uma sprint e invalidar os vínculos de tarefas existentes', () => {
    const store = memory(); graph(store)
    const secondPlan = { ...approvedPlan, id: 'plan-2', plan: { ...approvedPlan.plan, id: 'plan-2' } }
    store.create('approvedPlan', secondPlan)
    expect(() => store.update('sprint', { ...sprint, planId: secondPlan.id }, 1)).toThrow()
    expect(store.get('sprint', sprint.id)?.data.planId).toBe(approvedPlan.id)
  })
  it('vincula decisões à aprovação concreta e preserva a decisão terminal', () => {
    const store = memory(); graph(store)
    const request = { ...approval, projectId: project.id }
    const result = store.command({ id: 'approve', input: { id: request.id, decision: 'accept', requestId: request.requestId } }, tx => {
      const updated = tx.update('approval', { ...request, status: 'accepted' }, 1)
      tx.update('run', { ...run, status: 'running' }, 1)
      return { version: updated.version, status: updated.data.status }
    })
    expect(result).toEqual({ version: 2, status: 'accepted' })
    expect(() => store.update('approval', { ...request, status: 'declined' }, 2)).toThrow()
    expect(() => store.update('approval', request, 2)).toThrow()
    expect(store.get('approval', request.id)?.data.status).toBe('accepted')
  })
  it('fecha explicitamente, recusa uso posterior e não permite fechar durante transação', () => {
    const store = memory()
    expect(() => store.transaction(tx => tx.close())).toThrow()
    store.close(); store.close()
    expect(() => store.get('project', project.id)).toThrow()
  })
})
function graphWithoutProject(store: storage.Store) {
  store.create('demand', demand)
  store.create('approvedPlan', approvedPlan)
}
