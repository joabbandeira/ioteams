import { afterEach, expect, it, vi } from 'vitest'
import { openStore } from '@ioteams/storage'
import { openKnowledge } from '@ioteams/knowledge'
import { createLocalServer, createDomainServices } from '../../../apps/server/src/index.js'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
it('serves a secret-free same-origin panel and exchanges the private browser capability once while preserving the CLI session', async () => {
  const store = openStore({ memory: true })
  const server = createLocalServer({ store, services: { async read() { return [] }, async execute() { throw Error() } }, panelHtml: '<!doctype html><html><script>void 0</script></html>' })
  const origin = await server.listen(); cleanup.push(async () => { await server.close(); store.close() })
  const root = await fetch(origin)
  expect(root.status).toBe(200); expect(root.headers.get('content-security-policy')).toContain("script-src 'sha256-")
  expect(await root.text()).not.toContain(server.browserBootstrapSecret)
  const post = (path: string, secret: string, source = origin) => fetch(origin + path, { method: 'POST', headers: { origin: source, 'content-type': 'application/json' }, body: JSON.stringify({ secret }) })
  const cli = await post('/api/v1/session/bootstrap', server.bootstrapSecret)
  const cliCookie = cli.headers.get('set-cookie')!.split(';')[0]
  expect((await post('/api/v1/session/browser', server.browserBootstrapSecret, 'https://evil.test')).status).toBe(403)
  expect((await post('/api/v1/session/browser', 'wrong')).status).toBe(401)
  const browser = await post('/api/v1/session/browser', server.browserBootstrapSecret)
  expect(browser.status).toBe(200); expect(browser.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict')
  const browserCookie = browser.headers.get('set-cookie')!.split(';')[0]
  expect(browserCookie).not.toBe(cliCookie)
  expect((await post('/api/v1/session/browser', server.browserBootstrapSecret)).status).toBe(401)
  for (const cookie of [cliCookie, browserCookie]) expect((await fetch(origin + '/api/v1/session', { headers: { cookie } })).status).toBe(200)
  expect((await fetch(origin + '/api/v1/bindings')).status).toBe(401)
  const { request } = await import('node:http')
  const rebound = await new Promise<number>(resolve => request(origin, { headers: { host: 'evil.test' } }, res => { res.resume(); resolve(res.statusCode!) }).end())
  expect(rebound).toBe(403)
})
it('reads the pure trusted binding projection without invoking effectful planningPolicy', async () => {
  const store = openStore({ memory: true }), index = openKnowledge({ memory: true }), planningPolicy = vi.fn()
  const service = createDomainServices({ store, index, catalogRoot: '/fixture', planningPolicy, planningBindings: () => [] })
  cleanup.push(async () => { await service.close!(); index.close(); store.close() })
  expect(await service.read('bindings', undefined, {})).toEqual([])
  expect(planningPolicy).not.toHaveBeenCalled()
})
