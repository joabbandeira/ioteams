import { z } from 'zod'
import { IdentifierSchema, PlannedTaskSchema, TeamMemberSchema, TeamMetadataSchema } from '@ioteams/core'
import type { Store } from '@ioteams/storage'
import { planningEvents } from './planning.js'
import { canonicalJson, sha256 } from './policy.js'
import { fail } from './errors.js'
import type { PlanningProposal } from './planning-contracts.js'

const text = PlannedTaskSchema.shape.title
const ids = z.array(IdentifierSchema).max(1000).refine(v => new Set(v).size === v.length, 'IDs duplicados')
export const ScrumEventKindSchema = z.enum(['sprint_planning', 'daily_inspection', 'sprint_review', 'sprint_retrospective'])
export const ScrumEventInputSchema = z.strictObject({
  id: IdentifierSchema.refine(v => v.length <= 110, 'ID de evento longo demais'), projectId: IdentifierSchema, sprintId: IdentifierSchema,
  purpose: text, participants: z.array(TeamMemberSchema).min(1).max(100), stakeholderIds: ids,
  evidenceIds: ids, observations: z.array(text).min(1).max(100), improvements: z.array(text).max(100),
  at: z.iso.datetime({ offset: true }),
}).refine(v => new Set(v.participants.map(p => p.professionalId)).size === v.participants.length, 'Participantes duplicados')
export const ScrumEventRecordSchema = ScrumEventInputSchema.extend({ kind: ScrumEventKindSchema, frameworkPurpose: text })
export type ScrumEventRecord = z.infer<typeof ScrumEventRecordSchema>
const purposes = {
  sprint_planning: 'Definir por que a Sprint tem valor, o que selecionar e como os Developers realizarão o trabalho.',
  daily_inspection: 'Developers inspecionam o progresso em direção ao Sprint Goal e adaptam o Sprint Backlog.',
  sprint_review: 'Equipe Scrum e stakeholders inspecionam o resultado e consideram adaptações do Product Backlog.',
  sprint_retrospective: 'Equipe Scrum inspeciona qualidade e efetividade e registra melhorias para o trabalho seguinte.',
} as const

/** Explicit records, with no scheduler, role promotion, task transition or executable authority. */
export class ScrumEventService {
  constructor(private readonly options: { store: Store }) {}
  sprintPlanning(input: unknown): ScrumEventRecord { return this.#record('sprint_planning', input) }
  inspectDaily(input: unknown): ScrumEventRecord { return this.#record('daily_inspection', input) }
  sprintReview(input: unknown): ScrumEventRecord { return this.#record('sprint_review', input) }
  sprintRetrospective(input: unknown): ScrumEventRecord { return this.#record('sprint_retrospective', input) }
  #record(kind: z.infer<typeof ScrumEventKindSchema>, raw: unknown): ScrumEventRecord {
    const input = ScrumEventInputSchema.parse(raw), store = this.options.store
    return ScrumEventRecordSchema.parse(store.command({ id: `scrum:${input.id}`, input: { kind, ...input } }, s => {
      const sprint = s.get('sprint', input.sprintId)?.data
      if (!sprint || sprint.projectId !== input.projectId || !sprint.planId) fail('UNKNOWN_SPRINT', 'Evento exige Sprint do projeto vinculada a plano aprovado.')
      const plan = s.get('approvedPlan', sprint.planId)!.data
      const proposed = planningEvents(s, input.projectId).find(e => e.type === 'planning.proposed' &&
        (e.data as unknown as PlanningProposal).demand?.id === plan.demandId)
      if (!proposed) fail('UNKNOWN_PROPOSAL', 'Equipe aprovada da Sprint não está registrada.')
      const proposal = proposed.data as unknown as PlanningProposal, { hash, ...body } = proposal
      if (hash !== sha256(canonicalJson(body)) || proposal.policy.plan.policyHash !== plan.plan.policyHash)
        fail('PROPOSAL_MISMATCH', 'Equipe/proposta diverge do plano aprovado da Sprint.')
      const team = TeamMetadataSchema.parse(proposal.team)
      if (team.id !== plan.plan.teamId) fail('ROLE_LIMIT', 'Equipe não corresponde ao plano.')
      const expected = team.members.filter(m => kind !== 'daily_inspection' || m.role === 'Developer')
      if (input.participants.length !== expected.length || input.participants.some(p =>
        !expected.some(m => m.professionalId === p.professionalId && m.role === p.role)))
        fail('ROLE_LIMIT', 'Participantes devem corresponder à responsabilidade Scrum registrada; Daily é dos Developers.')
      if (kind !== 'sprint_review' && input.stakeholderIds.length) fail('ROLE_LIMIT', 'Stakeholders são registrados na Review.')
      if (kind === 'sprint_retrospective' && !input.improvements.length) fail('MISSING_IMPROVEMENT', 'Retrospectiva deve registrar uma melhoria concreta.')
      for (const id of input.evidenceIds) {
        const evidence = s.get('evidence', id)?.data
        const task = evidence && s.get('task', evidence.evidence.taskId)?.data
        if (!evidence || evidence.projectId !== input.projectId || task?.sprintId !== sprint.id ||
          Date.parse(evidence.evidence.finishedAt) > Date.parse(input.at))
          fail('MISSING_EVIDENCE', 'Evidência deve existir, pertencer à Sprint e preceder o evento.')
      }
      const previous = planningEvents(s, input.projectId).filter(e => e.type.startsWith('scrum.') &&
        (e.data as Record<string, unknown>).sprintId === sprint.id).at(-1)
      if (previous && Date.parse(input.at) < Date.parse(previous.at)) fail('EVENT_ORDER', 'Evento anterior ao último registro da Sprint.')
      const record = ScrumEventRecordSchema.parse({ ...input, kind, frameworkPurpose: purposes[kind] })
      const data = z.json().parse(record)
      s.appendEvent({ id: `scrum:${input.id}`, projectId: input.projectId, type: `scrum.${kind}`, at: input.at, data })
      return data
    }))
  }
}
