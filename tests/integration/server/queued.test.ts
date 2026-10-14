import { afterEach, expect, it, vi } from 'vitest'
import { ExecutionService } from '@ioteams/runtime'
import { openStore } from '@ioteams/storage'
import { openKnowledge } from '@ioteams/knowledge'
import { createDomainServices } from '../../../apps/server/src/services.js'
import { createLocalServer } from '../../../apps/server/src/index.js'
import { executionFixture } from '../runtime/execution.fixture.js'
import { git } from '../../fixtures/runtime/repository.js'
const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close() })
async function setup() {
  const f = await executionFixture(); cleanup.push(() => f.cleanup())
  const index = openKnowledge({ memory: true }); cleanup.push(() => index.close())
  let release!: () => void, entered!: () => void, provisioned = 0
  const held = new Promise<void>(resolve => { release = resolve }), provisioning = new Promise<void>(resolve => { entered = resolve })
  const options = { store: f.store, index, catalogRoot: f.source, execution: new ExecutionService(f), executionContext: async () => {
    provisioned++; entered(); await held; return { policy: f.policy, workspace: f.workspace }
  } }
  const service = createDomainServices(options)
  cleanup.push(async () => { release(); await service.close!() })
  return { ...f, index, options, service, release, provisioning, provisionCount: () => provisioned, signal: new AbortController().signal }
}
it.each(['pause', 'cancel'] as const)('persists queued %s before late provisioning returns, with CAS and no execution effects', async action => {
  const f = await setup(), id = `queued-${action}`
  await f.service.execute({ resource: 'runs', body: { id, planId: f.plan.id } }, f.signal)
  await f.provisioning
  expect(await f.service.read('runStatus', id, {})).toEqual({ id, status: 'queued', version: 1 })
  expect(await f.service.read('runs', id, {})).toMatchObject({ version: 1, data: { id, status: 'queued' } })
  await expect(f.service.execute({ resource: 'runs', id, action, body: { expectedVersion: 2 } }, f.signal)).rejects.toThrow()
  const status = action === 'pause' ? 'paused' : 'cancelled'
  expect(await f.service.execute({ resource: 'runs', id, action, body: { expectedVersion: 1 } }, f.signal)).toEqual({ id, status, version: 2 })
  await expect(f.service.execute({ resource: 'runs', id, action, body: { expectedVersion: 1 } }, f.signal)).rejects.toThrow()
  expect(f.counts()).toEqual({ implementations: 0, reviews: 0, checks: 0 })
  f.release(); await f.service.close!()
  expect(f.counts()).toEqual({ implementations: 0, reviews: 0, checks: 0 })
  expect(f.store.get('run', id)).toBeUndefined()
  expect(await git(f.workspaceRoot, 'rev-parse', 'HEAD')).toBe(f.plan.baseSha)
  expect(await git(f.remote, 'rev-parse', 'develop')).toBe(f.plan.baseSha)
  const reopened = openStore({ directory: f.operations, checkoutRoots: [f.source, f.workspaceRoot] }); cleanup.push(() => reopened.close())
  const restarted = createDomainServices({ ...f.options, store: reopened, execution: new ExecutionService({ ...f, store: reopened }) })
  cleanup.push(() => restarted.close!())
  expect(await restarted.read('runStatus', id, {})).toEqual({ id, status, version: 2 })
  expect(await restarted.execute({ resource: 'runs', id, action: 'reconcile', body: { expectedVersion: 2 } }, f.signal)).toEqual({ id, status, version: 2, reason: 'RECONCILIATION_REQUIRED' })
  await expect(restarted.execute({ resource: 'runs', id, action: 'resume', body: { expectedVersion: 2 } }, f.signal)).rejects.toThrow()
})
it('honors a durable queued stop from a replacement service when the previous provisioner eventually returns', async () => {
  const f = await setup(), id = 'queued-restart'
  await f.service.execute({ resource: 'runs', body: { id, planId: f.plan.id } }, f.signal); await f.provisioning
  const reopened = openStore({ directory: f.operations, checkoutRoots: [f.source, f.workspaceRoot] }); cleanup.push(() => reopened.close())
  const replacement = createDomainServices({ ...f.options, store: reopened, execution: new ExecutionService({ ...f, store: reopened }) })
  cleanup.push(() => replacement.close!())
  expect(await replacement.read('runStatus', id, {})).toEqual({ id, status: 'blocked', version: 1, reason: 'RECONCILIATION_REQUIRED' })
  expect(await replacement.execute({ resource: 'runs', id, action: 'cancel', body: { expectedVersion: 1 } }, f.signal)).toEqual({ id, status: 'cancelled', version: 2 })
  f.release(); await f.service.close!()
  expect(f.counts()).toEqual({ implementations: 0, reviews: 0, checks: 0 })
  expect(await replacement.read('runStatus', id, {})).toEqual({ id, status: 'cancelled', version: 2 })
})
it('supports authenticated queued cancel and idempotent replay over HTTP without waiting for the provisioner', async () => {
  const f = await setup(), server = createLocalServer({ store: f.store, services: f.service }), origin = await server.listen()
  cleanup.push(async () => { f.release(); await server.close() })
  const bootstrap = await fetch(`${origin}/api/v1/session/bootstrap`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ secret: server.bootstrapSecret }) })
  const csrf = (await bootstrap.json() as { csrfToken: string }).csrfToken
  const headers = { origin, cookie: bootstrap.headers.get('set-cookie')!.split(';')[0], 'x-csrf-token': csrf, 'content-type': 'application/json' }
  const post = (path: string, body: unknown, key: string) => fetch(`${origin}/api/v1/${path}`, { method: 'POST', headers: { ...headers, 'idempotency-key': key }, body: JSON.stringify(body) })
  expect((await post('runs', { id: 'http-queued', planId: f.plan.id }, 'start')).status).toBe(200)
  await f.provisioning
  expect(await (await fetch(`${origin}/api/v1/runs/http-queued/status`, { headers })).json()).toEqual({ id: 'http-queued', status: 'queued', version: 1 })
  const first = await post('runs/http-queued/cancel', { expectedVersion: 1 }, 'stop')
  expect(first.status).toBe(200)
  const stopped = await first.json(); expect(stopped).toEqual({ id: 'http-queued', status: 'cancelled', version: 2 })
  expect(await (await post('runs/http-queued/cancel', { expectedVersion: 1 }, 'stop')).json()).toEqual(stopped)
  expect((await post('runs/http-queued/cancel', { expectedVersion: 1 }, 'stale')).status).toBe(409)
  expect(await (await fetch(`${origin}/api/v1/runs/http-queued`, { headers })).json()).toMatchObject({ version: 2, data: { status: 'cancelled' } })
  f.release(); await server.close()
  expect(f.counts()).toEqual({ implementations: 0, reviews: 0, checks: 0 })
  expect(await git(f.remote, 'rev-parse', 'develop')).toBe(f.plan.baseSha)
})
it('keeps shutdown-provisioning uncertainty explicitly reconcilable after SQLite reopen without reprovisioning', async () => {
  const f = await setup(), id = 'queued-shutdown'
  await f.service.execute({ resource: 'runs', body: { id, planId: f.plan.id } }, f.signal); await f.provisioning
  let closed = false; const closing = f.service.close!().then(() => { closed = true })
  await Promise.resolve(); expect(closed).toBe(false)
  f.release(); await closing
  const reopened = openStore({ directory: f.operations, checkoutRoots: [f.source, f.workspaceRoot] }); cleanup.push(() => reopened.close())
  let provisioned = 0
  const restarted = createDomainServices({ ...f.options, store: reopened, execution: new ExecutionService({ ...f, store: reopened }), executionContext: async () => { provisioned++; return { policy: f.policy, workspace: f.workspace } } })
  cleanup.push(() => restarted.close!())
  expect(await restarted.read('runStatus', id, {})).toEqual({ id, status: 'blocked', version: 1, reason: 'RECONCILIATION_REQUIRED' })
  expect(await restarted.execute({ resource: 'runs', id, action: 'reconcile', body: { expectedVersion: 1 } }, f.signal)).toEqual({ id, status: 'blocked', version: 1, reason: 'RECONCILIATION_REQUIRED' })
  await expect(restarted.execute({ resource: 'runs', body: { id, planId: f.plan.id } }, f.signal)).rejects.toThrow()
  expect(provisioned).toBe(0); expect(f.counts()).toEqual({ implementations: 0, reviews: 0, checks: 0 })
})
it('reconciles the earlier job-only journal format without guessing its missing authority', async () => {
  const f = await setup(), id = 'legacy-queued'
  f.store.appendEvent({ id: 'legacy-job-start', projectId: f.plan.projectId, type: 'api.job.started', at: new Date().toISOString(), data: { key: `run:${id}` } })
  expect(await f.service.read('runStatus', id, {})).toEqual({ id, status: 'blocked', version: 1, reason: 'RECONCILIATION_REQUIRED' })
  expect(await f.service.execute({ resource: 'runs', id, action: 'reconcile', body: { expectedVersion: 1 } }, f.signal)).toEqual({ id, status: 'blocked', version: 1, reason: 'RECONCILIATION_REQUIRED' })
  expect(f.counts()).toEqual({ implementations: 0, reviews: 0, checks: 0 })
})

