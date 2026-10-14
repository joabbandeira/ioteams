import { afterEach, expect, it } from 'vitest'
import { ScrumEventService, PlanningService } from '@ioteams/runtime'
import { planningFixture } from './planning.fixture.js'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
const fixtures: Awaited<ReturnType<typeof planningFixture>>[] = []
afterEach(async () => { for (const f of fixtures.splice(0)) await f.cleanup() })
async function setup() {
  const f = await planningFixture(); fixtures.push(f)
  const planning = new PlanningService(f.options), result = await planning.propose(f.demand, f.policy)
  if (result.status !== 'proposed') throw new Error('Missing proposal')
  const dir = join(f.base, 'approval'); await mkdir(dir, { mode: 0o700 })
  const approved = await planning.approve(f.demand.id, result.proposal.hash, dir)
  f.store.create('sprint', { id: 'sprint-1', projectId: 'project-1', planId: approved.snapshot.plan.id,
    goal: result.proposal.sprintGoal, definitionOfDone: result.proposal.definitionOfDone, backlog: result.proposal.sprintBacklog })
  return { ...f, service: new ScrumEventService({ store: f.store }), proposal: result.proposal,
    input: { id: 'event-1', projectId: 'project-1', sprintId: 'sprint-1', purpose: 'Inspecionar o objetivo desta Sprint',
      participants: result.proposal.team.members, stakeholderIds: [], evidenceIds: [],
      observations: ['Sem incremento concluído ainda'], improvements: ['Rever a clareza da aceitação'], at: '2026-10-14T11:00:00Z' } }
}
it('records Planning, Daily, Review and Retrospective with purpose, participants, evidence and improvement without changing authority', async () => {
  const f = await setup()
  const planning = f.service.sprintPlanning(f.input)
  const daily = f.service.inspectDaily({ ...f.input, id: 'event-2', participants: f.input.participants.filter(p => p.role === 'Developer') })
  const review = f.service.sprintReview({ ...f.input, id: 'event-3', stakeholderIds: ['customer'] })
  const retro = f.service.sprintRetrospective({ ...f.input, id: 'event-4' })
  expect([planning.kind, daily.kind, review.kind, retro.kind]).toEqual(['sprint_planning', 'daily_inspection', 'sprint_review', 'sprint_retrospective'])
  expect(retro.improvements).toEqual(['Rever a clareza da aceitação'])
  expect(daily.participants.map(p => p.professionalId)).toEqual(['bia-martins'])
  expect(review.stakeholderIds).toEqual(['customer'])
  expect(f.store.eventsAfter(0).slice(-4).map(e => e.type)).toEqual(['scrum.sprint_planning', 'scrum.daily_inspection', 'scrum.sprint_review', 'scrum.sprint_retrospective'])
  expect(f.store.list('run')).toEqual([])
  expect(f.store.list('task')).toEqual([])
  expect(f.store.list('approvedPlan')).toHaveLength(1)
  expect(f.service.sprintPlanning(f.input)).toEqual(planning)
  expect(f.store.eventsAfter(0).filter(e => e.type === 'scrum.sprint_planning')).toHaveLength(1)
  expect(() => f.service.sprintPlanning({ ...f.input, purpose: 'Outro efeito' })).toThrow()
})
it.each(['foreign participant', 'false role', 'invented evidence', 'empty improvement', 'extra control', 'unknown sprint', 'missing team member'])('refuses %s without storing a Scrum event', async kind => {
  const f = await setup(), input = structuredClone(f.input) as any
  if (kind === 'foreign participant') input.participants[0].professionalId = 'outsider'
  if (kind === 'false role') input.participants[0].role = 'Scrum Master'
  if (kind === 'invented evidence') input.evidenceIds = ['invented']
  if (kind === 'empty improvement') input.improvements = []
  if (kind === 'extra control') input.permissions = { write: '/' }
  if (kind === 'unknown sprint') input.sprintId = 'missing'
  if (kind === 'missing team member') input.participants.pop()
  expect(() => f.service.sprintRetrospective(input)).toThrow()
  expect(f.store.eventsAfter(0).filter(e => e.type.startsWith('scrum.'))).toHaveLength(0)
})
it('keeps Daily centered on Developers without delegating work to the facilitator', async () => {
  const f = await setup()
  expect(() => f.service.inspectDaily(f.input)).toThrow()
  expect(f.store.list('task')).toEqual([])
})

it('links stored evidence from the same Sprint and rejects future evidence or another Sprint', async () => {
  const f = await setup()
  const { createTask, transitionTask, recordHostEvidence } = await import('@ioteams/core')
  const plan = f.proposal.policy.plan, task = plan.tasks[0]
  let state = createTask({ mode: 'operational', task, team: f.proposal.team,
    professional: { version: 1, kind: 'professional', id: task.professionalId, name: 'Bia', fictitious: true, professionIds: ['desenvolvimento'], stackIds: ['git'] },
    requirements: f.demand.requirements[0].competencies, definitionOfDone: plan.definitionOfDone,
    delivery: { pushRequired: true, branch: plan.branch, remote: plan.remote } })
  for (const [target, at] of [['IN_PLANNING', '10:00:00'], ['READY', '10:01:00'], ['IN_PROGRESS', '10:02:00']] as const) {
    state = transitionTask(state, { target, eventId: `transition-${target}`, at: `2026-10-14T${at}Z`,
      ...target === 'IN_PROGRESS' ? { execution: { mode: 'operational', attemptId: 'attempt-1', baseSha: plan.baseSha } } : {} })
  }
  state = recordHostEvidence(state, { id: 'evidence-1', taskId: task.id, attemptId: 'attempt-1', command: task.checks[0], exitCode: 0,
    startedAt: '2026-10-14T10:03:00Z', finishedAt: '2026-10-14T10:04:00Z', contentHash: 'b'.repeat(64), testedTreeHash: plan.baseSha })
  f.store.create('task', { id: task.id, projectId: f.input.projectId, sprintId: f.input.sprintId, planId: plan.id, state })
  expect(f.service.sprintReview({ ...f.input, evidenceIds: ['evidence-1'] }).evidenceIds).toEqual(['evidence-1'])
  expect(f.store.get('task', task.id)?.data.state).toEqual(state)
  expect(() => f.service.sprintReview({ ...f.input, id: 'future-evidence', evidenceIds: ['evidence-1'], at: '2026-10-14T10:03:00Z' })).toThrow()
  f.store.create('sprint', { id: 'another-sprint', projectId: f.input.projectId, planId: plan.id, goal: f.proposal.sprintGoal, definitionOfDone: f.proposal.definitionOfDone })
  expect(() => f.service.sprintReview({ ...f.input, id: 'wrong-sprint', sprintId: 'another-sprint', evidenceIds: ['evidence-1'] })).toThrow()
})
