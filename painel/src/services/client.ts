import { z } from 'zod'
import { resolveRoute, records, TrustedBindingSchema, CatalogResponseSchema } from '@ioteams/server/contracts'
export class PanelError extends Error {
  constructor(readonly code: string, readonly status = 0) { super(code) }
}
export type PanelTransport = (url: string, options: RequestInit & { headers: Record<string, string> }) => Promise<Response>
export function createPanelClient(transport: PanelTransport = fetch) {
  let csrf: string | undefined
  async function exchange(path: string, method: string, input?: unknown, signal?: AbortSignal, key?: string) {
    let response: Response
    try {
      response = await transport(path, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(30_000)]),
        headers: { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}), ...(key ? { 'idempotency-key': key } : {}) },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }) })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new PanelError(method === 'GET' || path.endsWith('/search') ? 'SERVER_UNAVAILABLE' : 'OUTCOME_UNCERTAIN')
    }
    let value: unknown
    try { value = await response.json() } catch { throw new PanelError(method === 'GET' ? 'INVALID_RESPONSE' : 'OUTCOME_UNCERTAIN') }
    if (!response.ok) {
      if (response.status === 401) csrf = undefined
      const error = z.strictObject({ error: z.string().regex(/^[A-Z0-9_]{1,64}$/) }).safeParse(value)
      throw new PanelError(error.success ? error.data.error : 'INVALID_RESPONSE', response.status)
    }
    return value
  }
  return {
    async session(signal?: AbortSignal) {
      csrf = z.strictObject({ csrfToken: z.string().min(1).max(128) }).parse(await exchange('/api/v1/session', 'GET', undefined, signal)).csrfToken
    },
    async unlock(secret: string) {
      csrf = z.strictObject({ csrfToken: z.string().min(1).max(128) }).parse(await exchange('/api/v1/session/browser', 'POST', { secret })).csrfToken
    },
    async request(method: 'GET' | 'POST' | 'PATCH', path: string, input?: unknown, signal?: AbortSignal, key?: string): Promise<unknown> {
      let route: ReturnType<typeof resolveRoute>, parsed: unknown
      try {
        if (!/^\/api\/v1\/[a-z]+(?:\/[A-Za-z0-9._:-]+){0,2}$/.test(path)) throw Error()
        route = resolveRoute(method, path)
        parsed = method === 'GET' ? undefined : route.input.parse(input)
      } catch { throw new PanelError('INVALID_REQUEST') }
      if (method !== 'GET' && !csrf) throw new PanelError('UNAUTHENTICATED', 401)
      const value = await exchange(path, method, parsed, signal, method === 'GET' || route.resource === 'knowledge' ? undefined : key ?? crypto.randomUUID())
      try { return route.output.parse(value) } catch { throw new PanelError(method === 'GET' ? 'INVALID_RESPONSE' : 'OUTCOME_UNCERTAIN') }
    },
  }
}
export type PanelClient = ReturnType<typeof createPanelClient>
export const CatalogEntriesSchema = CatalogResponseSchema
export const SnapshotSchema = z.strictObject({
  catalog: CatalogEntriesSchema, bindings: z.array(TrustedBindingSchema), projects: z.array(records.projects),
  demands: z.array(records.demands), plans: z.array(records.plans), sprints: z.array(records.sprints),
  tasks: z.array(records.tasks), runs: z.array(records.runs), approvals: z.array(records.approvals),
})
export type PanelSnapshot = z.infer<typeof SnapshotSchema>
export async function loadSnapshot(client: PanelClient, signal?: AbortSignal): Promise<PanelSnapshot> {
  const names = ['catalog', 'bindings', 'projects', 'demands', 'plans', 'sprints', 'tasks', 'runs', 'approvals'] as const
  const values = await Promise.all(names.map(name => client.request('GET', `/api/v1/${name}`, undefined, signal)))
  return SnapshotSchema.parse(Object.fromEntries(names.map((name, index) => [name, values[index]])))
}
export function errorMessage(error: unknown): string {
  const code = error instanceof PanelError ? error.code : 'INVALID_RESPONSE'
  const messages: Record<string, string> = {
    UNAUTHENTICATED: 'A sessão local expirou ou ainda não foi aberta. Abra um novo acesso privado pelo launcher.',
    SERVER_UNAVAILABLE: 'O servidor local está indisponível. Confira o launcher e tente reconectar.',
    INVALID_REQUEST: 'Revise os campos indicados antes de continuar.',
    INVALID_RESPONSE: 'O servidor retornou dados incompatíveis. Confira a versão do painel e reconecte.',
    OUTCOME_UNCERTAIN: 'O resultado da ação é incerto. Atualize os dados e reconcilie com a CLI antes de repetir a ação.',
    CONFLICT: 'Os dados mudaram. Atualize os dados antes de enviar novamente; seu texto foi preservado.',
    DEMAND_FROZEN: 'Esta demanda já entrou em planejamento. Para mudar requisitos, crie outra demanda com um novo binding revisado na CLI.',
    RUNTIME_UNCONFIGURED: 'O runtime não está configurado. Revise a configuração confiável na CLI.',
    RUNTIME_CONFLICT: 'O runtime exige reconciliação. Confira o estado pela CLI antes de continuar.',
    PROPOSAL_MISMATCH: 'O hash revisado diverge da proposta atual. Atualize a proposta e revise o conteúdo completo.',
    INVALID_CSRF: 'A sessão mudou. Reconecte antes de continuar.',
  }
  return messages[code] ?? `A ação não foi confirmada (${code}). Atualize os dados e confira a CLI.`
}
