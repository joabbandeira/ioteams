import { afterEach, expect, it } from 'vitest'
import { PlanningService, approvePolicy, preparePolicy } from '@ioteams/runtime'
import { indexCatalog } from '@ioteams/knowledge'
import { planningFixture } from './planning.fixture.js'
const fixtures: Awaited<ReturnType<typeof planningFixture>>[] = []
afterEach(async () => { for (const f of fixtures.splice(0)) await f.cleanup() })
async function setup(...args: Parameters<typeof planningFixture>) { const f = await planningFixture(...args); fixtures.push(f); return f }

it('rejects a concurrent demand before either can enter a second external planning sequence', async () => {
  const f = await setup(), service = new PlanningService(f.options)
  const first = service.propose(f.demand, f.policy)
  await expect(service.propose({ ...f.demand, id: 'demand-2' }, f.policy)).rejects.toMatchObject({ code: 'PLANNING_BUSY' })
  expect((await first).status).toBe('proposed')
  expect(f.inputs).toHaveLength(3)
})
it('does not open a host for an already cancelled request', async () => {
  const f = await setup(), abort = new AbortController(); abort.abort()
  await expect(new PlanningService(f.options).propose(f.demand, f.policy, abort.signal)).rejects.toMatchObject({ code: 'PLANNING_INTERRUPTED' })
  expect(f.inputs).toHaveLength(0)
  expect(f.phases).toHaveLength(0)
})
it.each(['incomplete', 'failed', 'wrong turn', 'thread reuse', 'tool', 'permission request', 'oversize', 'after terminal'])('fails closed on %s and disposes the host', async fault => {
  const f = await setup(undefined, events => {
    if (fault === 'incomplete') return events.slice(0, -1)
    if (fault === 'failed') return [...events.slice(0, -1), { type: 'turn.completed', turnId: 'turn-1', status: 'failed' }]
    if (fault === 'wrong turn') return events.map(e => e.type === 'content.delta' ? { ...e, turnId: 'foreign' } : e)
    if (fault === 'thread reuse') return events.map(e => e.type === 'thread.started' || e.type === 'turn.started' ? { ...e, threadId: 'reused' } : e)
    if (fault === 'tool') return [...events.slice(0, 2), { type: 'tool.started', turnId: 'turn-1', toolId: 'tool-1', name: 'commandExecution', input: { command: 'npm publish' } }]
    if (fault === 'permission request') return [...events.slice(0, 2), { type: 'approval.requested', request: {
      id: 'approval-1', requestId: 'request-1', runId: 'run-1', threadId: 'thread-1', turnId: 'turn-1', kind: 'permissions',
      summary: 'Allow network', details: { network: true }, status: 'pending',
    } }]
    if (fault === 'oversize') return [...events.slice(0, 2), { type: 'content.delta', turnId: 'turn-1', text: 'x'.repeat(262_145) }]
    return [...events, { type: 'content.delta', turnId: 'turn-1', text: '{}' }]
  })
  await expect(new PlanningService(f.options).propose(f.demand, f.policy)).rejects.toThrow()
  expect(f.disposed.length).toBe(f.inputs.length)
  expect(f.store.list('run')).toEqual([])
  expect(f.store.list('approvedPlan')).toEqual([])
  expect(f.store.eventsAfter(0).at(-1)?.type).toBe('planning.blocked')
})
it('plans two assigned Developers in distinct sessions while keeping each context limited to their slots', async () => {
  const f = await setup((_role, value, input) => input.identity.role === 'Developer' ? {
    ...value, tasks: input.approvedPolicy.tasks.filter(t => t.professionalId === input.identity.professionalId),
  } : value)
  await f.corpus.file('profissionais/caio/perfil.md', '---\n'+JSON.stringify({ version:1, kind:'professional', id:'caio', name:'Caio', fictitious:true, professionIds:['desenvolvimento'], stackIds:['git'] })+'\n---\n# Caio\nConhecimento de referência.\n')
  const teamPath = 'equipes/lisa/descricao.md'
  await f.corpus.file(teamPath, '---\n'+JSON.stringify({ version:1,kind:'team',id:'lisa',name:'LISA',members:[
    {professionalId:'helena-costa',role:'Product Owner'},{professionalId:'marcos-lima',role:'Scrum Master'},
    {professionalId:'bia-martins',role:'Developer'},{professionalId:'caio',role:'Developer'},
  ] })+'\n---\n# LISA\nConhecimento de referência.\n')
  await indexCatalog(f.index, { root: f.corpus.root, commitSha: f.corpus.commit() })
  const { version: _, ...envelope } = f.policy.snapshot
  const draft = await preparePolicy({ ...envelope, plan: { ...envelope.plan, tasks: [...envelope.plan.tasks,
    { ...envelope.plan.tasks[0], id:'task-2', professionalId:'caio', dependsOn:['task-1'] }] } })
  const policy = await approvePolicy(draft, draft.plan.policyHash, f.state)
  const result = await new PlanningService(f.options).propose({ ...f.demand, requirements: [...f.demand.requirements,
    { taskId:'task-2', competencies:{professionIds:['desenvolvimento'],stackIds:['git']} }] }, policy)
  expect(result.status).toBe('proposed')
  if(result.status !== 'proposed') throw new Error('Missing proposal')
  expect(result.proposal.policy.plan.tasks.map(t=>t.professionalId)).toEqual(['bia-martins','caio'])
  const devs = f.inputs.filter(i => i.identity.role === 'Developer')
  expect(devs.map(i=>JSON.parse(i.objective).context.slots.map((t: {id:string})=>t.id))).toEqual([['task-1'],['task-2']])
  expect(new Set(result.proposal.roles.map(r=>r.threadId)).size).toBe(4)
})

