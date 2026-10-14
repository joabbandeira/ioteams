import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { openStore, type Store } from '@ioteams/storage'
import { createLocalServer } from '../../../apps/server/src/index.js'
const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
const services = { async read() { return [] }, async execute() { return {} } }
async function bootstrap(server: ReturnType<typeof createLocalServer>, origin: string) {
  const res = await fetch(`${origin}/api/v1/session/bootstrap`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ secret: server.bootstrapSecret }) })
  expect(res.status).toBe(200)
  return { origin, cookie: res.headers.get('set-cookie')!.split(';')[0] }
}
it('expires bootstrap capabilities and sessions, including open SSE connections', async () => {
  const store = openStore({ memory: true }); cleanup.push(() => store.close())
  const expired = createLocalServer({ store, services, bootstrapTtlMs: 50 }); const expiredOrigin = await expired.listen(); cleanup.push(() => expired.close())
  await delay(70)
  const refused = await fetch(`${expiredOrigin}/api/v1/session/bootstrap`, { method: 'POST', headers: { origin: expiredOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ secret: expired.bootstrapSecret }) })
  expect(refused.status).toBe(401)
  const server = createLocalServer({ store, services, sessionTtlMs: 150, pollMs: 5, heartbeatMs: 10 }); const origin = await server.listen(); cleanup.push(() => server.close())
  const headers = await bootstrap(server, origin)
  const stream = await fetch(`${origin}/api/v1/events`, { headers })
  expect(await stream.text()).toContain(': heartbeat')
  expect((await fetch(`${origin}/api/v1/projects`, { headers })).status).toBe(401)
})
it('persists SSE sequence across process-lifespan reopen and invalidates the previous session', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ioteams-sse-reopen-'))); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, 'state'), checkout = join(root, 'checkout'); await mkdir(directory); await mkdir(checkout)
  let store = openStore({ directory, checkoutRoots: [checkout] })
  const append = (current: Store, id: string) => current.appendEvent({ id, projectId: 'p1', type: 'execution.status', at: new Date().toISOString(), data: { private: 'never streamed' } })
  store.create('project', { id: 'p1', name: 'P', repositoryPath: checkout }); append(store, 'e1'); append(store, 'e2')
  const first = createLocalServer({ store, services, pollMs: 5, heartbeatMs: 10 }); const origin1 = await first.listen()
  const headers1 = await bootstrap(first, origin1)
  const a = new AbortController(), response1 = await fetch(`${origin1}/api/v1/events`, { headers: headers1, signal: a.signal })
  const chunk1 = new TextDecoder().decode((await response1.body!.getReader().read()).value)
  expect(chunk1).toContain('id: 1\n'); expect(chunk1).toContain('id: 2\n')
  a.abort(); await first.close(); store.close()
  store = openStore({ directory, checkoutRoots: [checkout] }); cleanup.push(() => store.close()); append(store, 'e3')
  const second = createLocalServer({ store, services, pollMs: 5, heartbeatMs: 10 }); const origin2 = await second.listen(); cleanup.push(() => second.close())
  expect((await fetch(`${origin2}/api/v1/projects`, { headers: { cookie: headers1.cookie } })).status).toBe(401)
  const headers2 = await bootstrap(second, origin2), b = new AbortController()
  const response2 = await fetch(`${origin2}/api/v1/events`, { headers: { ...headers2, 'last-event-id': '2' }, signal: b.signal })
  const chunk2 = new TextDecoder().decode((await response2.body!.getReader().read()).value)
  expect(chunk2).toContain('id: 3\n'); expect(chunk2).not.toContain('id: 2\n'); expect(chunk2).not.toContain('never streamed')
  b.abort()
})
it('closes active streams and owns the service lifecycle without closing the caller Store', async () => {
  const store = openStore({ memory: true }); cleanup.push(() => store.close())
  let closed = false
  const server = createLocalServer({ store, services: { ...services, async close() { closed = true } }, pollMs: 5, heartbeatMs: 10 })
  const origin = await server.listen(); const headers = await bootstrap(server, origin)
  const response = await fetch(`${origin}/api/v1/events`, { headers }); const reader = response.body!.getReader()
  await reader.read(); await server.close(); await server.close()
  expect(closed).toBe(true); expect(store.list('project')).toEqual([])
  await expect(fetch(`${origin}/api/v1/projects`, { headers })).rejects.toThrow()
})
it('makes concurrent close calls await the same shutdown before the owner can release storage', async () => {
  const store = openStore({ memory: true }); cleanup.push(() => store.close())
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const server = createLocalServer({ store, services: { ...services, async close() { await held } } })
  await server.listen()
  const first = server.close(); let finished = false
  const second = server.close().then(() => { finished = true })
  await delay(10)
  const premature = finished
  release(); await Promise.all([first, second])
  expect(premature).toBe(false)
})
it('waits for an in-flight resource read before the owner releases its Store or index', async () => {
  const store = openStore({ memory: true }); cleanup.push(() => store.close())
  let entered!: () => void, release!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  const server = createLocalServer({ store, services: { ...services, async read() { entered(); await held; return [] } } })
  const origin = await server.listen(), headers = await bootstrap(server, origin)
  const request = fetch(`${origin}/api/v1/projects`, { headers }).then(res => res.text()).catch(() => '')
  await started
  let finished = false; const closing = server.close().then(() => { finished = true })
  await delay(10); const premature = finished
  release(); await Promise.all([request, closing])
  expect(premature).toBe(false)
})
