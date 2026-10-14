import { afterEach, expect, it } from 'vitest'
import { openKnowledge } from '@ioteams/knowledge'
import { createDomainServices } from '../../../apps/server/src/services.js'
import { executionFixture, FixtureExecutionService as ExecutionService } from '../runtime/execution.fixture.js'
const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function setup(options: Parameters<typeof executionFixture>[0] = {}) {
  const creating = executionFixture(options); cleanup.push(creating.cleanup)
  const f = await creating
  const index = openKnowledge({ memory: true }); cleanup.push(() => index.close())
  const service = createDomainServices({ store: f.store, index, catalogRoot: f.source, execution: new ExecutionService(f),
    executionContext: async () => ({ policy: f.policy, workspace: f.workspace }) })
  cleanup.push(() => service.close!())
  return { ...f, service, signal: new AbortController().signal }
}
it('starts real sequential execution behind a trusted policy/workspace and reports persisted completion', async () => {
  const f = await setup({ implement: async request => {
    const { writeFile } = await import('node:fs/promises'); const { join } = await import('node:path')
    await writeFile(join(request.policy.snapshot.workspaceRoot, 'src/main.ts'), 'export const value = 2\n')
  } })
  expect(await f.service.execute({ resource: 'runs', body: { id: 'r1', planId: f.plan.id } }, f.signal)).toEqual({ id: 'r1', status: 'accepted' })
  await expect.poll(() => f.store.get('run', 'r1')?.data.status, { timeout: 15_000 }).toBe('completed')
  expect(await f.service.read('runs', 'r1', {})).toMatchObject({ data: { status: 'completed' } })
  await expect(f.service.execute({ resource: 'runs', body: { id: 'r1', planId: f.plan.id } }, f.signal)).rejects.toMatchObject({ code: 'RUN_EXISTS' })
  expect(f.counts()).toEqual({ implementations: 1, reviews: 1, checks: 1 })
}, 20_000)
it.each(['pause', 'cancel'] as const)('binds %s to the active job, interrupts its exact host and refuses stale control', async action => {
  const f = await setup({ events: (events, phase) => phase === 'implement' ? [events[0], events[1], { type: 'approval.requested', request: {
    id: 'approval1', runId: 'r1', threadId: 'execution-thread-1', turnId: 'execution-turn-1', requestId: 'request1', kind: 'command', summary: 'Fixture approval', details: {}, status: 'pending',
  } }] : events })
  await f.service.execute({ resource: 'runs', body: { id: 'r1', planId: f.plan.id } }, f.signal)
  await expect.poll(() => f.store.get('run', 'r1')?.data.status, { timeout: 7000 }).toBe('awaiting_approval')
  const current = await f.service.read('runs', 'r1', {}) as { version: number }
  await expect(f.service.execute({ resource: 'runs', id: 'r1', action, body: { expectedVersion: current.version - 1 } }, f.signal)).rejects.toThrow()
  const result = await f.service.execute({ resource: 'runs', id: 'r1', action, body: { expectedVersion: current.version } }, f.signal)
  expect(result).toEqual({ id: 'r1', status: action === 'pause' ? 'paused' : 'cancelled' })
  expect(f.store.get('run', 'r1')!.data.status).toBe(action === 'pause' ? 'paused' : 'cancelled')
  expect(f.counts().checks).toBe(0)
}, 20_000)
it('answers only a versioned active approval and refuses duplicate or unknown requests', async () => {
  const f = await setup({ events: (events, phase) => phase === 'implement' ? [events[0], events[1], { type: 'approval.requested', request: {
    id: 'approval1', runId: 'r1', threadId: 'execution-thread-1', turnId: 'execution-turn-1', requestId: 'request1', kind: 'command', summary: 'Fixture approval', details: {}, status: 'pending',
  } }, ...events.slice(2)] : events })
  await f.service.execute({ resource: 'runs', body: { id: 'r1', planId: f.plan.id } }, f.signal)
  try { await expect.poll(() => f.store.list('approval').length, { timeout: 7000 }).toBe(1) }
  catch (error) { throw new Error(`Approval observation: ${JSON.stringify({ status: f.store.get('run', 'r1')?.data.status, counts: f.counts(), phases: f.phases })}`, { cause: error }) }
  const approval = f.store.list('approval')[0]
  const command = { resource: 'approvals' as const, id: approval.data.id, action: 'decide', body: { expectedVersion: approval.version, decision: 'decline' } }
  expect(await f.service.execute(command, f.signal)).toEqual({ id: approval.data.id, status: 'decided' })
  await expect(f.service.execute(command, f.signal)).rejects.toThrow()
  await expect(f.service.execute({ ...command, id: 'unknown' }, f.signal)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  expect(f.store.get('approval', approval.data.id)!.data.status).toBe('declined')
}, 20_000)
it('reserves failed run intents globally across projects instead of silently running a new plan under the same ID', async () => {
  const f = await setup()
  const index = openKnowledge({ memory: true }); cleanup.push(() => index.close())
  const service = createDomainServices({ store: f.store, index, catalogRoot: f.source, execution: new ExecutionService(f), executionContext: async () => { throw new Error('provisioning failed') } })
  cleanup.push(() => service.close!())
  await service.execute({ resource: 'runs', body: { id: 'failed-id', planId: f.plan.id } }, f.signal)
  await expect.poll(() => f.store.eventsAfter(0).some(e => e.type === 'api.job.failed')).toBe(true)
  f.store.create('project', { id: 'project-2', name: 'Other', repositoryPath: f.source })
  f.store.create('demand', { id: 'demand-2', projectId: 'project-2', goal: 'Other' })
  f.store.create('approvedPlan', { id: 'plan-2', projectId: 'project-2', demandId: 'demand-2', plan: { ...f.policy.snapshot.plan, id: 'plan-2', projectId: 'project-2' }, approvedAt: new Date().toISOString() })
  await expect(service.execute({ resource: 'runs', body: { id: 'failed-id', planId: 'plan-2' } }, f.signal)).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' })
})
it('allows explicit reconciliation after cancellation and never retries an interrupted attempt on resume', async () => {
  const f = await setup({ events: (events, phase) => phase === 'implement' ? [events[0], events[1], { type: 'approval.requested', request: {
    id: 'approval1', runId: 'r1', threadId: 'execution-thread-1', turnId: 'execution-turn-1', requestId: 'request1', kind: 'command', summary: 'Fixture', details: {}, status: 'pending',
  } }] : events })
  await f.service.execute({ resource: 'runs', body: { id: 'r1', planId: f.plan.id } }, f.signal)
  await expect.poll(() => f.store.get('run', 'r1')?.data.status, { timeout: 7000 }).toBe('awaiting_approval')
  const version = async () => (await f.service.read('runs', 'r1', {}) as { version: number }).version
  await f.service.execute({ resource: 'runs', id: 'r1', action: 'cancel', body: { expectedVersion: await version() } }, f.signal)
  const reconciled = await f.service.execute({ resource: 'runs', id: 'r1', action: 'reconcile', body: { expectedVersion: await version(), retryPush: false } }, f.signal)
  expect(reconciled).toEqual({ id: 'r1', status: 'paused', reason: 'RECONCILIATION_REQUIRED' })
  await f.service.execute({ resource: 'runs', id: 'r1', action: 'resume', body: { expectedVersion: await version() } }, f.signal)
  await expect.poll(() => f.store.eventsAfter(0).filter(e => e.type === 'api.job.finished').length).toBe(3)
  expect(await f.service.read('runStatus', 'r1', {})).toEqual({ id: 'r1', status: 'paused', reason: 'RECONCILIATION_REQUIRED' })
  expect(f.inputs).toHaveLength(1); expect(f.counts().checks).toBe(0)
})
