import { z } from 'zod'
import {
  CompetencyRequirementsSchema, ContentHashSchema, DefinitionOfDoneSchema, IdentifierSchema,
  KnowledgeCitationSchema, PlannedTaskSchema, ProductBacklogSchema, ProductGoalSchema,
  ScrumRoleSchema, SprintBacklogSchema, SprintGoalSchema, TeamMetadataSchema,
} from '@ioteams/core'
import type { PolicySnapshot } from './policy.js'

const text = PlannedTaskSchema.shape.title
const ids = z.array(IdentifierSchema).max(1000).refine(v => new Set(v).size === v.length, 'IDs duplicados')
export const PlanningDemandSchema = z.strictObject({
  id: IdentifierSchema.refine(v => v.length <= 80, 'ID de demanda excede 80 caracteres'),
  projectId: IdentifierSchema, teamId: TeamMetadataSchema.shape.id, goal: text,
  requirements: z.array(z.strictObject({ taskId: IdentifierSchema, competencies: CompetencyRequirementsSchema })).min(1).max(1000),
}).refine(v => new Set(v.requirements.map(r => r.taskId)).size === v.requirements.length, 'Requisitos duplicados')
export type PlanningDemand = z.infer<typeof PlanningDemandSchema>
const sources = { citationIds: ids.min(1) }
export const ProductProposalSchema = z.strictObject({
  productGoal: ProductGoalSchema, productBacklog: ProductBacklogSchema,
  sprintGoal: SprintGoalSchema, selectedBacklogItemIds: ids.min(1), ...sources,
}).refine(v => v.productBacklog.productGoalId === v.productGoal.id &&
  v.selectedBacklogItemIds.every(id => v.productBacklog.items.some(item => item.id === id)), 'Referências de backlog inválidas')
export const DeveloperProposalSchema = z.strictObject({ tasks: z.array(PlannedTaskSchema).min(1).max(1000), ...sources })
export const FacilitatorProposalSchema = z.strictObject({
  observations: z.array(text).min(1).max(100), impediments: z.array(text).max(100), ...sources,
})
const session = { professionalId: TeamMetadataSchema.shape.id, threadId: IdentifierSchema, turnId: IdentifierSchema,
  citations: z.array(KnowledgeCitationSchema).min(1).max(4) }
export const PlanningRoleRecordSchema = z.discriminatedUnion('role', [
  z.strictObject({ ...session, role: z.literal('Product Owner'), output: ProductProposalSchema }),
  z.strictObject({ ...session, role: z.literal('Developer'), output: DeveloperProposalSchema }),
  z.strictObject({ ...session, role: z.literal('Scrum Master'), output: FacilitatorProposalSchema }),
])
export type PlanningRoleRecord = z.infer<typeof PlanningRoleRecordSchema>
export interface PlanningProposal {
  version: 1; demand: PlanningDemand; team: z.infer<typeof TeamMetadataSchema>
  productGoal: z.infer<typeof ProductGoalSchema>; productBacklog: z.infer<typeof ProductBacklogSchema>
  sprintGoal: z.infer<typeof SprintGoalSchema>; sprintBacklog: z.infer<typeof SprintBacklogSchema>
  definitionOfDone: z.infer<typeof DefinitionOfDoneSchema>; roles: PlanningRoleRecord[]
  policy: PolicySnapshot; hash: string
}
export const CompetencyGapSchema = z.strictObject({
  taskId: IdentifierSchema, professionalId: TeamMetadataSchema.shape.id,
  kind: z.enum(['profession', 'stack']), competencyId: TeamMetadataSchema.shape.id, reason: text,
})
export type CompetencyGap = z.infer<typeof CompetencyGapSchema>
export type PlanningResult = { status: 'proposed'; proposal: PlanningProposal } | { status: 'needs_competency'; gaps: CompetencyGap[] }
export const ReviewedProposalHashSchema = ContentHashSchema
export const PlanningIdentitySchema = z.strictObject({ professionalId: TeamMetadataSchema.shape.id, role: ScrumRoleSchema })
