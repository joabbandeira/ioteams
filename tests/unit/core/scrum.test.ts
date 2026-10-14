import { describe, expect, it } from 'vitest'
import * as core from '@ioteams/core'
import { check, evidence, sha, task } from '../../fixtures/contracts.js'

const tree = 'c'.repeat(40)
const commit = 'd'.repeat(40)
const professional = { version: 1, kind: 'professional', id: 'bia-martins', name: 'Bia', fictitious: true, professionIds: ['frontend'], stackIds: ['react', 'git'] }
const team = { version: 1, kind: 'team', id: 'lisa', name: 'LISA', members: [
  { professionalId: 'bia-martins', role: 'Developer' },
  { professionalId: 'helena-costa', role: 'Product Owner' },
  { professionalId: 'marcos-lima', role: 'Scrum Master' },
] }
const input = {
  mode: 'operational', task, professional, team,
  requirements: { professionIds: ['frontend'], stackIds: ['react'] },
  definitionOfDone: ['Qualidade compartilhada'], delivery: { pushRequired: true, branch: 'develop', remote: 'origin' },
}
const at = '2026-10-14T10:00:00.000Z'
function move(state: core.ScrumTask, target: core.TaskStatus, extra: Record<string, unknown> = {}) {
  const eventAt = new Date(Math.max(Date.parse(at), ...state.history.map(entry => Date.parse(entry.at)),
    ...state.evidence.map(record => Date.parse(record.finishedAt)))).toISOString()
  return core.transitionTask(state, { target, eventId: `event-${state.history.length + 1}`, at: eventAt, ...extra })
}
function ready(mode = 'operational') {
  return move(move(core.createTask({ ...input, mode }), 'IN_PLANNING'), 'READY')
}
function running(mode = 'operational') {
  return move(ready(mode), 'IN_PROGRESS', { execution: mode === 'operational'
    ? { mode, attemptId: 'attempt-1', baseSha: sha } : { mode, attemptId: 'attempt-1' } })
}
const hostEvidence = { ...evidence, taskId: task.id, attemptId: 'attempt-1', testedTreeHash: tree }
function validated() { return core.recordHostEvidence(running(), hostEvidence) }
const completion = {
  mode: 'operational', acceptanceMet: task.acceptanceCriteria, definitionOfDoneMet: input.definitionOfDone,
  review: { taskId: task.id, attemptId: 'attempt-1', testedTreeHash: tree, approved: true },
  commit: { sha: commit, treeHash: tree }, remote: { name: 'origin', branch: 'develop', sha: commit },
}
const simulated = {
  mode: 'demo', acceptanceMet: task.acceptanceCriteria, definitionOfDoneMet: input.definitionOfDone,
  simulatedChecks: [true], simulatedReview: true, simulatedIntegrated: true,
}

describe('criação de tarefas Scrum', () => {
  it('cria TODO sem executar ou alterar dados de catálogo/plano', () => {
    const before = structuredClone(input)
    const result = core.createTask(input)
    expect(result.status).toBe('TODO')
    expect(result.plan).toEqual(task)
    expect(result.attempts).toEqual([])
    expect(result.evidence).toEqual([])
    expect(input).toEqual(before)
  })
  it.each([
    { professional: { ...professional, id: 'unknown' } },
    { professional: { ...professional, professionIds: ['qa'] } },
    { professional: { ...professional, stackIds: ['git'] } },
    { requirements: { professionIds: [], stackIds: [] } },
    { requirements: { professionIds: ['frontend', 'qa'], stackIds: [] } },
    { task: { ...task, professionalId: 'helena-costa' }, professional: { ...professional, id: 'helena-costa' } },
    { task: { ...task, professionalId: 'marcos-lima' }, professional: { ...professional, id: 'marcos-lima' } },
    { task: { ...task, checks: [] } }, { definitionOfDone: [] }, { definitionOfDone: ['   '] },
    { definitionOfDone: ['Qualidade', 'Qualidade'] },
    { task: { ...task, acceptanceCriteria: ['Aceite', 'Aceite'] } },
    { command: 'execute' },
  ])('recusa owner incompatível ou controle inválido: %j', invalid => {
    expect(() => core.createTask({ ...input, ...invalid })).toThrow()
  })
})

