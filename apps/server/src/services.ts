import { randomUUID, createHash } from 'node:crypto'
import { z } from 'zod'
import { loadCatalog } from '@ioteams/catalog'
import { createTask, transitionTask } from '@ioteams/core'
import { searchKnowledge, type KnowledgeIndex, type SearchKnowledgeOptions } from '@ioteams/knowledge'
import { ConflictError, canonicalJson, type Store, type EntityKind, type StoreEvent, type JsonValue, type EntityMap, type Versioned } from '@ioteams/storage'
import { PlanningService, ExecutionService, type ApprovedPolicy, type Workspace, type PlanningProposal } from '@ioteams/runtime'
import { ApiError, records, TaskCreateSchema, TaskControlSchema, PlanRequestSchema, PlanApprovalSchema,
  ProposalResponseSchema, type ApiServices, type ApiCommand, type Resource } from './contracts.js'

export interface ExecutionContext { policy: ApprovedPolicy; workspace: Workspace }
export interface DomainServiceOptions {
  store: Store; index: KnowledgeIndex; catalogRoot: string
  planning?: PlanningService; execution?: ExecutionService
  // These are trusted operator bindings, never policy paths or executable input from HTTP.
  planningPolicy?(demandId: string): Promise<ApprovedPolicy>
  executionContext?(planId: string, runId: string): Promise<ExecutionContext>
  policyDirectory?: string
}
const kinds = { projects: 'project', demands: 'demand', plans: 'approvedPlan', sprints: 'sprint', tasks: 'task', runs: 'run', approvals: 'approval' } as const
const json = (input: unknown) => z.json().parse(JSON.parse(JSON.stringify(input)))
function events(store: Store, projectId?: string) {
  const result: StoreEvent[] = []; let cursor = 0
  while (true) { const page = store.eventsAfter(cursor, { projectId, limit: 1000 }); result.push(...page); if (page.length < 1000) return result; cursor = page.at(-1)!.sequence }
}
export function createDomainServices(options: DomainServiceOptions): ApiServices {
  const { store } = options
  const jobs = new Map<string, { controller: AbortController; done: Promise<void> }>()
  const contexts = new Map<string, ExecutionContext>(), controls = new Set<string>()
  let closed = false
  function requireOpen() { if (closed) throw new ApiError(503, 'SERVER_CLOSING') }
  function requireVersion(kind: EntityKind, id: string, expected: number) {
    const record = store.get(kind, id)
    if (!record) throw new ApiError(404, 'NOT_FOUND')
    if (record.version !== expected) throw new ConflictError()
    return record
  }
  function event(projectId: string, type: string, data: unknown) {
    store.appendEvent({ id: randomUUID(), projectId, type, at: new Date().toISOString(), data: json(data) })
  }
  function drafts(): Map<string, Versioned<EntityMap['demand']>> {
    const result = new Map<string, Versioned<EntityMap['demand']>>()
    for (const item of events(store)) if (item.type === 'api.demand.draft') {
      const draft = records.demands.parse(item.data)
      result.set(draft.data.id, draft)
    }
    return result
  }
  function demandRecord(id: string): Versioned<EntityMap['demand']> | undefined {
    const draft = drafts().get(id), actual = store.get('demand', id)
    return draft ? { version: draft.version, data: actual?.data ?? draft.data } : actual
  }
  function draftEvent(record: Versioned<EntityMap['demand']>) { event(record.data.projectId, 'api.demand.draft', record) }
  function proposal(demandId: string): PlanningProposal {
    const demand = store.get('demand', demandId)
    if (!demand) throw new ApiError(404, 'NOT_FOUND')
    const proposed = events(store, demand.data.projectId).find(e => e.type === 'planning.proposed' && (e.data as unknown as PlanningProposal)?.demand?.id === demandId)
    if (!proposed) throw new ApiError(404, 'PROPOSAL_UNAVAILABLE')
    const value = proposed.data as unknown as PlanningProposal, { hash, ...body } = value
    if (createHash('sha256').update(canonicalJson(json(body))).digest('hex') !== hash) throw new ApiError(409, 'PROPOSAL_MISMATCH')
    return value
  }
  function launch(key: string, projectId: string, signal: AbortSignal, work: (signal: AbortSignal) => Promise<unknown>) {
    if (jobs.has(key) || events(store).some(e => e.type === 'api.job.started' && (e.data as Record<string, JsonValue>).key === key)) throw new ApiError(409, 'RECONCILIATION_REQUIRED')
    const controller = new AbortController()
    event(projectId, 'api.job.started', { key })
    // Defer work so the controller and ownership exist before a synchronous callback can settle.
    const done = Promise.resolve().then(async () => {
      try {
        await work(AbortSignal.any([signal, controller.signal]))
        event(projectId, 'api.job.finished', { key })
      } catch { event(projectId, 'api.job.failed', { key, reason: 'RUNTIME_CONFLICT' }) }
    }).finally(() => { jobs.delete(key) })
    jobs.set(key, { controller, done })
  }
  async function context(planId: string, runId: string) {
    const existing = contexts.get(runId)
    if (existing) {
      if (existing.policy.snapshot.plan.id !== planId) throw new ApiError(409, 'POLICY_MISMATCH')
      return existing
    }
    if (!options.executionContext) throw new ApiError(503, 'RUNTIME_UNCONFIGURED')
    const loaded = await options.executionContext(planId, runId)
    if (loaded.policy.snapshot.plan.id !== planId) throw new ApiError(409, 'POLICY_MISMATCH')
    contexts.set(runId, loaded); return loaded
  }
  function mutableDemand(id: string) {
    if (store.list('approvedPlan').some(p => p.data.demandId === id) || events(store).some(e =>
      e.type === 'planning.proposed' && (e.data as unknown as PlanningProposal)?.demand?.id === id) || jobs.has(`plan:${id}`) || events(store).some(e => e.type === 'api.job.started' && (e.data as Record<string, JsonValue>).key === `plan:${id}`))
      throw new ApiError(409, 'DEMAND_FROZEN')
  }
  return {
    async read(resource: Resource, id: string | undefined, query: Record<string, string>) {
      requireOpen()
      if (resource === 'catalog') return loadCatalog(options.catalogRoot)
      if (resource === 'runStatus') {
        const run = store.get('run', id!)
        if (run) return options.execution?.status(id!) ?? { id, status: run.data.status }
        const history = events(store).filter(e => (e.data as Record<string, JsonValue>)?.key === `run:${id}`)
        if (!history.length) throw new ApiError(404, 'NOT_FOUND')
        if (history.at(-1)!.type === 'api.job.failed') return { id, status: 'blocked', reason: 'RUNTIME_CONFLICT' }
        return jobs.has(`run:${id}`) ? { id, status: 'queued' } : { id, status: 'blocked', reason: 'RECONCILIATION_REQUIRED' }
      }
      if (resource === 'planningStatus') {
        const demand = demandRecord(id!)
        if (!demand) throw new ApiError(404, 'NOT_FOUND')
        const history = events(store, demand.data.projectId)
        const approved = store.list('approvedPlan', demand.data.projectId).find(p => p.data.demandId === id)
        const proposed = history.find(e => e.type === 'planning.proposed' && (e.data as unknown as PlanningProposal)?.demand?.id === id)
        if (proposed) { const value = proposal(id!); return approved ? { demandId: id, status: 'approved', hash: value.hash, planId: approved.data.id } : { demandId: id, status: 'proposed', hash: value.hash } }
        const gap = history.find(e => e.type === 'planning.competency_needed' && (e.data as Record<string, JsonValue>).demandId === id)
        if (gap) return { demandId: id, status: 'needs_competency', gaps: (gap.data as Record<string, JsonValue>).gaps }
        const job = history.filter(e => e.type.startsWith('api.job.') && (e.data as Record<string, JsonValue>).key === `plan:${id}`).at(-1)
        if (!job) return { demandId: id, status: 'draft' }
        return job.type === 'api.job.failed' || job.type === 'api.job.started' && !jobs.has(`plan:${id}`)
          ? { demandId: id, status: 'blocked', reason: 'RUNTIME_CONFLICT' } : { demandId: id, status: 'planning' }
      }
      if (resource === 'proposals') {
        const value = proposal(id!)
        return ProposalResponseSchema.parse({ demandId: value.demand.id, hash: value.hash, plan: value.policy.plan, team: value.team,
          requirements: value.demand.requirements, citations: value.roles.flatMap(role => role.citations), productGoal: value.productGoal, sprintGoal: value.sprintGoal, productBacklog: value.productBacklog, sprintBacklog: value.sprintBacklog, definitionOfDone: value.definitionOfDone, roles: value.roles })
      }
      if (!(resource in kinds)) throw new ApiError(404, 'NOT_FOUND')
      if (resource === 'demands') {
        if (id) { const value = demandRecord(id); if (!value) throw new ApiError(404, 'NOT_FOUND'); return value }
        const combined = drafts()
        for (const value of store.list('demand', query.projectId)) combined.set(value.data.id, demandRecord(value.data.id)!)
        return [...combined.values()].filter(value => !query.projectId || value.data.projectId === query.projectId).sort((a, b) => a.data.id.localeCompare(b.data.id))
      }
      const kind = kinds[resource as keyof typeof kinds]
      const result = id ? store.get(kind, id) : store.list(kind, query.projectId)
      if (!result) throw new ApiError(404, 'NOT_FOUND')
      return result
    },
    async execute(command: ApiCommand, signal: AbortSignal) {
      requireOpen(); if (signal.aborted) throw new ApiError(503, 'SERVER_CLOSING')
      const { resource, id, action } = command
      if (resource === 'knowledge') return searchKnowledge(options.index, command.body as SearchKnowledgeOptions)
      if (resource === 'demands' && !action) {
        if (!id) {
          const data = records.demands.shape.data.parse(command.body)
          if (demandRecord(data.id)) throw new ConflictError()
          const record = { version: 1, data }; draftEvent(record); return record
        }
        const { expectedVersion, data } = command.body as { expectedVersion: number; data: unknown }
        const parsed = records.demands.shape.data.parse(data), previous = demandRecord(id)
        if (!previous) throw new ApiError(404, 'NOT_FOUND')
        if (previous.version !== expectedVersion || parsed.id !== id || parsed.projectId !== previous.data.projectId) throw new ConflictError()
        mutableDemand(id)
        const record = { version: previous.version + 1, data: parsed }; draftEvent(record); return record
      }
      if (['projects', 'sprints'].includes(resource) && !action) {
        const name = resource as 'projects' | 'demands' | 'sprints', kind = kinds[name]
        if (!id) {
          const data = records[name].shape.data.parse(command.body)
          return store.transaction(() => {
            const created = store.create(kind, data as never)
            event('projectId' in data ? data.projectId : data.id, `api.${kind}.created`, { id: data.id, version: created.version })
            return created
          })
        }
        const { expectedVersion, data } = command.body as { expectedVersion: number; data: unknown }
        const parsed = records[name].shape.data.parse(data)
        if (parsed.id !== id) throw new ApiError(409, 'IDENTITY_MISMATCH')
        if (resource === 'demands') mutableDemand(id)
        return store.transaction(() => {
          const updated = store.update(kind, parsed as never, expectedVersion)
          event('projectId' in parsed ? parsed.projectId : parsed.id, `api.${kind}.updated`, { id, version: updated.version })
          return updated
        })
      }
      if (resource === 'tasks' && !id) {
        const value = TaskCreateSchema.parse(command.body)
        const plan = store.get('approvedPlan', value.planId)?.data
        if (!plan || plan.projectId !== value.projectId) throw new ApiError(404, 'NOT_FOUND')
        const source = proposal(plan.demandId)
        const approved = events(store, value.projectId).some(e => e.type === 'planning.approved' &&
          (e.data as Record<string, JsonValue>).demandId === plan.demandId && (e.data as Record<string, JsonValue>).proposalHash === source.hash)
        if (!approved || source.policy.plan.policyHash !== plan.plan.policyHash) throw new ApiError(409, 'PROPOSAL_MISMATCH')
        const catalog = (await loadCatalog(options.catalogRoot)).map(entry => entry.metadata)
        const task = plan.plan.tasks.find(t => t.id === value.taskId)
        const professional = catalog.find(p => p.kind === 'professional' && p.id === task?.professionalId)
        const team = catalog.find(p => p.kind === 'team' && p.id === plan.plan.teamId)
        if (!team || canonicalJson(json(team)) !== canonicalJson(json(source.team))) throw new ApiError(409, 'CATALOG_MISMATCH')
        const requirements = source.demand.requirements.find(r => r.taskId === value.taskId)?.competencies
        if (!task || !professional || !team || !requirements) throw new ApiError(409, 'CATALOG_MISMATCH')
        const state = createTask({ mode: 'operational', task, professional, team, requirements,
          definitionOfDone: plan.plan.definitionOfDone, delivery: { pushRequired: true, branch: plan.plan.branch, remote: plan.plan.remote } })
        return store.transaction(() => {
          const created = store.create('task', { id: value.taskId, projectId: value.projectId, planId: value.planId,
            ...(value.sprintId ? { sprintId: value.sprintId } : {}), state })
          event(value.projectId, 'api.task.created', { id: created.data.id }); return created
        })
      }
      if (resource === 'tasks' && id && action === 'transition') {
        const value = TaskControlSchema.parse(command.body)
        return store.transaction(() => {
          const task = store.get('task', id); if (!task) throw new ApiError(404, 'NOT_FOUND')
          if (store.list('run', task.data.projectId).some(r => r.data.planId === task.data.planId && ['running', 'awaiting_approval', 'paused', 'interrupted'].includes(r.data.status))) throw new ApiError(409, 'TASK_OWNED_BY_RUN')
          const updated = store.update('task', { ...task.data, state: transitionTask(task.data.state,
            { target: value.target, reason: value.reason, eventId: randomUUID(), at: new Date().toISOString() }) }, value.expectedVersion)
          event(task.data.projectId, 'api.task.transitioned', { id, status: updated.data.state.status }); return updated
        })
      }
      if (resource === 'demands' && id && action === 'plan') {
        const value = PlanRequestSchema.parse(command.body), record = demandRecord(id)
        if (!record) throw new ApiError(404, 'NOT_FOUND')
        if (record.version !== value.expectedVersion) throw new ConflictError()
        const demand = record.data
        if (!options.planning || !options.planningPolicy) throw new ApiError(503, 'RUNTIME_UNCONFIGURED')
        mutableDemand(id)
        // CAS synchronously reserves this version before the first async/external operation.
        draftEvent({ version: record.version + 1, data: demand })
        launch(`plan:${id}`, demand.projectId, signal, async activeSignal => {
          const authority = await options.planningPolicy!(id)
          if (activeSignal.aborted) throw new ApiError(409, 'INTERRUPTED')
          return options.planning!.propose({ ...demand, teamId: value.teamId, requirements: value.requirements }, authority, activeSignal)
        })
        return { id, status: 'accepted' }
      }
      if (resource === 'demands' && id && action === 'approve') {
        const value = PlanApprovalSchema.parse(command.body), demand = demandRecord(id)
        if (!demand) throw new ApiError(404, 'NOT_FOUND')
        if (demand.version !== value.expectedVersion) throw new ConflictError()
        if (!options.planning || !options.policyDirectory) throw new ApiError(503, 'RUNTIME_UNCONFIGURED')
        const valueProposal = proposal(id)
        if (valueProposal.hash !== value.reviewedHash) throw new ApiError(409, 'PROPOSAL_MISMATCH')
        if (controls.has(`approve:${id}`)) throw new ApiError(409, 'BUSY')
        controls.add(`approve:${id}`)
        try {
          const policy = await options.planning.approve(id, value.reviewedHash, options.policyDirectory)
          return store.get('approvedPlan', policy.snapshot.plan.id)
        } finally { controls.delete(`approve:${id}`) }
      }
      if (resource === 'runs' && !id) {
        const value = command.body as { id: string; planId: string }, plan = store.get('approvedPlan', value.planId)
        if (!plan) throw new ApiError(404, 'NOT_FOUND')
        if (!options.execution || !options.executionContext) throw new ApiError(503, 'RUNTIME_UNCONFIGURED')
        if (store.get('run', value.id)) throw new ApiError(409, 'RUN_EXISTS')
        launch(`run:${value.id}`, plan.data.projectId, signal, async activeSignal => {
          const bound = await context(value.planId, value.id)
          if (activeSignal.aborted) throw new ApiError(409, 'INTERRUPTED')
          return options.execution!.start({ id: value.id }, bound.policy, bound.workspace, activeSignal)
        })
        return { id: value.id, status: 'accepted' }
      }
      if (resource === 'runs' && id && action) {
        const value = command.body as { expectedVersion: number; retryPush?: boolean }
        const run = store.get('run', id); if (!run) throw new ApiError(404, 'NOT_FOUND')
        requireVersion('run', id, value.expectedVersion)
        if (!options.execution) throw new ApiError(503, 'RUNTIME_UNCONFIGURED')
        if (controls.has(id)) throw new ApiError(409, 'BUSY')
        if (run.data.status === 'completed' || run.data.status === 'cancelled' && action !== 'reconcile') throw new ApiError(409, 'TERMINAL_RUN')
        controls.add(id)
        try {
          const job = jobs.get(`run:${id}`)
          if (action === 'pause' || action === 'cancel') {
            if (!job && ['running', 'awaiting_approval'].includes(run.data.status)) throw new ApiError(409, 'RECONCILIATION_REQUIRED')
            if (job) { job.controller.abort(); await job.done }
            const current = store.get('run', id)!
            if (current.data.status === 'completed') return { id, status: 'completed' }
            const status = action === 'pause' ? 'paused' : 'cancelled'
            store.update('run', { ...current.data, status }, current.version)
            event(current.data.projectId, 'api.run.controlled', { id, status })
            return { id, status }
          }
          if (job) throw new ApiError(409, 'BUSY')
          const bound = await context(run.data.planId, id)
          requireVersion('run', id, value.expectedVersion)
          if (action === 'reconcile') return options.execution.reconcile({ id, retryPush: value.retryPush ?? false }, bound.policy, bound.workspace)
          if (action === 'resume') {
            // Resume has an explicit new intent, while the runtime retains responsibility for reconciliation.
            const controller = new AbortController()
            const done = options.execution.resume({ id }, bound.policy, bound.workspace, AbortSignal.any([signal, controller.signal]))
              .then(result => { event(run.data.projectId, 'api.job.finished', { key: `run:${id}`, result }) })
              .catch(() => { event(run.data.projectId, 'api.job.failed', { key: `run:${id}`, reason: 'RUNTIME_CONFLICT' }) })
              .finally(() => { jobs.delete(`run:${id}`) })
            jobs.set(`run:${id}`, { controller, done })
            return { id, status: store.get('run', id)!.data.status }
          }
        } finally { controls.delete(id) }
      }
      if (resource === 'approvals' && id && action === 'decide') {
        const value = command.body as { expectedVersion: number; decision: 'accept' | 'decline' | 'cancel' }
        requireVersion('approval', id, value.expectedVersion)
        const approval = store.get('approval', id)!.data
        if (!options.execution) throw new ApiError(503, 'RUNTIME_UNCONFIGURED')
        await options.execution.respondToApproval(approval.runId, approval.requestId, value.decision)
        return { id, status: 'decided' }
      }
      throw new ApiError(404, 'NOT_FOUND')
    },
    async close() {
      closed = true
      for (const job of jobs.values()) job.controller.abort()
      await Promise.allSettled([...jobs.values()].map(job => job.done))
      // Workspace leases intentionally survive interruption/uncertainty; the trusted owner reconciles and releases them.
    },
  }
}