it('checks a persisted stop before even invoking a deferred provisioner from the previous service', async () => {
  const f = await setup(), id = 'queued-before-provision'
  const accepted = f.service.execute({ resource: 'runs', body: { id, planId: f.plan.id } }, f.signal)
  const replacement = createDomainServices(f.options); cleanup.push(() => replacement.close!())
  await replacement.execute({ resource: 'runs', id, action: 'cancel', body: { expectedVersion: 1 } }, f.signal)
  await accepted; f.release(); await f.service.close!()
  expect(f.provisionCount()).toBe(0)
  expect(f.counts()).toEqual({ implementations: 0, reviews: 0, checks: 0 })
})

it('rechecks queued CAS inside the SQLite transaction when another connection changes the intent first', async () => {
  const f = await setup(), id = 'queued-cas'
  await f.service.execute({ resource: 'runs', body: { id, planId: f.plan.id } }, f.signal); await f.provisioning
  const sibling = openStore({ directory: f.operations, checkoutRoots: [f.source, f.workspaceRoot] }); cleanup.push(() => sibling.close())
  const transaction = f.store.transaction.bind(f.store)
  vi.spyOn(f.store, 'transaction').mockImplementationOnce(operation => {
    sibling.appendEvent({ id: 'sibling-stop', projectId: f.plan.projectId, type: 'api.run.intent', at: new Date().toISOString(), data: {
      version: 2, data: { id, projectId: f.plan.projectId, planId: f.plan.id, status: 'cancelled' },
    } })
    return transaction(operation)
  })
  await expect(f.service.execute({ resource: 'runs', id, action: 'pause', body: { expectedVersion: 1 } }, f.signal)).rejects.toThrow()
  expect(await f.service.read('runStatus', id, {})).toEqual({ id, status: 'cancelled', version: 2 })
  f.release(); await f.service.close!()
  expect(f.counts()).toEqual({ implementations: 0, reviews: 0, checks: 0 })
})