describe('máquina de estados', () => {
  const sources = ['TODO', 'IN_PLANNING', 'READY', 'BLOCKED', 'IN_PROGRESS', 'REJECTED', 'DONE'] as const
  // Expectations are the approved matrix, independently enumerated.
  const allowed: Record<core.TaskStatus, readonly core.TaskStatus[]> = {
    TODO: ['IN_PLANNING'], IN_PLANNING: ['READY', 'TODO'], READY: ['IN_PROGRESS', 'BLOCKED'],
    BLOCKED: ['READY'], IN_PROGRESS: ['DONE', 'REJECTED'], REJECTED: ['TODO'], DONE: [],
  }
  function source(status: core.TaskStatus) {
    if (status === 'TODO') return core.createTask(input)
    if (status === 'IN_PLANNING') return move(core.createTask(input), status)
    if (status === 'READY') return ready()
    if (status === 'BLOCKED') return move(ready(), status, { reason: 'Dependência indisponível' })
    if (status === 'IN_PROGRESS') return validated()
    if (status === 'REJECTED') return move(validated(), status, { reason: 'Falha de aceitação' })
    return move(validated(), 'DONE', { completion })
  }
  for (const from of sources) for (const target of sources) {
    it(`${from} → ${target} ${allowed[from].includes(target) ? 'permitida' : 'recusada'}`, () => {
      const state = source(from)
      const before = structuredClone(state)
      const command = { reason: ['BLOCKED', 'REJECTED'].includes(target) ? 'Motivo verificável' : undefined,
        execution: target === 'IN_PROGRESS' ? { mode: 'operational', attemptId: 'attempt-1', baseSha: sha } : undefined,
        completion: target === 'DONE' ? completion : undefined }
      if (allowed[from].includes(target)) {
        const result = move(state, target, command)
        expect(result.status).toBe(target)
        expect(result.history.at(-1)).toMatchObject({ from, to: target })
      } else expect(() => move(state, target, command)).toThrow()
      expect(state).toEqual(before)
    })
  }
  it.each(['', ' ', '\n\t'])('exige motivo não vazio: %j', reason => {
    expect(() => move(ready(), 'BLOCKED', { reason })).toThrow()
    expect(() => move(running(), 'REJECTED', { reason })).toThrow()
  })
  it('preserva motivo ao desbloquear e rejeita aliases/controles no comando', () => {
    const blocked = move(ready(), 'BLOCKED', { reason: '  Falta acesso  ' })
    expect(move(blocked, 'READY').reason).toBe('Falta acesso')
    expect(() => core.transitionTask(ready(), { target: 'PROGRESS', eventId: 'e', at })).toThrow()
    expect(() => move(ready(), 'IN_PROGRESS', { execute: true })).toThrow()
    expect(() => move(ready(), 'IN_PROGRESS')).toThrow()
    expect(() => move(ready(), 'IN_PROGRESS', { execution: { mode: 'demo', attemptId: 'a' } })).toThrow()
  })
  it('recusa IDs de eventos duplicados e contexto de execução fora de início', () => {
    const state = ready()
    expect(() => core.transitionTask(state, { target: 'BLOCKED', eventId: state.history[0].id, at, reason: 'Acesso' })).toThrow()
    expect(() => move(state, 'BLOCKED', { reason: 'Acesso', execution: { mode: 'operational', attemptId: 'a', baseSha: sha } })).toThrow()
  })
})

