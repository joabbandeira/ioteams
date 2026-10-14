import { z } from 'zod'
import {
  ExecutionPlanSchema, GitShaSchema, IdentifierSchema, PlannedTaskSchema, ProfessionalMetadataSchema,
  SlugSchema, TaskStatusSchema, TeamMetadataSchema, ValidationEvidenceSchema,
} from './contracts.js'
import type { CheckCommand, TaskStatus } from './contracts.js'

const text = PlannedTaskSchema.shape.title
const unique = <T extends z.ZodType<string>>(item: T) => z.array(item).max(1000)
  .refine(items => new Set(items).size === items.length, 'Valores duplicados')
const criteria = () => unique(text).min(1)
const ids = () => unique(IdentifierSchema)
const timestamp = z.iso.datetime({ offset: true })

// Scrum commitments, artifacts and execution state are intentionally separate.
export const ProductGoalSchema = z.strictObject({ id: IdentifierSchema, objective: text })
export type ProductGoal = z.infer<typeof ProductGoalSchema>
export const SprintGoalSchema = z.strictObject({ id: IdentifierSchema, objective: text })
export type SprintGoal = z.infer<typeof SprintGoalSchema>
export const ProductBacklogItemSchema = z.strictObject({ id: IdentifierSchema, title: text, acceptanceCriteria: criteria() })
export type ProductBacklogItem = z.infer<typeof ProductBacklogItemSchema>
export const ProductBacklogSchema = z.strictObject({
  id: IdentifierSchema, productGoalId: IdentifierSchema, items: z.array(ProductBacklogItemSchema).max(1000),
}).refine(backlog => new Set(backlog.items.map(item => item.id)).size === backlog.items.length, 'Itens duplicados')
export type ProductBacklog = z.infer<typeof ProductBacklogSchema>
export const SprintBacklogSchema = z.strictObject({
  id: IdentifierSchema, sprintGoalId: IdentifierSchema, productBacklogItemIds: ids(), tasks: z.array(PlannedTaskSchema).max(1000),
}).refine(backlog => new Set(backlog.tasks.map(task => task.id)).size === backlog.tasks.length, 'Tarefas duplicadas')
export type SprintBacklog = z.infer<typeof SprintBacklogSchema>
export const DefinitionOfDoneSchema = z.strictObject({ id: IdentifierSchema, criteria: criteria() })
export type DefinitionOfDone = z.infer<typeof DefinitionOfDoneSchema>
export const IncrementSchema = z.strictObject({
  id: IdentifierSchema, definitionOfDoneId: IdentifierSchema, taskIds: ids().min(1), usable: z.boolean(),
})
export type Increment = z.infer<typeof IncrementSchema>

export const CompetencyRequirementsSchema = z.strictObject({
  professionIds: unique(SlugSchema), stackIds: unique(SlugSchema),
}).refine(value => value.professionIds.length + value.stackIds.length > 0, 'Declare competências necessárias')
export type CompetencyRequirements = z.infer<typeof CompetencyRequirementsSchema>
export const DeliveryRequirementSchema = z.strictObject({
  pushRequired: z.boolean(), branch: ExecutionPlanSchema.shape.branch, remote: ExecutionPlanSchema.shape.remote,
})
export const CreateTaskSchema = z.strictObject({
  mode: z.enum(['operational', 'demo']), task: PlannedTaskSchema, professional: ProfessionalMetadataSchema,
  team: TeamMetadataSchema, requirements: CompetencyRequirementsSchema,
  definitionOfDone: criteria(), delivery: DeliveryRequirementSchema,
})
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>

