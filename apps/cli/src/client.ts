import { lstat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { IdentifierSchema } from '@ioteams/core'
import { CliError, fail, loadProduct, readPrivateJson, reserve } from './state.js'
const OriginSchema = z.string().regex(/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/).refine(s => Number(new URL(s).port) <= 65535)
const ConnectionSchema = z.strictObject({ version: z.literal(1), origin: OriginSchema, cookie: z.string().regex(/^ioteams_session=[A-Za-z0-9_-]{43}$/), csrfToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
type Connection = z.infer<typeof ConnectionSchema>
async function response(res: Response): Promise<unknown> {
  const reader = res.body?.getReader(); if (!reader) return fail('INVALID_RESPONSE')
  const buffers: Uint8Array[] = []; let size = 0
  try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 4_194_304) fail('INVALID_RESPONSE'); buffers.push(item.value) } }
  finally { await reader.cancel().catch(() => {}) }
  const value: unknown = JSON.parse(Buffer.concat(buffers).toString('utf8'))
  if (!res.ok) {
    const code = z.strictObject({ error: z.string().regex(/^[A-Z0-9_]{1,64}$/) }).safeParse(value)
    throw new CliError(code.success ? code.data.error : 'API_ERROR', res.status === 401 || res.status === 403 ? 3 : res.status === 400 ? 2 : res.status === 409 ? 4 : 1)
  }
  return value
}
/** Consume the server capability in process and persist only in the private product home, never stdout/argv/URLs. */
export async function publishReservedConnection(home: string, rawOrigin: string, secret: string): Promise<() => Promise<void>> {
  await loadProduct(home)
  const origin = OriginSchema.parse(rawOrigin)
  let identity: Awaited<ReturnType<typeof lstat>> | undefined
  const file = join(home, 'connection.json')
  try {
    try { await lstat(file); fail('CONNECTION_EXISTS', 4) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const res = await fetch(`${origin}/api/v1/session/bootstrap`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ secret }) })
    const body = z.strictObject({ csrfToken: z.string() }).parse(await response(res)), cookie = res.headers.get('set-cookie')?.split(';')[0]
    const data = ConnectionSchema.parse({ version: 1, origin, cookie, csrfToken: body.csrfToken })
    await writeFile(file, JSON.stringify(data), { flag: 'wx', mode: 0o600 }); identity = await lstat(file)
    return async () => {
      try {
        const current = await lstat(file)
        if (!identity || current.ino !== identity.ino || current.dev !== identity.dev || current.isSymbolicLink()) fail('CONNECTION_CHANGED', 4)
        await unlink(file)
      } finally { /* Product reservation belongs to the launcher. */ }
    }
  } catch (error) { throw error }
}
export async function publishCliConnection(home: string, origin: string, secret: string): Promise<() => Promise<void>> {
  await loadProduct(home)
  const release = await reserve(join(home, '.ioteams-product-owner.lock'))
  try {
    const disconnect = await publishReservedConnection(home, origin, secret)
    return async () => { await disconnect(); await release() }
  } catch (error) { await release(); throw error }
}
export async function createCliClient(home: string) {
  await loadProduct(home)
  let session: Connection
  try { session = ConnectionSchema.parse(await readPrivateJson(join(home, 'connection.json'))) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fail('SERVER_CONNECTION_REQUIRED', 3); throw error }
  return {
    async request(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, key?: string, signal?: AbortSignal): Promise<unknown> {
      if (!path.startsWith('/api/v1/')) fail('INVALID_TARGET', 2)
      const segments = path.slice('/api/v1/'.length).split('/')
      if (segments.length > 3 || !/^[a-z]+$/.test(segments[0]) || segments.slice(1).some(part => !IdentifierSchema.safeParse(part).success)) fail('INVALID_TARGET', 2)
      if (method !== 'GET' && path !== '/api/v1/knowledge/search' && !key) fail('IDEMPOTENCY_KEY_REQUIRED', 2)
      if (key && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(key)) fail('INVALID_KEY', 2)
      let res: Response
      try {
        res = await fetch(session.origin + path, { method, redirect: 'error', signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(30_000)]),
          headers: { origin: session.origin, cookie: session.cookie, 'x-csrf-token': session.csrfToken, 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
      } catch { return fail(method === 'GET' ? 'SERVER_UNAVAILABLE' : 'OUTCOME_UNCERTAIN', 4) }
      try { return await response(res) }
      catch (error) {
        if (error instanceof CliError && error.code !== 'INVALID_RESPONSE') throw error
        return fail(method === 'GET' ? 'INVALID_RESPONSE' : 'OUTCOME_UNCERTAIN', 4)
      }
    },
  }
}