describe('rejeição e tentativas', () => {
  it('arquiva tentativa e motivo, invalida evidências e impede reutilização no replanejamento', () => {
    const original = validated()
    const rejected = move(original, 'REJECTED', { reason: ' Falha reproduzida ' })
    const replanned = move(rejected, 'TODO')
    expect(replanned.plan.id).toBe(task.id)
    expect(replanned.reason).toBe('Falha reproduzida')
    expect(replanned.history.slice(0, original.history.length)).toEqual(original.history)
    expect(replanned.attempts[0]).toMatchObject({ id: 'attempt-1', attempt: 1, status: 'REJECTED', evidenceIds: ['evidence-1'], reason: 'Falha reproduzida' })
    expect(rejected.evidence).toEqual([])
    expect(replanned.evidence).toEqual([])
    expect(replanned.completion).toBeUndefined()
    const second = move(move(move(replanned, 'IN_PLANNING'), 'READY'), 'IN_PROGRESS', {
      execution: { mode: 'operational', attemptId: 'attempt-2', baseSha: commit },
    })
    expect(second.attempts.at(-1)).toMatchObject({ id: 'attempt-2', attempt: 2, evidenceIds: [] })
    expect(() => core.recordHostEvidence(second, hostEvidence)).toThrow()
    expect(() => move(second, 'DONE', { completion })).toThrow()
    expect(original.evidence).toEqual([hostEvidence])
  })
  it('limita execução a três tentativas sem duplicar IDs anteriores', () => {
    let state = running()
    for (let n = 1; n <= 3; n++) {
      state = move(move(move(move(state, 'REJECTED', { reason: 'Teste falhou' }), 'TODO'), 'IN_PLANNING'), 'READY')
      expect(() => move(state, 'IN_PROGRESS', { execution: { mode: 'operational', attemptId: 'attempt-1', baseSha: sha } })).toThrow()
      if (n < 3) state = move(state, 'IN_PROGRESS', { execution: { mode: 'operational', attemptId: `attempt-${n + 1}`, baseSha: sha } })
    }
    expect(() => move(state, 'IN_PROGRESS', { execution: { mode: 'operational', attemptId: 'attempt-4', baseSha: sha } })).toThrow()
    expect(state.attempts).toHaveLength(3)
  })
})

describe('evidência do host e DONE operacional', () => {
  it('conclui somente a tarefa e tentativa validadas com commit e remote exatos', () => {
    const done = move(validated(), 'DONE', { completion })
    expect(done.status).toBe('DONE')
    expect(done.attempts[0]).toMatchObject({ status: 'DONE', resultSha: commit, evidenceIds: ['evidence-1'] })
    expect(done.completion).toEqual(completion)
  })
  it.each([
    { taskId: 'other' }, { attemptId: 'old' }, { command: { ...check, args: ['run', 'other'] } },
    { command: { ...check, timeoutMs: 1 } }, { contentHash: 'invalid' }, { source: 'model' },
  ])('recusa evidência estranha à tarefa ou controle: %j', invalid => {
    expect(() => core.recordHostEvidence(running(), { ...hostEvidence, ...invalid })).toThrow()
  })
  it('não coleta evidências fora da execução nem duplica IDs', () => {
    expect(() => core.recordHostEvidence(ready(), hostEvidence)).toThrow()
    expect(() => core.recordHostEvidence(validated(), hostEvidence)).toThrow()
  })
  it.each([
    { acceptanceMet: [] }, { acceptanceMet: ['Outro critério'] }, { acceptanceMet: [...task.acceptanceCriteria, ...task.acceptanceCriteria] },
    { definitionOfDoneMet: [] }, { definitionOfDoneMet: ['Outro DoD'] },
    { review: { ...completion.review, approved: false } }, { review: { ...completion.review, attemptId: 'old' } },
    { review: { ...completion.review, taskId: 'other' } }, { review: { ...completion.review, testedTreeHash: sha } },
    { commit: { ...completion.commit, treeHash: sha } }, { commit: { ...completion.commit, sha: 'invalid' } },
    { remote: undefined }, { remote: { ...completion.remote, name: 'fork' } },
    { remote: { ...completion.remote, branch: 'main' } }, { remote: { ...completion.remote, sha } },
    { source: 'model' },
  ])('recusa conclusão incompleta ou stale: %j', invalid => {
    expect(() => move(validated(), 'DONE', { completion: { ...completion, ...invalid } })).toThrow()
  })
  it('recusa checks ausentes, incompletos, falhos ou executados em outra árvore/commit', () => {
    expect(() => move(running(), 'DONE', { completion })).toThrow()
    const secondCheck = { ...check, args: ['run', 'typecheck'] }
    const two = core.createTask({ ...input, task: { ...task, checks: [check, secondCheck] } })
    const started = move(move(move(two, 'IN_PLANNING'), 'READY'), 'IN_PROGRESS', { execution: { mode: 'operational', attemptId: 'attempt-1', baseSha: sha } })
    expect(() => move(core.recordHostEvidence(started, hostEvidence), 'DONE', { completion })).toThrow()
    for (const invalid of [{ exitCode: 1 }, { testedTreeHash: sha }, { commitSha: sha }]) {
      expect(() => move(core.recordHostEvidence(running(), { ...hostEvidence, ...invalid }), 'DONE', { completion })).toThrow()
    }
  })
  it('aceita evidência vinculada só ao commit e não exige push não aprovado', () => {
    const state = core.createTask({ ...input, delivery: { ...input.delivery, pushRequired: false } })
    const started = move(move(move(state, 'IN_PLANNING'), 'READY'), 'IN_PROGRESS', { execution: { mode: 'operational', attemptId: 'attempt-1', baseSha: sha } })
    const { testedTreeHash: _, ...byCommit } = hostEvidence
    const verified = core.recordHostEvidence(started, { ...byCommit, commitSha: commit })
    const { remote: _remote, ...local } = completion
    expect(move(verified, 'DONE', { completion: local }).status).toBe('DONE')
  })
  it('exige todos os checks distintos e permite ordem de registro diferente do plano', () => {
    const secondCheck = { ...check, args: ['run', 'typecheck'] }
    const initial = core.createTask({ ...input, task: { ...task, checks: [check, secondCheck] } })
    const started = move(move(move(initial, 'IN_PLANNING'), 'READY'), 'IN_PROGRESS', {
      execution: { mode: 'operational', attemptId: 'attempt-1', baseSha: sha },
    })
    const first = core.recordHostEvidence(started, { ...hostEvidence, id: 'types', command: secondCheck })
    const verified = core.recordHostEvidence(first, hostEvidence)
    expect(move(verified, 'DONE', { completion }).status).toBe('DONE')
    expect(verified.attempts[0].evidenceIds).toEqual(['types', 'evidence-1'])
  })
})