const completionCriteria = { acceptanceMet: criteria(), definitionOfDoneMet: criteria() }
export const OperationalCompletionSchema = z.strictObject({
  mode: z.literal('operational'), ...completionCriteria,
  review: z.strictObject({ taskId: IdentifierSchema, attemptId: IdentifierSchema, testedTreeHash: GitShaSchema, approved: z.literal(true) }),
  commit: z.strictObject({ sha: GitShaSchema, treeHash: GitShaSchema }),
  remote: z.strictObject({ name: ExecutionPlanSchema.shape.remote, branch: ExecutionPlanSchema.shape.branch, sha: GitShaSchema }).optional(),
})
export type OperationalCompletion = z.infer<typeof OperationalCompletionSchema>
export const DemoCompletionSchema = z.strictObject({
  mode: z.literal('demo'), ...completionCriteria,
  simulatedChecks: z.array(z.literal(true)).min(1).max(100), simulatedReview: z.literal(true), simulatedIntegrated: z.literal(true),
})
export type DemoCompletion = z.infer<typeof DemoCompletionSchema>
export const TaskCompletionSchema = z.discriminatedUnion('mode', [OperationalCompletionSchema, DemoCompletionSchema])
export type TaskCompletion = z.infer<typeof TaskCompletionSchema>

export const TaskExecutionSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('operational'), attemptId: IdentifierSchema, baseSha: GitShaSchema }),
  z.strictObject({ mode: z.literal('demo'), attemptId: IdentifierSchema }),
])
export const TaskTransitionSchema = z.strictObject({
  target: TaskStatusSchema, eventId: IdentifierSchema, at: timestamp, reason: text.optional(),
  execution: TaskExecutionSchema.optional(), completion: TaskCompletionSchema.optional(),
})
export type TaskTransition = z.infer<typeof TaskTransitionSchema>
export const TaskHistoryEntrySchema = z.strictObject({
  id: IdentifierSchema, from: TaskStatusSchema, to: TaskStatusSchema, at: timestamp, reason: text.optional(),
})
export const ScrumTaskAttemptSchema = z.strictObject({
  id: IdentifierSchema, taskId: IdentifierSchema, attempt: z.number().int().min(1).max(3),
  professionalId: SlugSchema, mode: z.enum(['operational', 'demo']), status: TaskStatusSchema,
  startedAt: timestamp, baseSha: GitShaSchema.optional(), resultSha: GitShaSchema.optional(),
  evidenceIds: ids(), reason: text.optional(),
}).superRefine((attempt, ctx) => {
  if (attempt.mode === 'operational' && (!attempt.baseSha || (attempt.status === 'DONE' && !attempt.resultSha)))
    ctx.addIssue({ code: 'custom', message: 'Tentativa operacional exige SHAs' })
  if (attempt.mode === 'demo' && (attempt.baseSha || attempt.resultSha || attempt.evidenceIds.length))
    ctx.addIssue({ code: 'custom', message: 'Demo admite somente dados simulados' })
  if (attempt.status === 'REJECTED' && !attempt.reason)
    ctx.addIssue({ code: 'custom', message: 'Rejeição exige motivo' })
})
export type ScrumTaskAttempt = z.infer<typeof ScrumTaskAttemptSchema>
const ScrumTaskSnapshotSchema = z.strictObject({
  mode: z.enum(['operational', 'demo']), plan: PlannedTaskSchema, teamId: SlugSchema,
  requirements: CompetencyRequirementsSchema, definitionOfDone: criteria(), delivery: DeliveryRequirementSchema,
  status: TaskStatusSchema, reason: text.optional(), reasonKind: z.enum(['block', 'rejection']).optional(),
  attempts: z.array(ScrumTaskAttemptSchema).max(3), evidence: z.array(ValidationEvidenceSchema).max(1000),
  history: z.array(TaskHistoryEntrySchema).max(10_000), completion: TaskCompletionSchema.optional(),
})
export type ScrumTask = z.infer<typeof ScrumTaskSnapshotSchema>
export const ScrumTaskSchema = ScrumTaskSnapshotSchema.superRefine((state, ctx) => {
  try { validateSnapshot(state) }
  catch (error) { ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Snapshot inválido' }) }
})

// The frozen matrix is the sole domain authority; compatibility aliases are normalized before this API.
export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = Object.freeze({
  TODO: Object.freeze(['IN_PLANNING'] as const), IN_PLANNING: Object.freeze(['READY', 'TODO'] as const),
  READY: Object.freeze(['IN_PROGRESS', 'BLOCKED'] as const), BLOCKED: Object.freeze(['READY'] as const),
  IN_PROGRESS: Object.freeze(['DONE', 'REJECTED'] as const), REJECTED: Object.freeze(['TODO'] as const), DONE: Object.freeze([]),
})

export class ScrumRuleError extends Error {
  constructor(message: string) { super(message); this.name = 'ScrumRuleError' }
}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ScrumRuleError(message)
}
function sameSet(actual: readonly string[], expected: readonly string[]) {
  return actual.length === expected.length && expected.every(item => actual.includes(item))
}
function sameCommand(a: CheckCommand, b: CheckCommand) {
  return a.executable === b.executable && a.cwd === b.cwd && a.timeoutMs === b.timeoutMs &&
    a.args.length === b.args.length && a.args.every((arg, index) => arg === b.args[index])
}

