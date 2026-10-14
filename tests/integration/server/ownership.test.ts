import { afterEach, expect, it, vi } from 'vitest'
import { ExecutionService } from '@ioteams/runtime'
import { openStore } from '@ioteams/storage'
import { openKnowledge } from '@ioteams/knowledge'
import { createDomainServices } from '../../../apps/server/src/services.js'
import { executionFixture } from '../runtime/execution.fixture.js'
const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close() })
async function setup(approval = false) {
  const id = 'guard-run'
  const f = await executionFixture({ events: (events, phase) => approval && phase === 'implement' ? [...events.slice(0, 2), {
    type: 'approval.requested', request: { id: 'approval-guard', requestId: 'request-guard', runId: id, threadId: 'execution-thread-1', turnId: 'execution-turn-1', kind: 'command', summary: 'Fixture', details: {}, status: 'pending' },
  }, ...events.slice(2)] : events }); cleanup.push(() => f.cleanup())
  const index = openKnowledge({ memory: true }); cleanup.push(() => index.close())
  let release!: () => void, entered!: () => void, once = true
  const held = new Promise<void>(resolve => { release = resolve }), guarding = new Promise<void>(resolve => { entered = resolve })
  const workspace = { ...f.workspace, async assertOwned() { if (once) { once = false; entered(); await held }; await f.workspace.assertOwned() } }
  const execution = new ExecutionService(f)
  const options = { store: f.store, index, catalogRoot: f.source, execution, executionContext: async () => ({ policy: f.policy, workspace }) }
  const service = createDomainServices(options); cleanup.push(async () => { release(); await service.close!() })
  const sibling = openStore({ directory: f.operations, checkoutRoots: [f.source, f.workspaceRoot] }); cleanup.push(() => sibling.close())
  const replacement = createDomainServices({ ...options, store: sibling, execution: new ExecutionService({ ...f, store: sibling }) }); cleanup.push(() => replacement.close!())
  return { ...f, options, id, execution, service, replacement, replacementStore: sibling, guarding, release, signal: new AbortController().signal }
}
it.each(['pause', 'cancel'] as const)('refuses foreign %s during the real start guard instead of claiming an unconfirmed stop', async action => {
  const f = await setup()
  await f.service.execute({ resource: 'runs', body: { id: f.id, planId: f.plan.id } }, f.signal); await f.guarding
  await expect(f.replacement.execute({ resource: 'runs', id: f.id, action, body: { expectedVersion: 1 } }, f.signal)).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' })
  expect(await f.replacement.read('runs', f.id, {})).toMatchObject({ version: 1, data: { status: 'blocked' } })
  expect(await f.replacement.execute({ resource: 'runs', id: f.id, action: 'reconcile', body: { expectedVersion: 1 } }, f.signal)).toEqual({ id: f.id, status: 'blocked', version: 1, reason: 'RECONCILIATION_REQUIRED' })
  expect(f.counts()).toEqual({ implementations: 0, reviews: 0, checks: 0 })
  f.release()
  await expect.poll(() => f.store.get('run', f.id)?.data.status, { timeout: 15_000 }).toBe('completed')
  expect((await f.replacement.read('runs', f.id, {}) as { data: { status: string } }).data.status).toBe('completed')
}, 20_000)
it('keeps actual, GET runs and GET status coherent after an owned queued stop, reconciliation and resume', async () => {
  const f = await setup(true)
  await f.service.execute({ resource: 'runs', body: { id: f.id, planId: f.plan.id } }, f.signal); await f.guarding
  expect(await f.service.execute({ resource: 'runs', id: f.id, action: 'cancel', body: { expectedVersion: 1 } }, f.signal)).toMatchObject({ status: 'cancelled', version: 2 })
  f.release()
  await expect.poll(() => f.store.get('run', f.id)?.data.status).toBe('cancelled')
  expect(f.counts()).toEqual({ implementations: 0, reviews: 0, checks: 0 })
  const version = async () => (await f.service.read('runs', f.id, {}) as { version: number }).version
  expect(await f.service.execute({ resource: 'runs', id: f.id, action: 'reconcile', body: { expectedVersion: await version() } }, f.signal)).toMatchObject({ status: 'paused' })
  expect(await f.service.read('runs', f.id, {})).toMatchObject({ data: { status: 'paused' } })
  const actualVersion = f.store.get('run', f.id)!.version
  await f.service.execute({ resource: 'runs', id: f.id, action: 'resume', body: { expectedVersion: await version() } }, f.signal)
  await expect.poll(() => f.store.get('run', f.id)?.data.status).toBe('awaiting_approval')
  expect(f.store.get('run', f.id)!.version).toBeGreaterThan(actualVersion)
  expect(await f.service.read('runs', f.id, {})).toMatchObject({ data: { status: 'awaiting_approval' } })
  expect(await f.service.read('runStatus', f.id, {})).toMatchObject({ status: 'awaiting_approval' })
  expect(await f.replacement.read('runs', f.id, {})).toMatchObject({ data: { status: 'awaiting_approval' } })
})
it.each(['resume', 'reconcile'] as const)('fences a foreign cancel during the next %s generation before its runtime method proceeds', async action => {
  const f = await setup(true)
  await f.service.execute({ resource: 'runs', body: { id: f.id, planId: f.plan.id } }, f.signal); await f.guarding
  await f.service.execute({ resource: 'runs', id: f.id, action: 'cancel', body: { expectedVersion: 1 } }, f.signal)
  f.release(); await expect.poll(() => f.store.get('run', f.id)?.data.status).toBe('cancelled')
  const version = async () => (await f.service.read('runs', f.id, {}) as { version: number }).version
  await f.service.execute({ resource: 'runs', id: f.id, action: 'reconcile', body: { expectedVersion: await version() } }, f.signal)
  let release!: () => void, entered!: () => void
  const held = new Promise<void>(resolve => { release = resolve }), waiting = new Promise<void>(resolve => { entered = resolve })
  if (action === 'resume') {
    const actual = f.execution.resume.bind(f.execution)
    f.execution.resume = async (...args) => { entered(); await held; return actual(...args) }
  } else {
    const actual = f.execution.reconcile.bind(f.execution)
    f.execution.reconcile = async (...args) => { entered(); await held; return actual(...args) }
  }
  cleanup.push(() => { release() })
  const requested = f.service.execute({ resource: 'runs', id: f.id, action, body: { expectedVersion: await version() } }, f.signal)
  await waiting
  const oldVersion = await version()
  expect(f.store.get('run', f.id)?.data.status).toBe('paused')
  await expect(f.replacement.execute({ resource: 'runs', id: f.id, action: 'cancel', body: { expectedVersion: oldVersion } }, f.signal)).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' })
  expect(f.store.get('run', f.id)?.data.status).toBe('paused')
  release(); await requested
  if (action === 'resume') await expect.poll(() => f.store.get('run', f.id)?.data.status).toBe('awaiting_approval')
  expect(await f.service.read('runs', f.id, {})).toMatchObject({ data: { status: action === 'resume' ? 'awaiting_approval' : 'paused' } })
})