describe('demo isolada', () => {
  it('usa somente marcações simuladas e não aceita evidência/execução operacional', () => {
    const state = running('demo')
    const done = move(state, 'DONE', { completion: simulated })
    expect(done.mode).toBe('demo')
    expect(done.attempts[0].baseSha).toBeUndefined()
    expect(done.attempts[0].resultSha).toBeUndefined()
    expect(done.evidence).toEqual([])
    expect(() => core.recordHostEvidence(state, hostEvidence)).toThrow()
    expect(() => move(state, 'DONE', { completion })).toThrow()
    expect(() => move(validated(), 'DONE', { completion: simulated })).toThrow()
    expect(() => move(ready('demo'), 'IN_PROGRESS', { execution: { mode: 'operational', attemptId: 'a', baseSha: sha } })).toThrow()
  })
  it.each([{ checks: [] }, { checks: [false] }, { checks: [true, true] }])('recusa checks simulados vazios, falhos ou incompletos: %j', ({ checks }) => {
    expect(() => move(running('demo'), 'DONE', { completion: { ...simulated, simulatedChecks: checks } })).toThrow()
  })
})

describe('correção, proveniência e restauração de snapshots', () => {
  it('aceita o último check corrigido na árvore atual e preserva o diagnóstico anterior', () => {
    const failed = core.recordHostEvidence(running(), { ...hostEvidence, exitCode: 1, testedTreeHash: sha })
    const repaired = core.recordHostEvidence(failed, { ...hostEvidence, id: 'evidence-2',
      startedAt: '2026-10-14T10:01:00Z', finishedAt: '2026-10-14T10:01:01Z' })
    expect(move(repaired, 'DONE', { completion }).status).toBe('DONE')
    expect(repaired.evidence.map(record => record.exitCode)).toEqual([1, 0])
  })
  it('uma falha mais recente invalida o check aprovado, mesmo recebendo registros fora de ordem', () => {
    const failed = core.recordHostEvidence(running(), { ...hostEvidence, id: 'evidence-2', exitCode: 1,
      startedAt: '2026-10-14T10:01:00Z', finishedAt: '2026-10-14T10:01:01Z' })
    const lateSuccess = core.recordHostEvidence(failed, hostEvidence)
    expect(() => move(lateSuccess, 'DONE', { completion })).toThrow()
  })
  it('checks com mesmo horário não ocultam uma falha pela ordem de inserção', () => {
    for (const failedFirst of [true, false]) {
      const failedRecord = { ...hostEvidence, id: 'failed', exitCode: 1 }
      const records = failedFirst ? [failedRecord, hostEvidence] : [hostEvidence, failedRecord]
      const verified = records.reduce((state, record) => core.recordHostEvidence(state, record), running())
      expect(() => move(verified, 'DONE', { completion })).toThrow()
    }
  })
  it('isola snapshots retornados dos objetos de entrada e recusa eventos fora de ordem', () => {
    const original = validated()
    const next = move(original, 'REJECTED', { reason: 'Falha reproduzida' })
    next.plan.acceptanceCriteria.push('Nova condição')
    next.attempts[0].evidenceIds.push('external')
    expect(original.plan.acceptanceCriteria).toEqual(task.acceptanceCriteria)
    expect(original.attempts[0].evidenceIds).toEqual(['evidence-1'])
    expect(() => move(original, 'REJECTED', { reason: 'Falha', at: '2026-10-14T09:00:00Z' })).toThrow()
  })
  it('não aceita evidência de antes do início nem de depois da conclusão declarada', () => {
    expect(() => core.recordHostEvidence(running(), { ...hostEvidence, startedAt: '2026-10-14T09:59:00Z' })).toThrow()
    expect(() => move(validated(), 'DONE', { completion, at: '2026-10-14T10:00:00Z' })).toThrow()
  })
  it.each([
    (state: core.ScrumTask) => ({ ...state, mode: 'demo' }),
    (state: core.ScrumTask) => ({ ...state, attempts: [] }),
    (state: core.ScrumTask) => ({ ...state, attempts: state.attempts.map(a => ({ ...a, professionalId: 'other' })) }),
    (state: core.ScrumTask) => ({ ...state, attempts: state.attempts.map(a => ({ ...a, taskId: 'other' })) }),
    (state: core.ScrumTask) => ({ ...state, history: [] }),
    (state: core.ScrumTask) => ({ ...state, evidence: [{ ...hostEvidence, attemptId: 'old' }] }),
  ])('recusa snapshot inconsistente sem mutação', mutate => {
    const corrupted = mutate(validated())
    expect(core.ScrumTaskSchema.safeParse(corrupted).success).toBe(false)
    expect(() => move(corrupted as core.ScrumTask, 'REJECTED', { reason: 'Falha' })).toThrow()
  })
  it('valida snapshot DONE restaurado sem permitir retirar prova, commit ou checks', () => {
    const done = move(validated(), 'DONE', { completion })
    expect(core.ScrumTaskSchema.safeParse(done).success).toBe(true)
    expect(core.ScrumTaskSchema.safeParse({ ...done, evidence: [] }).success).toBe(false)
    expect(core.ScrumTaskSchema.safeParse({ ...done, completion: undefined }).success).toBe(false)
    expect(core.ScrumTaskSchema.safeParse({ ...done, completion: { ...completion, commit: { sha: commit, treeHash: sha } } }).success).toBe(false)
  })
})