function validateSnapshot(state: ScrumTask) {
  requireRule(new Set(state.plan.acceptanceCriteria).size === state.plan.acceptanceCriteria.length, 'Aceitação duplicada')
  requireRule(new Set(state.history.map(event => event.id)).size === state.history.length, 'Eventos duplicados')
  let status: TaskStatus = 'TODO'
  let previousTime = -Infinity
  for (const event of state.history) {
    requireRule(event.from === status && TASK_TRANSITIONS[status].includes(event.to), 'Histórico inconsistente')
    requireRule(Date.parse(event.at) >= previousTime, 'Histórico fora de ordem')
    requireRule(!['BLOCKED', 'REJECTED'].includes(event.to) || event.reason, 'Histórico sem motivo')
    status = event.to
    previousTime = Date.parse(event.at)
  }
  requireRule(status === state.status, 'Estado não corresponde ao histórico')
  const starts = state.history.filter(event => event.to === 'IN_PROGRESS')
  requireRule(starts.length === state.attempts.length, 'Histórico de tentativas inconsistente')
  requireRule(new Set(state.attempts.map(attempt => attempt.id)).size === state.attempts.length, 'Tentativas duplicadas')
  state.attempts.forEach((attempt, index) => {
    requireRule(attempt.taskId === state.plan.id && attempt.professionalId === state.plan.professionalId &&
      attempt.mode === state.mode && attempt.attempt === index + 1 && attempt.startedAt === starts[index].at,
    'Identidade ou modo de tentativa inconsistente')
    requireRule(index === state.attempts.length - 1 || attempt.status === 'REJECTED', 'Tentativa anterior não encerrada')
  })
  const attempt = state.attempts.at(-1)
  if (state.status === 'IN_PROGRESS' || state.status === 'DONE' || state.status === 'REJECTED')
    requireRule(attempt?.status === state.status, 'Tentativa ativa inconsistente')
  else requireRule(!attempt || attempt.status === 'REJECTED', 'Tentativa não encerrada')
  if (state.status === 'BLOCKED' || state.status === 'REJECTED') requireRule(state.reason, 'Motivo obrigatório')
  requireRule(!state.evidence.length || (state.mode === 'operational' && ['IN_PROGRESS', 'DONE'].includes(state.status)), 'Evidência fora de execução')
  requireRule(new Set(state.evidence.map(record => record.id)).size === state.evidence.length, 'Evidências duplicadas')
  for (const record of state.evidence) requireRule(attempt && record.taskId === state.plan.id &&
    record.attemptId === attempt.id && attempt.evidenceIds.includes(record.id) &&
    Date.parse(record.startedAt) >= Date.parse(attempt.startedAt) &&
    state.plan.checks.some(check => sameCommand(check, record.command)), 'Evidência de outra tarefa, tentativa ou plano')
  requireRule(state.status === 'DONE' ? state.completion : !state.completion, 'Conclusão inconsistente')
  if (state.completion) {
    validateCompletion(state, state.completion)
    requireRule(state.completion.mode !== 'operational' || attempt?.resultSha === state.completion.commit.sha, 'SHA final inconsistente')
    requireRule(state.evidence.every(record => Date.parse(record.finishedAt) <= previousTime), 'Evidência posterior à conclusão')
  }
}

