import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { once } from 'node:events'
import { z, ZodError } from 'zod'
import { IdentifierSchema } from '@ioteams/core'
import { ConflictError, type Store, type JsonValue, type StoreEvent } from '@ioteams/storage'
import { RuntimePolicyError } from '@ioteams/runtime'
import { ApiError, resolveRoute, type ApiServices } from './contracts.js'

const token = () => randomBytes(32).toString('base64url')
const same = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
const json = (value: unknown) => z.json().parse(JSON.parse(JSON.stringify(value)))
interface Outcome { status: number; body: JsonValue }
interface Session { cookie: string; csrf: string; expires: number }
export interface ServerOptions {
  panelHtml?: string
  store: Store; services: ApiServices; port?: number; pollMs?: number; heartbeatMs?: number; sessionTtlMs?: number; bootstrapTtlMs?: number
}
function safeFailure(error: unknown): Outcome {
  if (error instanceof ApiError) return { status: error.status, body: { error: error.code } }
  if (error instanceof ZodError) return { status: 400, body: { error: 'INVALID_REQUEST' } }
  if (error instanceof ConflictError) return { status: 409, body: { error: 'CONFLICT' } }
  if (error instanceof RuntimePolicyError) return { status: 409, body: { error: 'RUNTIME_CONFLICT' } }
  return { status: 500, body: { error: 'INTERNAL_ERROR' } }
}
async function body(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new ApiError(415, 'JSON_REQUIRED')
  const length = req.headers['content-length']
  if (length && (!/^\d+$/.test(length) || Number(length) > 1_048_576)) throw new ApiError(413, 'BODY_TOO_LARGE')
  const chunks: Buffer[] = []; let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > 1_048_576) throw new ApiError(413, 'BODY_TOO_LARGE')
    chunks.push(chunk)
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) }
  catch { throw new ApiError(400, 'INVALID_JSON') }
}
function send(res: ServerResponse, outcome: Outcome) {
  if (!res.destroyed && !res.writableEnded) { res.writeHead(outcome.status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(outcome.body)) }
}
const EventViewSchema = z.strictObject({ sequence: z.number().int().positive(), id: IdentifierSchema, projectId: IdentifierSchema,
  runId: IdentifierSchema.optional(), type: IdentifierSchema, at: z.iso.datetime({ offset: true }) })