it('representa objetivos, backlogs, aceitação, DoD, incremento e execução de forma independente', () => {
  const productGoal = core.ProductGoalSchema.parse({ id: 'pg', objective: 'Organizar compromissos' })
  const sprintGoal = core.SprintGoalSchema.parse({ id: 'sg', objective: 'Criar compromisso acessível' })
  const productBacklog = core.ProductBacklogSchema.parse({ id: 'pb', productGoalId: productGoal.id, items: [{ id: 'item', title: 'Criar compromisso', acceptanceCriteria: ['Salvar título'] }] })
  const sprintBacklog = core.SprintBacklogSchema.parse({ id: 'sb', sprintGoalId: sprintGoal.id, productBacklogItemIds: ['item'], tasks: [task] })
  const dod = core.DefinitionOfDoneSchema.parse({ id: 'dod', criteria: ['Testes e integração'] })
  const increment = core.IncrementSchema.parse({ id: 'inc', definitionOfDoneId: dod.id, taskIds: [task.id], usable: false })
  expect(productBacklog.items[0].acceptanceCriteria).toEqual(['Salvar título'])
  expect(sprintBacklog.tasks[0].acceptanceCriteria).toEqual(task.acceptanceCriteria)
  expect(dod.criteria).toEqual(['Testes e integração'])
  expect(increment.usable).toBe(false)
  expect(core.RunStatusSchema.parse('awaiting_approval')).toBe('awaiting_approval')
  expect(() => core.ProductGoalSchema.parse({ ...productGoal, status: 'DONE' })).toThrow()
  expect(() => core.IncrementSchema.parse({ ...increment, status: 'DONE' })).toThrow()
})