/** Catalog membership expresses assigned Scrum responsibility; competence is a separate explicit requirement. */
export function createTask(input: unknown): ScrumTask {
  const value = CreateTaskSchema.parse(input)
  const { task, professional, team, requirements } = value
  requireRule(task.professionalId === professional.id && team.members.some(member =>
    member.professionalId === professional.id && member.role === 'Developer'), 'Execução exige Developer da equipe')
  requireRule(requirements.professionIds.every(id => professional.professionIds.includes(id)) &&
    requirements.stackIds.every(id => professional.stackIds.includes(id)), 'Developer sem competências necessárias')
  requireRule(new Set(task.acceptanceCriteria).size === task.acceptanceCriteria.length, 'Critérios de aceitação duplicados')
  return ScrumTaskSchema.parse({
    mode: value.mode, plan: task, teamId: team.id, requirements, definitionOfDone: value.definitionOfDone,
    delivery: value.delivery, status: 'TODO', attempts: [], evidence: [], history: [],
  })
}

/** Host-only boundary: callers supply observed validation records, never model declarations. No I/O is performed here. */
export function recordHostEvidence(input: ScrumTask, record: unknown): ScrumTask {
  const state = ScrumTaskSchema.parse(input)
  const evidence = ValidationEvidenceSchema.parse(record)
  const attempt = state.attempts.at(-1)
  requireRule(state.mode === 'operational' && state.status === 'IN_PROGRESS' && attempt, 'Evidência exige execução operacional ativa')
  requireRule(evidence.taskId === state.plan.id && evidence.attemptId === attempt.id, 'Evidência de outra tarefa ou tentativa')
  requireRule(Date.parse(evidence.startedAt) >= Date.parse(attempt.startedAt), 'Evidência anterior à tentativa')
  requireRule(state.plan.checks.some(check => sameCommand(check, evidence.command)), 'Check fora do plano')
  requireRule(!state.attempts.some(item => item.evidenceIds.includes(evidence.id)), 'ID de evidência já utilizado')
  attempt.evidenceIds.push(evidence.id)
  state.evidence.push(evidence)
  return ScrumTaskSchema.parse(state)
}

function validateCompletion(state: ScrumTask, completion: TaskCompletion) {
  requireRule(completion.mode === state.mode, 'Modo de conclusão incompatível')
  requireRule(sameSet(completion.acceptanceMet, state.plan.acceptanceCriteria), 'Aceitação incompleta')
  requireRule(sameSet(completion.definitionOfDoneMet, state.definitionOfDone), 'DoD incompleta')
  const attempt = state.attempts.at(-1)
  requireRule(attempt && (attempt.status === 'IN_PROGRESS' || (state.status === 'DONE' && attempt.status === 'DONE')), 'Conclusão exige tentativa ativa')
  if (completion.mode === 'demo') {
    requireRule(completion.simulatedChecks.length === state.plan.checks.length, 'Checks simulados incompletos')
    return
  }
  requireRule(completion.review.taskId === state.plan.id && completion.review.attemptId === attempt.id &&
    completion.review.testedTreeHash === completion.commit.treeHash, 'Revisão de outra tentativa ou árvore')
  for (const check of state.plan.checks) {
    const records = state.evidence.filter(evidence => sameCommand(check, evidence.command))
    const latestTime = Math.max(...records.map(evidence => Date.parse(evidence.finishedAt)))
    const latest = records.filter(evidence => Date.parse(evidence.finishedAt) === latestTime)
    // Ties must all pass: a same-time failure cannot be hidden by insertion order.
    requireRule(latest.length > 0 && latest.every(evidence => evidence.exitCode === 0 &&
      (!evidence.testedTreeHash || evidence.testedTreeHash === completion.commit.treeHash) &&
      (!evidence.commitSha || evidence.commitSha === completion.commit.sha)), 'Check ausente, falho ou stale')
  }
  requireRule(!state.delivery.pushRequired || completion.remote, 'Confirmação remote obrigatória')
  if (completion.remote) requireRule(completion.remote.name === state.delivery.remote &&
    completion.remote.branch === state.delivery.branch && completion.remote.sha === completion.commit.sha, 'Remote divergente')
}