it('returns HTTP 409 for unowned queued cancel without persisting a false stop', async () => {
  const f = await setup()
  const { createLocalServer } = await import('../../../apps/server/src/index.js')
  const server = createLocalServer({ store: f.replacementStore, services: f.replacement }), origin = await server.listen()
  cleanup.push(() => server.close())
  await f.service.execute({ resource: 'runs', body: { id: f.id, planId: f.plan.id } }, f.signal); await f.guarding
  const boot = await fetch(`${origin}/api/v1/session/bootstrap`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ secret: server.bootstrapSecret }) })
  const csrf = (await boot.json() as { csrfToken: string }).csrfToken
  const response = await fetch(`${origin}/api/v1/runs/${f.id}/cancel`, { method: 'POST', headers: { origin, cookie: boot.headers.get('set-cookie')!.split(';')[0], 'x-csrf-token': csrf, 'content-type': 'application/json', 'idempotency-key': 'foreign-stop' }, body: JSON.stringify({ expectedVersion: 1 }) })
  expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: 'RECONCILIATION_REQUIRED' })
  expect(await f.replacement.read('runs', f.id, {})).toMatchObject({ version: 1, data: { status: 'blocked' } })
  expect(f.counts()).toEqual({ implementations: 0, reviews: 0, checks: 0 })
  f.release(); await f.service.close!()
})

it('does not invoke the executor when the persisted resume claim transaction rolls back', async () => {
  const f = await setup(true)
  await f.service.execute({ resource: 'runs', body: { id: f.id, planId: f.plan.id } }, f.signal); await f.guarding
  await f.service.execute({ resource: 'runs', id: f.id, action: 'cancel', body: { expectedVersion: 1 } }, f.signal)
  f.release(); await expect.poll(() => f.store.get('run', f.id)?.data.status).toBe('cancelled')
  const version = async () => (await f.service.read('runs', f.id, {}) as { version: number }).version
  await f.service.execute({ resource: 'runs', id: f.id, action: 'reconcile', body: { expectedVersion: await version() } }, f.signal)
  let invoked = 0
  const actual = f.execution.resume.bind(f.execution)
  f.execution.resume = async (...args) => { invoked++; return actual(...args) }
  const before = f.store.eventsAfter(0, { limit: 1000 }).at(-1)!.sequence
  const transaction = f.store.transaction.bind(f.store)
  vi.spyOn(f.store, 'transaction').mockImplementationOnce(operation => transaction(store => { operation(store); throw new Error('claim rollback') }))
  await expect(f.service.execute({ resource: 'runs', id: f.id, action: 'resume', body: { expectedVersion: await version() } }, f.signal)).rejects.toThrow('claim rollback')
  await expect.poll(() => invoked > 0 || f.store.eventsAfter(before).some(e => e.type === 'api.job.failed')).toBe(true)
  expect(invoked).toBe(0)
  expect(f.counts()).toEqual({ implementations: 0, reviews: 0, checks: 0 })
})
