import { afterEach, expect, it } from 'vitest'
import { openStore } from '@ioteams/storage'
import { createLocalServer } from '../../../apps/server/src/index.js'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function setup() {
  const store = openStore({ memory: true })
  const server = createLocalServer({ store, services: {
    async read() { return [] },
    async execute(command) {
      if (command.resource === 'projects') return store.create('project', command.body as never)
      throw new Error('secret: private transcript')
    },
  }, pollMs: 10, heartbeatMs: 25 })
  const origin = await server.listen()
  cleanup.push(async () => { await server.close(); store.close() })
  const bootstrap = await fetch(`${origin}/api/v1/session/bootstrap`, { method: 'POST',
    headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ secret: server.bootstrapSecret }) })
  expect(bootstrap.status).toBe(200)
  const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0]
  const { csrfToken } = await bootstrap.json() as { csrfToken: string }
  const headers = { origin, cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json' }
  return { store, server, origin, headers, cookie }
}
it('requires session, exact origin and CSRF before domain effects', async () => {
  const f = await setup()
  expect((await fetch(`${f.origin}/api/v1/projects`)).status).toBe(401)
  for (const headers of [{ ...f.headers, origin: 'https://evil.test' }, { ...f.headers, 'x-csrf-token': '' }, { ...f.headers, origin: '' }]) {
    expect((await fetch(`${f.origin}/api/v1/projects`, { method: 'POST', headers,
      body: JSON.stringify({ id: 'p1', name: 'Project', repositoryPath: '/fixture' }) })).status).toBe(403)
  }
  expect(f.store.list('project')).toEqual([])
})
it('sets private cookies and consumes the bootstrap capability once without URL credentials', async () => {
  const f = await setup()
  const res = await fetch(`${f.origin}/api/v1/session/bootstrap`, { method: 'POST',
    headers: { origin: f.origin, 'content-type': 'application/json' }, body: JSON.stringify({ secret: f.server.bootstrapSecret }) })
  expect(res.status).toBe(401)
  expect((await fetch(`${f.origin}/api/v1/projects?token=${f.server.bootstrapSecret}`, { headers: f.headers })).status).toBe(400)
  expect((await fetch(`${f.origin}/api/v1/session`, { headers: f.headers })).status).toBe(200)
})
it('validates strict payloads, required keys and safe errors; replays effects exactly once', async () => {
  const f = await setup(), url = `${f.origin}/api/v1/projects`
  const body = { id: 'p1', name: 'Project', repositoryPath: '/fixture' }
  expect((await fetch(url, { method: 'POST', headers: f.headers, body: JSON.stringify(body) })).status).toBe(400)
  const headers = { ...f.headers, 'idempotency-key': 'project-one' }
  expect((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...body, shell: 'bad' }) })).status).toBe(400)
  const [a, b] = await Promise.all([1, 2].map(() => fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })))
  expect([a.status, b.status]).toEqual([200, 200])
  expect(await a.json()).toEqual(await b.json())
  expect(f.store.list('project')).toHaveLength(1)
  expect((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...body, name: 'Changed' }) })).status).toBe(409)
  const failure = await fetch(`${f.origin}/api/v1/demands`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'fail' },
    body: JSON.stringify({ id: 'd1', projectId: 'p1', goal: 'Goal' }) })
  expect(failure.status).toBe(500)
  expect(await failure.text()).not.toContain('secret')
})
it('limits request bodies before domain effects', async () => {
  const f = await setup()
  const res = await fetch(`${f.origin}/api/v1/projects`, { method: 'POST', headers: { ...f.headers, 'idempotency-key': 'big' },
    body: JSON.stringify({ name: 'x'.repeat(1_100_000) }) })
  expect(res.status).toBe(413)
})
it('streams only safe event metadata, catches live commits and reconnects after the last persisted ID', async () => {
  const f = await setup()
  f.store.create('project', { id: 'p1', name: 'Project', repositoryPath: '/fixture' })
  const append = (id: string) => f.store.appendEvent({ id, projectId: 'p1', type: 'execution.status', at: new Date().toISOString(), data: { token: 'secret-token', transcript: 'private text' } })
  append('e1'); append('e2')
  const abort = new AbortController()
  const res = await fetch(`${f.origin}/api/v1/events`, { headers: { ...f.headers, 'last-event-id': '1' }, signal: abort.signal })
  expect(res.headers.get('content-type')).toContain('text/event-stream')
  const reader = res.body!.getReader()
  const first = new TextDecoder().decode((await reader.read()).value)
  expect(first).toContain('id: 2\n')
  expect(first).not.toContain('id: 1\n')
  expect(first).not.toContain('secret-token')
  expect(first).not.toContain('private text')
  append('e3')
  let live = ''
  while (!live.includes('id: 3\n')) live += new TextDecoder().decode((await reader.read()).value)
  expect(live.match(/id: 3\n/g)).toHaveLength(1)
  abort.abort()
  const reconnect = new AbortController()
  const next = await fetch(`${f.origin}/api/v1/events`, { headers: { ...f.headers, 'last-event-id': '2' }, signal: reconnect.signal })
  const chunk = new TextDecoder().decode((await next.body!.getReader().read()).value)
  expect(chunk).toContain('id: 3\n')
  expect(chunk).not.toContain('id: 2\n')
  reconnect.abort()
  expect((await fetch(`${f.origin}/api/v1/events`, { headers: { ...f.headers, 'last-event-id': '900' } })).status).toBe(400)
})
it('refuses an unresolved durable intent without repeating the effect', async () => {
  const f = await setup(), body = { id: 'p1', name: 'Project', repositoryPath: '/fixture' }
  f.store.command({ id: 'api:uncertain', input: { method: 'POST', path: '/api/v1/projects', body } }, () => ({ state: 'pending' }))
  const res = await fetch(`${f.origin}/api/v1/projects`, { method: 'POST', headers: { ...f.headers, 'idempotency-key': 'uncertain' }, body: JSON.stringify(body) })
  expect(res.status).toBe(409)
  expect(await res.json()).toEqual({ error: 'RECONCILIATION_REQUIRED' })
  expect(f.store.list('project')).toEqual([])
})
it('validates responses as well as requests and never serializes an extra private field', async () => {
  const store = openStore({ memory: true })
  const server = createLocalServer({ store, services: { async read() { return [{ version: 1, data: { id: 'p1', name: 'P', repositoryPath: '/fixture', secret: 'private-content' } }] }, async execute() { return {} } } })
  const origin = await server.listen(); cleanup.push(async () => { await server.close(); store.close() })
  const boot = await fetch(`${origin}/api/v1/session/bootstrap`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ secret: server.bootstrapSecret }) })
  const setCookie = boot.headers.get('set-cookie')!
  expect(setCookie).toContain('HttpOnly'); expect(setCookie).toContain('SameSite=Strict'); expect(setCookie).not.toContain('Domain=')
  const res = await fetch(`${origin}/api/v1/projects`, { headers: { cookie: setCookie.split(';')[0] } })
  expect(res.status).toBe(500); expect(await res.text()).not.toContain('private-content')
})
it('rejects Host rebinding, cross-site reads and duplicate query controls', async () => {
  const f = await setup()
  const { request } = await import('node:http')
  const status = await new Promise<number>(resolve => {
    request(`${f.origin}/api/v1/projects`, { headers: { ...f.headers, host: 'evil.test' } }, res => { res.resume(); resolve(res.statusCode!) }).end()
  })
  expect(status).toBe(403)
  expect((await fetch(`${f.origin}/api/v1/projects`, { headers: { ...f.headers, 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
  expect((await fetch(`${f.origin}/api/v1/projects?projectId=p1&projectId=p2`, { headers: f.headers })).status).toBe(400)
  expect((await fetch(`${f.origin}/api/v1/projects?__proto__=x`, { headers: f.headers })).status).toBe(400)
})
it('replays multiple event pages once with project filtering and heartbeats without IDs', async () => {
  const f = await setup()
  f.store.create('project', { id: 'p1', name: 'P1', repositoryPath: '/fixture' })
  f.store.create('project', { id: 'p2', name: 'P2', repositoryPath: '/fixture' })
  for (let i = 1; i <= 205; i++) f.store.appendEvent({ id: `page-${i}`, projectId: i % 2 ? 'p1' : 'p2', type: 'changed', at: new Date().toISOString(), data: {} })
  const abort = new AbortController()
  const response = await fetch(`${f.origin}/api/v1/events?projectId=p1`, { headers: f.headers, signal: abort.signal })
  const reader = response.body!.getReader(); let text = ''
  while (!text.includes(': heartbeat')) text += new TextDecoder().decode((await reader.read()).value)
  const ids = [...text.matchAll(/^id: (\d+)$/gm)].map(match => Number(match[1]))
  expect(ids).toHaveLength(103); expect(new Set(ids).size).toBe(103)
  expect(ids[0]).toBe(1); expect(ids.at(-1)).toBe(205); expect(ids.every(id => id % 2 === 1)).toBe(true)
  expect(text).not.toContain('"projectId":"p2"')
  abort.abort()
})
it('rejects an absolute request-target for a different origin even with the local Host header', async () => {
  const f = await setup(), { request } = await import('node:http')
  const status = await new Promise<number>(resolve => {
    request(f.origin, { path: 'http://evil.test/api/v1/projects', headers: f.headers }, res => { res.resume(); resolve(res.statusCode!) }).end()
  })
  expect(status).toBe(403)
})
it('returns a bounded error for oversized chunked JSON without losing the connection response', async () => {
  const f = await setup(), { request } = await import('node:http')
  const outcome = await new Promise<number | string>(resolve => {
    const req = request(`${f.origin}/api/v1/projects`, { method: 'POST', headers: { ...f.headers, 'idempotency-key': 'chunked', 'transfer-encoding': 'chunked' } }, res => { res.resume(); resolve(res.statusCode!) })
    req.on('error', error => resolve((error as NodeJS.ErrnoException).code ?? 'error'))
    req.write('"'); req.write('x'.repeat(1_048_576)); req.end('"')
  })
  expect(outcome).toBe(413)
  expect(f.store.list('project')).toEqual([])
})
