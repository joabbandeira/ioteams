import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore } from '@ioteams/storage'
import { openKnowledge } from '@ioteams/knowledge'
import { createDomainServices } from '../../../apps/server/src/services.js'
import { createLocalServer } from '../../../apps/server/src/index.js'
const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ioteams-api-'))); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const store = openStore({ memory: true }); cleanup.push(() => store.close())
  const index = openKnowledge({ memory: true }); cleanup.push(() => index.close())
  const services = createDomainServices({ store, index, catalogRoot: root })
  const server = createLocalServer({ store, services }); const origin = await server.listen(); cleanup.push(() => server.close())
  const boot = await fetch(`${origin}/api/v1/session/bootstrap`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ secret: server.bootstrapSecret }) })
  const headers = { origin, cookie: boot.headers.get('set-cookie')!.split(';')[0], 'x-csrf-token': (await boot.json() as { csrfToken: string }).csrfToken, 'content-type': 'application/json' }
  const request = async (path: string, method = 'GET', body?: unknown, key = 'key') => fetch(`${origin}/api/v1/${path}`, { method, headers: { ...headers, 'idempotency-key': key }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  return { store, services, request, root }
}
it('persists project/demand/sprint commands and rejects stale versions and unknown fields', async () => {
  const f = await setup()
  const project = { id: 'p1', name: 'Project', repositoryPath: f.root }
  expect((await f.request('projects', 'POST', project, 'p1')).status).toBe(200)
  expect(await (await f.request('projects/p1')).json()).toEqual({ version: 1, data: project })
  expect((await f.request('projects/p1', 'PATCH', { expectedVersion: 1, data: { ...project, name: 'New' } }, 'update')).status).toBe(200)
  expect((await f.request('projects/p1', 'PATCH', { expectedVersion: 1, data: project }, 'stale')).status).toBe(409)
  expect(f.store.get('project', 'p1')?.data.name).toBe('New')
  expect((await f.request('demands', 'POST', { id: 'd1', projectId: 'p1', goal: 'Goal' }, 'd1')).status).toBe(200)
  expect((await f.request('sprints', 'POST', { id: 's1', projectId: 'p1', goal: { id: 'sg1', objective: 'Sprint goal' }, definitionOfDone: { id: 'dod1', criteria: ['Verified'] } }, 's1')).status).toBe(200)
  expect((await f.request('projects/p1', 'PATCH', { expectedVersion: 2, data: { ...project, token: 'private' } }, 'unknown')).status).toBe(400)
  expect((await f.request('projects/p1', 'PATCH', { expectedVersion: 2, data: { ...project, id: 'p2' } }, 'wrong-id')).status).toBe(409)
})
it('reads catalog/search and refuses unconfigured execution authority or arbitrary control', async () => {
  const f = await setup()
  expect(await (await f.request('catalog')).json()).toEqual([])
  expect(await (await f.request('knowledge/search', 'POST', { query: 'test' })).json()).toEqual({ status: 'no_evidence', reason: 'empty_index', citations: [] })
  expect((await f.request('runs', 'POST', { id: 'r1', planId: 'plan1' }, 'run')).status).toBe(404)
  expect((await f.request('shell', 'POST', { executable: 'sh' })).status).toBe(404)
  expect((await f.request('tasks/t1/transition', 'POST', { expectedVersion: 1, target: 'DONE' }, 'done')).status).toBe(400)
  expect((await f.request('knowledge/search', 'POST', { query: 'x', executable: 'sh' })).status).toBe(400)
})
it('persists replay receipts across server and SQLite reopen; never repeats uncertain intents', async () => {
  const f = await setup()
  const directory = join(f.root, 'state'), checkout = join(f.root, 'checkout'); await mkdir(directory); await mkdir(checkout)
  let store = openStore({ directory, checkoutRoots: [checkout] })
  const input = { id: 'p1', name: 'Project', repositoryPath: checkout }
  const operate = async () => {
    const memoryIndex = openKnowledge({ memory: true })
    const service = createDomainServices({ store, index: memoryIndex, catalogRoot: f.root })
    // Scope the extra memory index to this helper.
    const server = createLocalServer({ store, services: service }); const origin = await server.listen()
    const boot = await fetch(`${origin}/api/v1/session/bootstrap`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ secret: server.bootstrapSecret }) })
    const { csrfToken } = await boot.json() as { csrfToken: string }
    const headers = { origin, cookie: boot.headers.get('set-cookie')!.split(';')[0], 'x-csrf-token': csrfToken, 'content-type': 'application/json', 'idempotency-key': 'persistent' }
    const res = await fetch(`${origin}/api/v1/projects`, { method: 'POST', headers, body: JSON.stringify(input) })
    const outcome = { status: res.status, body: await res.json() }
    await server.close(); memoryIndex.close(); return outcome
  }
  const first = await operate(); store.close(); store = openStore({ directory, checkoutRoots: [checkout] })
  try { expect(await operate()).toEqual(first); expect(store.list('project')).toHaveLength(1) } finally { store.close() }
})
