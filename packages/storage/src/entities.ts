import { z } from 'zod'
import {
  IdentifierSchema, ExecutionPlanSchema, ScrumTaskSchema, ScrumTaskAttemptSchema, ValidationEvidenceSchema,
  ApprovalRequestSchema, RunStatusSchema, SprintGoalSchema, DefinitionOfDoneSchema, SprintBacklogSchema,
} from '@ioteams/core'

const text = z.string().min(1).max(16_384).refine(value => value.trim().length > 0, 'Texto vazio')
const identity = { id: IdentifierSchema, projectId: IdentifierSchema }
export const EntitySchemas = {
  project: z.strictObject({ id: IdentifierSchema, name: text, repositoryPath: text }),
  demand: z.strictObject({ ...identity, goal: text }),
  approvedPlan: z.strictObject({ ...identity, demandId: IdentifierSchema, plan: ExecutionPlanSchema,
    approvedAt: z.iso.datetime({ offset: true }) }).refine(value =>
    value.id === value.plan.id && value.projectId === value.plan.projectId, 'Identidade do plano divergente'),
  sprint: z.strictObject({ ...identity, planId: IdentifierSchema.optional(), goal: SprintGoalSchema,
    definitionOfDone: DefinitionOfDoneSchema, backlog: SprintBacklogSchema.optional() }),
  task: z.strictObject({ ...identity, planId: IdentifierSchema.optional(), sprintId: IdentifierSchema.optional(), state: ScrumTaskSchema })
    .refine(value => value.id === value.state.plan.id, 'Identidade da tarefa divergente'),
  attempt: z.strictObject({ ...identity, attempt: ScrumTaskAttemptSchema })
    .refine(value => value.id === value.attempt.id, 'Identidade da tentativa divergente'),
  evidence: z.strictObject({ ...identity, evidence: ValidationEvidenceSchema })
    .refine(value => value.id === value.evidence.id, 'Identidade da evidência divergente'),
  run: z.strictObject({ ...identity, planId: IdentifierSchema, taskId: IdentifierSchema.optional(),
    attemptId: IdentifierSchema.optional(), status: RunStatusSchema, threadId: IdentifierSchema.optional(), turnId: IdentifierSchema.optional() })
    .refine(value => !value.attemptId || value.taskId, 'Tentativa exige tarefa')
    .refine(value => !value.turnId || value.threadId, 'Turno exige thread'),
  approval: ApprovalRequestSchema.extend({ projectId: IdentifierSchema }),
}
export type EntityKind = keyof typeof EntitySchemas
export type EntityMap = { [K in EntityKind]: z.infer<(typeof EntitySchemas)[K]> }
export type WritableKind = Exclude<EntityKind, 'attempt' | 'evidence'>
export type MutableKind = Exclude<WritableKind, 'approvedPlan'>
export interface Versioned<T> { version: number; data: T }
export type JsonValue = z.infer<ReturnType<typeof z.json>>
export const EventSchema = z.strictObject({ ...identity, runId: IdentifierSchema.optional(), type: IdentifierSchema,
  at: z.iso.datetime({ offset: true }), data: z.json() })
export type StoreEventInput = z.infer<typeof EventSchema>
export interface StoreEvent extends StoreEventInput { sequence: number }
export interface CommandInput { id: string; input: JsonValue }
export interface CommandReceipt { id: string; inputHash: string; result: JsonValue }

export function parseEntity<K extends EntityKind>(kind: K, input: unknown): EntityMap[K] {
  if (!Object.hasOwn(EntitySchemas, kind)) throw new Error('Tipo de entidade inválido')
  const value = EntitySchemas[kind].parse(input)
  // Optional TypeScript properties may be explicitly undefined. Normalize to the
  // same JSON representation that SQLite persists before comparing snapshots.
  return JSON.parse(JSON.stringify(value)) as EntityMap[K]
}
export function canonicalJson(input: unknown): string {
  const value = z.json().parse(input)
  const sort = (item: JsonValue): JsonValue => {
    if (Array.isArray(item)) return item.map(sort)
    if (item !== null && typeof item === 'object')
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, sort(item[key])]))
    return item
  }
  return JSON.stringify(sort(value))
}
