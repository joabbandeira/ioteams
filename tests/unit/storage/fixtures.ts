import { createTask, transitionTask, recordHostEvidence, ApprovalRequestSchema } from '@ioteams/core'
import { EntitySchemas } from '@ioteams/storage'
import { task, plan, evidence, metadata, approval as rawApproval, sha } from '../../fixtures/contracts.js'

export { plan, evidence, sha }
export const approval = ApprovalRequestSchema.parse(rawApproval)
export const project = { id: 'ioteams', name: 'ioteams', repositoryPath: '/tmp/disposable-repository' }
export const demand = { id: 'demand-1', projectId: project.id, goal: 'Persistir a execução' }
export const approvedPlan = EntitySchemas.approvedPlan.parse({ id: plan.id, projectId: project.id, demandId: demand.id, plan, approvedAt: '2026-10-14T10:00:00Z' })
export const sprint = { id: 'sprint-1', projectId: project.id, planId: plan.id,
  goal: { id: 'goal-1', objective: 'Entregar persistência' }, definitionOfDone: { id: 'dod-1', criteria: ['Checks aprovados'] } }
export const initialTask = createTask({ mode: 'operational', task, professional: metadata[2], team: metadata[5],
  requirements: { professionIds: ['desenvolvimento'], stackIds: ['git'] }, definitionOfDone: plan.definitionOfDone,
  delivery: { pushRequired: true, branch: plan.branch, remote: plan.remote } })
export const taskRecord = { id: task.id, projectId: project.id, planId: plan.id, sprintId: sprint.id, state: initialTask }
export const at = '2026-10-14T10:00:00.000Z'
export function runningTask() {
  let state = initialTask
  for (const target of ['IN_PLANNING', 'READY', 'IN_PROGRESS'] as const) {
    state = transitionTask(state, { target, eventId: `event-${target}`, at,
      ...(target === 'IN_PROGRESS' ? { execution: { mode: 'operational', attemptId: 'attempt-1', baseSha: sha } } : {}) })
  }
  return recordHostEvidence(state, evidence)
}
export const run = { id: 'run-1', projectId: project.id, planId: plan.id, taskId: task.id, attemptId: 'attempt-1',
  status: 'running' as const, threadId: 'thread-1', turnId: 'turn-1' }
export const event = { id: 'event-1', projectId: project.id, runId: run.id, type: 'run.started', at, data: { message: 'Iniciado' } }