/** Pure transition. Persist the returned snapshot atomically; rejected commands leave the input untouched. */
export function transitionTask(input: ScrumTask, command: unknown): ScrumTask {
  const state = ScrumTaskSchema.parse(input)
  const value = TaskTransitionSchema.parse(command)
  const from = state.status
  requireRule(TASK_TRANSITIONS[from].includes(value.target), `Transição inválida: ${from} → ${value.target}`)
  requireRule(!state.history.some(event => event.id === value.eventId), 'ID de evento já utilizado')
  requireRule(!state.history.length || Date.parse(value.at) >= Date.parse(state.history.at(-1)!.at), 'Evento fora de ordem')
  requireRule(state.evidence.every(record => Date.parse(record.finishedAt) <= Date.parse(value.at)), 'Evento anterior à evidência')
  requireRule(!value.execution || value.target === 'IN_PROGRESS', 'Execução somente ao iniciar')
  requireRule(!value.completion || value.target === 'DONE', 'Evidência de conclusão somente em DONE')
  requireRule(!value.reason || ['BLOCKED', 'REJECTED'].includes(value.target), 'Motivo somente em bloqueio ou rejeição')
  if (value.target === 'BLOCKED' || value.target === 'REJECTED') {
    requireRule(value.reason, 'Motivo obrigatório')
    state.reason = value.reason.trim()
    state.reasonKind = value.target === 'BLOCKED' ? 'block' : 'rejection'
  }
  if (value.target === 'IN_PROGRESS') {
    const execution = value.execution
    requireRule(execution && execution.mode === state.mode, 'Contexto de execução incompatível ou ausente')
    requireRule(state.attempts.length < 3, 'Limite de três tentativas atingido')
    requireRule(!state.attempts.some(attempt => attempt.id === execution.attemptId), 'ID de tentativa já utilizado')
    state.attempts.push({
      id: execution.attemptId, taskId: state.plan.id, attempt: state.attempts.length + 1,
      professionalId: state.plan.professionalId, mode: state.mode, status: 'IN_PROGRESS', startedAt: value.at,
      ...(execution.mode === 'operational' ? { baseSha: execution.baseSha } : {}), evidenceIds: [],
    })
  }
  if (value.target === 'DONE') {
    requireRule(value.completion, 'Conclusão exige validação')
    validateCompletion(state, value.completion)
    state.completion = value.completion
    const attempt = state.attempts.at(-1)!
    attempt.status = 'DONE'
    if (value.completion.mode === 'operational') attempt.resultSha = value.completion.commit.sha
  }
  if (value.target === 'REJECTED') {
    const attempt = state.attempts.at(-1)
    requireRule(attempt && attempt.status === 'IN_PROGRESS', 'Rejeição exige tentativa ativa')
    attempt.status = 'REJECTED'
    attempt.reason = state.reason
  }
  if (value.target === 'REJECTED' || (from === 'REJECTED' && value.target === 'TODO')) {
    state.evidence = []
    delete state.completion
  }
  state.status = value.target
  state.history.push({ id: value.eventId, from, to: value.target, at: value.at,
    ...(value.reason ? { reason: value.reason.trim() } : {}) })
  return ScrumTaskSchema.parse(state)
}
