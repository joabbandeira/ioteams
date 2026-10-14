import { z } from 'zod'
import { ApprovalDecisionSchema, CatalogMetadataSchema, ContentHashSchema, CreateTaskSchema,
  IdentifierSchema, KnowledgeCitationSchema, RunStatusSchema, TaskTransitionSchema, ProductBacklogSchema, SprintBacklogSchema, DefinitionOfDoneSchema } from '@ioteams/core'
import { EntitySchemas } from '@ioteams/storage'
import { PlanningDemandSchema, PlanningRoleRecordSchema, CompetencyGapSchema } from '@ioteams/runtime'
import { SearchKnowledgeOptionsSchema } from '@ioteams/knowledge'

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}
export const VersionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1)
const empty = z.strictObject({})
const record = <T extends z.ZodType>(schema: T) => z.strictObject({ version: VersionSchema, data: schema })
export const records = {
  projects: record(EntitySchemas.project), demands: record(EntitySchemas.demand), plans: record(EntitySchemas.approvedPlan),
  sprints: record(EntitySchemas.sprint), tasks: record(EntitySchemas.task), runs: record(EntitySchemas.run), approvals: record(EntitySchemas.approval),
}
export type Resource = keyof typeof records | 'catalog' | 'knowledge' | 'proposals' | 'planningStatus' | 'runStatus'
export interface ApiCommand { resource: Resource; id?: string; action?: string; body: unknown }
export interface ApiServices {
  read(resource: Resource, id: string | undefined, query: Record<string, string>): Promise<unknown>
  execute(command: ApiCommand, signal: AbortSignal): Promise<unknown>
  close?(): Promise<void>
}
export interface Route { resource: Resource; id?: string; action?: string; input: z.ZodType; output: z.ZodType; query: z.ZodType }
const listing = z.strictObject({ projectId: IdentifierSchema.optional() })
export const ExecutionResultSchema = z.strictObject({ id: IdentifierSchema, status: RunStatusSchema,
  reason: z.string().max(128).regex(/^[A-Z0-9_]+$/).optional() })
const accepted = z.strictObject({ id: IdentifierSchema, status: z.literal('accepted') })
const version = z.strictObject({ expectedVersion: VersionSchema })
export const TaskCreateSchema = z.strictObject({ projectId: IdentifierSchema, planId: IdentifierSchema,
  sprintId: IdentifierSchema.optional(), taskId: IdentifierSchema })
// Evidence, execution and DONE are produced exclusively by ExecutionService.
export const TaskControlSchema = z.strictObject({ expectedVersion: VersionSchema,
  target: z.enum(['TODO', 'IN_PLANNING', 'READY', 'BLOCKED']), reason: TaskTransitionSchema.shape.reason })
export const PlanRequestSchema = z.strictObject({ expectedVersion: VersionSchema,
  teamId: PlanningDemandSchema.shape.teamId, requirements: PlanningDemandSchema.shape.requirements })
export const PlanApprovalSchema = z.strictObject({ expectedVersion: VersionSchema, reviewedHash: ContentHashSchema })
const SearchResponse = z.strictObject({ status: z.enum(['evidence', 'no_evidence']),
  reason: z.enum(['empty_index', 'empty_query', 'no_matches', 'stale_sources', 'context_limit']).optional(),
  citations: z.array(KnowledgeCitationSchema).max(50) })