function eventView(event: StoreEvent) {
  const { sequence, id, projectId, runId, type, at } = event
  return EventViewSchema.parse({ sequence, id, projectId, ...(runId ? { runId } : {}), type, at })
}
export function createLocalServer(options: ServerOptions) {
  const { store, services } = options
  const settings = z.strictObject({ port: z.number().int().min(0).max(65535), pollMs: z.number().int().min(5).max(60_000),
    heartbeatMs: z.number().int().min(10).max(60_000), sessionTtlMs: z.number().int().min(50).max(86_400_000),
    bootstrapTtlMs: z.number().int().min(50).max(300_000) }).parse({ port: options.port ?? 0, pollMs: options.pollMs ?? 250,
      heartbeatMs: options.heartbeatMs ?? 15_000, sessionTtlMs: options.sessionTtlMs ?? 28_800_000, bootstrapTtlMs: options.bootstrapTtlMs ?? 120_000 })
  const bootstrapSecret = token(), browserBootstrapSecret = token(), bootstrapExpires = Date.now() + settings.bootstrapTtlMs
  let bootstrapUsed = false, browserBootstrapUsed = false, session: Session | undefined, origin = '', closing = false, started = false
  const sessions = new Map<string, Session>()
  const panel = options.panelHtml
  const scriptHashes = [...(panel ?? '').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`).join(' ')
  let shutdown: Promise<void> | undefined
  const lifetime = new AbortController(), streams = new Set<ServerResponse>(), active = new Map<string, Promise<Outcome>>()
  const requests = new Set<Promise<void>>()
  function authenticate(req: IncomingMessage): Session {
    const cookies = (req.headers.cookie ?? '').split(';').map(c => c.trim()).filter(c => c.startsWith('ioteams_session='))
    const current = cookies.length === 1 ? sessions.get(cookies[0].slice(16)) : undefined
    if (!current || Date.now() >= current.expires) throw new ApiError(401, 'UNAUTHENTICATED')
    return current
  }
  async function command(key: string, input: JsonValue, work: () => Promise<unknown>): Promise<Outcome> {
    const existed = store.getReceipt(`api:${key}`)
    store.command({ id: `api:${key}`, input }, () => ({ state: 'pending' }))
    const result = store.getReceipt(`api-result:${key}`)
    if (result) return result.result as unknown as Outcome
    const running = active.get(key)
    if (running) return running
    if (existed) throw new ApiError(409, 'RECONCILIATION_REQUIRED')
    const pending = (async () => {
      let outcome: Outcome
      try { outcome = { status: 200, body: json(await work()) } } catch (error) { outcome = safeFailure(error) }
      store.command({ id: `api-result:${key}`, input: { key } }, () => json(outcome))
      return outcome
    })()
    active.set(key, pending)
    try { return await pending } finally { active.delete(key) }
  }
  async function sse(req: IncomingMessage, res: ServerResponse, current: Session, projectId?: string) {
    const raw = req.headers['last-event-id'] ?? '0'
    if (typeof raw !== 'string' || !/^(0|[1-9]\d{0,15})$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new ApiError(400, 'INVALID_CURSOR')
    let cursor = Number(raw)
    if (cursor && store.eventsAfter(cursor - 1, { limit: 1 })[0]?.sequence !== cursor) throw new ApiError(400, 'INVALID_CURSOR')
    if (streams.size >= 32) throw new ApiError(429, 'TOO_MANY_STREAMS')
    const controller = new AbortController(), abort = () => controller.abort()
    lifetime.signal.addEventListener('abort', abort, { once: true }); res.once('close', abort)
    streams.add(res)
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'connection': 'keep-alive', 'x-accel-buffering': 'no' })
    res.flushHeaders()
    let lastHeartbeat = Date.now()
    try {
      while (!controller.signal.aborted && Date.now() < current.expires) {
        const page = store.eventsAfter(cursor, { projectId, limit: 100 })
        for (const event of page) {
          if (controller.signal.aborted) break
          const view = eventView(event)
          if (!res.write(`id: ${event.sequence}\nevent: change\ndata: ${JSON.stringify(view)}\n\n`))
            await once(res, 'drain', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) })
          cursor = event.sequence
        }
        if (Date.now() - lastHeartbeat >= settings.heartbeatMs) {
          if (!res.write(': heartbeat\n\n')) await once(res, 'drain', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) })
          lastHeartbeat = Date.now()
        }
        if (page.length < 100) await new Promise<void>(resolve => {
          const done = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', done); resolve() }
          const timer = setTimeout(done, Math.min(settings.pollMs, settings.heartbeatMs))
          controller.signal.addEventListener('abort', done, { once: true })
          if (controller.signal.aborted) done()
        })
      }
    } finally { streams.delete(res); lifetime.signal.removeEventListener('abort', abort); res.off('close', abort); res.end() }
  }
  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('cache-control', 'no-store'); res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'")
    if (closing || req.socket.localAddress !== '127.0.0.1' || req.headers.host !== origin.slice(7)) throw new ApiError(403, 'INVALID_HOST')
    if (req.headers.origin !== undefined && req.headers.origin !== origin || ['cross-site', 'same-site'].includes(String(req.headers['sec-fetch-site']))) throw new ApiError(403, 'INVALID_ORIGIN')
    if (['/', '/index.html', '/demo'].includes(req.url ?? '') && ['GET', 'HEAD'].includes(req.method ?? '')) {
      if (!panel) throw new ApiError(503, 'PANEL_BUILD_REQUIRED')
      res.setHeader('content-security-policy', `default-src 'none'; script-src ${scriptHashes}; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(req.method === 'HEAD' ? undefined : panel); return
    }
    if (!req.url?.startsWith('/api/v1/') || req.url.includes('\\')) throw new ApiError(403, 'INVALID_TARGET')
    const url = new URL(req.url, origin)
    if (url.origin !== origin) throw new ApiError(403, 'INVALID_TARGET')
    if (!url.pathname.startsWith('/api/v1/') || url.hash || url.username || url.password) throw new ApiError(404, 'NOT_FOUND')
    const method = req.method ?? '', mutation = !['GET', 'HEAD'].includes(method)
    if (mutation && req.headers.origin !== origin) throw new ApiError(403, 'INVALID_ORIGIN')
    if (['/api/v1/session/bootstrap', '/api/v1/session/browser'].includes(url.pathname) && method === 'POST') {
      if (url.search) throw new ApiError(400, 'INVALID_REQUEST')
      const input = z.strictObject({ secret: z.string().max(128) }).parse(await body(req))
      const browser = url.pathname.endsWith('/browser')
      if (Date.now() >= bootstrapExpires || (browser ? !bootstrapUsed || browserBootstrapUsed || !same(input.secret, browserBootstrapSecret) : bootstrapUsed || !same(input.secret, bootstrapSecret))) throw new ApiError(401, 'UNAUTHENTICATED')
      if (browser) browserBootstrapUsed = true; else bootstrapUsed = true
      session = { cookie: token(), csrf: token(), expires: Date.now() + settings.sessionTtlMs }
      sessions.set(session.cookie, session)
      res.setHeader('set-cookie', `ioteams_session=${session.cookie}; HttpOnly; SameSite=Strict; Path=/api/v1; Max-Age=${Math.floor(settings.sessionTtlMs / 1000)}`)
      return send(res, { status: 200, body: { csrfToken: session.csrf } })
    }
    const current = authenticate(req)
    if (mutation && (typeof req.headers['x-csrf-token'] !== 'string' || !same(req.headers['x-csrf-token'], current.csrf))) throw new ApiError(403, 'INVALID_CSRF')
    if (url.pathname === '/api/v1/session' && method === 'GET') {
      if (url.search) throw new ApiError(400, 'INVALID_REQUEST')
      return send(res, { status: 200, body: { csrfToken: current.csrf } })
    }
    const query: Record<string, string> = Object.create(null)
    for (const [key, value] of url.searchParams) { if (Object.hasOwn(query, key)) throw new ApiError(400, 'INVALID_REQUEST'); query[key] = value }
    if (url.pathname === '/api/v1/events' && method === 'GET') {
      const filters = z.strictObject({ projectId: IdentifierSchema.optional() }).parse(query)
      return sse(req, res, current, filters.projectId)
    }
    const route = resolveRoute(method, url.pathname)
    route.query.parse(query)
    if (method === 'GET') {
      const output = await services.read(route.resource, route.id, query)
      let valid: unknown
      try { valid = route.output.parse(output) } catch { throw new ApiError(500, 'INVALID_RESPONSE') }
      return send(res, { status: 200, body: json(valid) })
    }
    const input = route.input.parse(await body(req))
    const execute = async () => {
      const output = await services.execute({ resource: route.resource, id: route.id, action: route.action, body: input }, lifetime.signal)
      try { return route.output.parse(output) } catch { throw new ApiError(500, 'INVALID_RESPONSE') }
    }
    if (route.resource === 'knowledge') return send(res, { status: 200, body: json(await execute()) })
    const key = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/).parse(req.headers['idempotency-key'])
    return send(res, await command(key, json({ method, path: url.pathname, body: input }), execute))
  }
  const server = createServer((req, res) => {
    const pending = handle(req, res).catch(error => {
      if (res.headersSent) res.destroy(); else send(res, safeFailure(error))
    })
    requests.add(pending)
    void pending.finally(() => { requests.delete(pending) })
  })
  server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.maxHeadersCount = 64
  return {
    bootstrapSecret, browserBootstrapSecret,
    async listen(): Promise<string> {
      if (started || closing) throw new ApiError(409, 'SERVER_LIFECYCLE')
      started = true
      server.listen(settings.port, '127.0.0.1'); await once(server, 'listening')
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Invalid address')
      origin = `http://127.0.0.1:${address.port}`; return origin
    },
    close(): Promise<void> {
      if (shutdown) return shutdown
      closing = true; lifetime.abort(); for (const stream of streams) stream.destroy()
      const closed = server.listening ? new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) : Promise.resolve()
      server.closeIdleConnections()
      shutdown = (async () => {
        try { await services.close?.(); await Promise.allSettled(active.values()) }
        finally { server.closeAllConnections(); await Promise.allSettled(requests); await closed }
      })()
      return shutdown
    },
  }
}