it.each(['team', 'requirements', 'unknown control'])('rejects mismatched %s before consulting a model', async fault => {
  const f = await setup(), input = structuredClone(f.demand) as any
  if (fault === 'team') input.teamId = 'another-team'
  if (fault === 'requirements') input.requirements[0].taskId = 'other-task'
  if (fault === 'unknown control') input.approve = true
  await expect(new PlanningService(f.options).propose(input, f.policy)).rejects.toThrow()
  expect(f.inputs).toHaveLength(0)
  expect(f.store.list('demand')).toEqual([])
})

it('does not persist a proposal when cancellation arrives during final session disposal', async () => {
  const f = await setup(), abort = new AbortController(); let count = 0
  const createHost = async (request: Parameters<typeof f.factory>[0]) => {
    const session = await f.factory(request), number = ++count
    return { host: session.host, async dispose() { await session.dispose(); if (number === 3) abort.abort() } }
  }
  await expect(new PlanningService({ ...f.options, createHost }).propose(f.demand, f.policy, abort.signal)).rejects.toMatchObject({ code: 'PLANNING_INTERRUPTED' })
  expect(f.store.eventsAfter(0).some(e => e.type === 'planning.proposed')).toBe(false)
})

it('rejects an index from a different corpus with identical Markdown and an unverifiable revision', async () => {
  const f = await setup()
  const { fixture } = await import('../knowledge/fixtures.js')
  const { openKnowledge } = await import('@ioteams/knowledge')
  const other = await fixture(), index = openKnowledge({ memory: true })
  try {
    await other.file('non-corpus.txt', 'Different repository revision')
    await indexCatalog(index, { root: other.root, commitSha: other.commit() })
    await expect(new PlanningService({ ...f.options, index }).propose(f.demand, f.policy)).rejects.toMatchObject({ code: 'NO_EVIDENCE' })
    expect(f.inputs).toHaveLength(0)
  } finally { index.close(); await other.cleanup() }
})

it('limits recovery terms deterministically while keeping a valid 33-term demand complete', async () => {
  const f = await setup()
  const { listCorpusMarkdown } = await import('@ioteams/catalog')
  const { readFile, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const goal = 'Referência ' + Array.from({ length: 32 }, (_, i) => `termo${i}`).join(' ')
  for (const path of await listCorpusMarkdown(f.corpus.root)) {
    const file = join(f.corpus.root, path)
    await writeFile(file, await readFile(file, 'utf8') + '\n## Demanda\n' + goal + '\n')
  }
  await indexCatalog(f.index, { root: f.corpus.root, commitSha: f.corpus.commit() })
  const result = await new PlanningService(f.options).propose({ ...f.demand, goal }, f.policy)
  expect(result.status).toBe('proposed')
  expect(f.inputs).toHaveLength(3)
  expect(f.inputs.every(input => JSON.parse(input.objective).demand.goal === goal)).toBe(true)
})