// Proposals contain a complex runtime snapshot. The service returns typed review artifacts;
// full executable policy is never accepted over HTTP or serialized by the transport.
export const ProposalResponseSchema = z.strictObject({ demandId: IdentifierSchema, hash: ContentHashSchema,
  plan: EntitySchemas.approvedPlan.shape.plan, team: CreateTaskSchema.shape.team,
  requirements: PlanningDemandSchema.shape.requirements,
  citations: z.array(KnowledgeCitationSchema).max(400),
  productGoal: z.strictObject({ id: IdentifierSchema, objective: z.string().min(1).max(16_384) }),
  sprintGoal: EntitySchemas.sprint.shape.goal, productBacklog: ProductBacklogSchema,
  sprintBacklog: SprintBacklogSchema, definitionOfDone: DefinitionOfDoneSchema,
  roles: z.array(PlanningRoleRecordSchema).min(3).max(100),
})
export const PlanningStatusSchema = z.discriminatedUnion('status', [
  z.strictObject({ demandId: IdentifierSchema, status: z.literal('draft') }),
  z.strictObject({ demandId: IdentifierSchema, status: z.literal('planning') }),
  z.strictObject({ demandId: IdentifierSchema, status: z.literal('blocked'), reason: z.literal('RUNTIME_CONFLICT') }),
  z.strictObject({ demandId: IdentifierSchema, status: z.literal('needs_competency'), gaps: z.array(CompetencyGapSchema).min(1).max(1000) }),
  z.strictObject({ demandId: IdentifierSchema, status: z.literal('proposed'), hash: ContentHashSchema }),
  z.strictObject({ demandId: IdentifierSchema, status: z.literal('approved'), hash: ContentHashSchema, planId: IdentifierSchema }),
])
export function resolveRoute(method: string, path: string): Route {
  const parts = path.split('/').slice(3)
  const [resource, id, action] = parts
  if (parts.length > 3 || parts.some(p => !p)) throw new ApiError(404, 'NOT_FOUND')
  if (id) IdentifierSchema.parse(id)
  if (method === 'GET' && resource === 'catalog' && !id)
    return { resource, input: empty, query: empty, output: z.array(z.strictObject({ metadata: CatalogMetadataSchema, path: z.string().max(1024) })).max(10_000) }
  if (resource === 'knowledge' && id === 'search' && method === 'POST' && !action)
    return { resource, action: 'search', input: SearchKnowledgeOptionsSchema, query: empty, output: SearchResponse }
  if (method === 'GET' && resource === 'demands' && id && action === 'planning')
    return { resource: 'planningStatus', id, input: empty, query: empty, output: PlanningStatusSchema }
  if (method === 'GET' && resource === 'runs' && id && action === 'status')
    return { resource: 'runStatus', id, input: empty, query: empty, output: ExecutionResultSchema }
  if (method === 'GET' && resource === 'demands' && id && action === 'proposal')
    return { resource: 'proposals', id, input: empty, query: empty, output: ProposalResponseSchema }
  if (!Object.hasOwn(records, resource ?? '')) throw new ApiError(404, 'NOT_FOUND')
  const name = resource as keyof typeof records
  if (method === 'GET' && !action) return { resource: name, id, input: empty, query: id ? empty : listing,
    output: id ? records[name] : z.array(records[name]).max(10_000) }
  const base = { resource: name, id, action, query: empty }
  if (method === 'POST' && !id && ['projects', 'demands', 'sprints'].includes(name)) {
    const schema = name === 'projects' ? EntitySchemas.project : name === 'demands' ? EntitySchemas.demand : EntitySchemas.sprint
    return { ...base, input: schema, output: records[name] }
  }
  if (method === 'PATCH' && id && !action && ['projects', 'demands', 'sprints'].includes(name)) {
    const schema = name === 'projects' ? EntitySchemas.project : name === 'demands' ? EntitySchemas.demand : EntitySchemas.sprint
    return { ...base, input: z.strictObject({ expectedVersion: VersionSchema, data: schema }), output: records[name] }
  }
  if (method === 'POST' && name === 'tasks' && !id) return { ...base, input: TaskCreateSchema, output: records.tasks }
  if (method === 'POST' && name === 'tasks' && id && action === 'transition') return { ...base, input: TaskControlSchema, output: records.tasks }
  if (method === 'POST' && name === 'demands' && id && action === 'plan') return { ...base, input: PlanRequestSchema, output: accepted }
  if (method === 'POST' && name === 'demands' && id && action === 'approve') return { ...base, input: PlanApprovalSchema, output: records.plans }
  if (method === 'POST' && name === 'runs' && !id) return { ...base, input: z.strictObject({ id: IdentifierSchema, planId: IdentifierSchema }), output: accepted }
  if (method === 'POST' && name === 'runs' && id && ['pause', 'resume', 'cancel', 'reconcile'].includes(action ?? ''))
    return { ...base, input: action === 'reconcile' ? version.extend({ retryPush: z.boolean().default(false) }) : version, output: ExecutionResultSchema }
  if (method === 'POST' && name === 'approvals' && id && action === 'decide')
    return { ...base, input: version.extend({ decision: ApprovalDecisionSchema }), output: z.strictObject({ id: IdentifierSchema, status: z.literal('decided') }) }
  throw new ApiError(404, 'NOT_FOUND')
}
