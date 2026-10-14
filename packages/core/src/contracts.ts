import { z } from 'zod'

export const CONTRACT_VERSION = 1 as const
const text = z.string().min(1).max(16_384).refine(value => value.trim().length > 0, 'Texto vazio')
export const IdentifierSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/)
export const SlugSchema = z.string().max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const GitShaSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)
export const ContentHashSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const RelativePathSchema = z.string().min(1).max(1024).refine(value =>
  value === value.trim() && !/[\\\x00-\x1f\x7f:*?\[\]{}%]/u.test(value) && !value.startsWith('~') &&
  value.split('/').every(part => part.length > 0 && part !== '.' && part !== '..'),
'Use um caminho relativo canônico, sem glob ou traversal')
const BranchSchema = z.string().min(1).max(255).refine(value =>
  value !== 'HEAD' && !value.startsWith('-') && !/[\s\x00-\x1f\x7f~^:?*\[\\]/u.test(value) &&
  !value.includes('..') && !value.includes('@{') && !value.endsWith('.') &&
  value.split('/').every(part => part.length > 0 && !part.startsWith('.') && !part.endsWith('.lock')),
'Nome de branch inválido')
const RemoteSchema = z.string().max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
const uniqueStrings = <T extends z.ZodType<string>>(schema: T) => z.array(schema).max(1000)
  .refine(values => new Set(values).size === values.length, 'Valores duplicados')
const ids = () => uniqueStrings(IdentifierSchema)
const slugs = () => uniqueStrings(SlugSchema)

export const TaskStatusSchema = z.enum(['TODO', 'IN_PLANNING', 'READY', 'BLOCKED', 'IN_PROGRESS', 'REJECTED', 'DONE'])
export type TaskStatus = z.infer<typeof TaskStatusSchema>
/** Compatibility boundary only: control schemas accept canonical values exclusively. */
export function normalizeStatus(value: unknown): TaskStatus {
  return TaskStatusSchema.parse(value === 'PLANNING' ? 'IN_PLANNING' : value === 'PROGRESS' ? 'IN_PROGRESS' : value)
}
export const ScrumRoleSchema = z.enum(['Product Owner', 'Scrum Master', 'Developer'])
export type ScrumRole = z.infer<typeof ScrumRoleSchema>
export const CatalogKindSchema = z.enum(['profession', 'stack', 'professional', 'team'])
export type CatalogKind = z.infer<typeof CatalogKindSchema>
const metadata = { version: z.literal(CONTRACT_VERSION), id: SlugSchema, name: text }
export const ProfessionMetadataSchema = z.strictObject({ ...metadata, kind: z.literal('profession') })
export const StackMetadataSchema = z.strictObject({ ...metadata, kind: z.literal('stack') })
export const ProfessionalMetadataSchema = z.strictObject({
  ...metadata, kind: z.literal('professional'), fictitious: z.boolean(), professionIds: slugs().min(1), stackIds: slugs(),
})
export const TeamMemberSchema = z.strictObject({ professionalId: SlugSchema, role: ScrumRoleSchema })
export const TeamMetadataSchema = z.strictObject({
  ...metadata, kind: z.literal('team'), members: z.array(TeamMemberSchema).min(3).max(100),
}).superRefine((team, ctx) => {
  if (new Set(team.members.map(m => m.professionalId)).size !== team.members.length)
    ctx.addIssue({ code: 'custom', path: ['members'], message: 'Profissional duplicado na equipe' })
  for (const role of ['Product Owner', 'Scrum Master'] as const) {
    if (team.members.filter(m => m.role === role).length !== 1)
      ctx.addIssue({ code: 'custom', path: ['members'], message: `Equipe exige um ${role}` })
  }
  if (!team.members.some(m => m.role === 'Developer'))
    ctx.addIssue({ code: 'custom', path: ['members'], message: 'Equipe exige Developers' })
})
export const CatalogMetadataSchema = z.discriminatedUnion('kind', [
  ProfessionMetadataSchema, StackMetadataSchema, ProfessionalMetadataSchema, TeamMetadataSchema,
])
export const MetadataSchema = CatalogMetadataSchema
export type CatalogMetadata = z.infer<typeof CatalogMetadataSchema>
export type Metadata = CatalogMetadata
export type ProfessionMetadata = z.infer<typeof ProfessionMetadataSchema>
export type StackMetadata = z.infer<typeof StackMetadataSchema>
export type ProfessionalMetadata = z.infer<typeof ProfessionalMetadataSchema>
export type TeamMetadata = z.infer<typeof TeamMetadataSchema>
export const CatalogSchema = z.array(CatalogMetadataSchema).max(10_000).superRefine((entries, ctx) => {
  const identities = new Set<string>()
  for (const [index, entry] of entries.entries()) {
    const key = `${entry.kind}:${entry.id}`
    if (identities.has(key)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'Identidade duplicada' })
    identities.add(key)
  }
  for (const [index, entry] of entries.entries()) {
    const references = entry.kind === 'professional'
      ? [...entry.professionIds.map(id => `profession:${id}`), ...entry.stackIds.map(id => `stack:${id}`)]
      : entry.kind === 'team' ? entry.members.map(m => `professional:${m.professionalId}`) : []
    for (const reference of references) if (!identities.has(reference))
      ctx.addIssue({ code: 'custom', path: [index], message: `Referência ausente: ${reference}` })
  }
})
export type Catalog = z.infer<typeof CatalogSchema>

const executable = RelativePathSchema.refine(value => value.split('/').every(part => /^[a-zA-Z0-9_][a-zA-Z0-9._+-]*$/.test(part)), 'Executável inválido')
export const CheckCommandSchema = z.strictObject({
  executable, args: z.array(z.string().max(16_384).refine(arg => !/[\x00-\x1f\x7f]/.test(arg), 'Argumento contém controle')).max(256),
  cwd: RelativePathSchema.optional(), timeoutMs: z.number().int().positive().max(1_800_000),
}).superRefine((command, ctx) => {
  const name = command.executable.split('/').at(-1)!.toLowerCase().replace(/\.exe$/, '')
  const shell = /^(?:sh|bash|zsh|dash|ksh|fish|csh|tcsh|cmd|powershell|pwsh|env)$/.test(name)
  const inlineFlag = /^(?:-[^-]*[cep]|--(?:eval|print|command)(?:=|$))/
  const interpreter = /^(?:node(?:js)?|python[\d.]*|ruby|perl|deno|bun)$/.test(name)
  if (shell || (interpreter && command.args.some(arg => inlineFlag.test(arg) || arg === 'eval')))
    ctx.addIssue({ code: 'custom', path: ['executable'], message: 'Checks exigem argv explícito, sem shell ou código inline' })
})
export type CheckCommand = z.infer<typeof CheckCommandSchema>
export const KnowledgeCitationSchema = z.strictObject({
  documentId: IdentifierSchema, path: RelativePathSchema, heading: z.string().max(1024),
  lineStart: z.number().int().positive(), lineEnd: z.number().int().positive(),
  contentHash: ContentHashSchema, commitSha: GitShaSchema, excerpt: text,
}).refine(citation => citation.lineEnd >= citation.lineStart, { path: ['lineEnd'], message: 'Intervalo de linhas invertido' })
export type KnowledgeCitation = z.infer<typeof KnowledgeCitationSchema>
export const PlannedTaskSchema = z.strictObject({
  id: IdentifierSchema, title: text, professionalId: SlugSchema, dependsOn: ids(),
  allowedPaths: uniqueStrings(RelativePathSchema).min(1), acceptanceCriteria: z.array(text).min(1).max(100),
  checks: z.array(CheckCommandSchema).min(1).max(100),
})
export type PlannedTask = z.infer<typeof PlannedTaskSchema>
export const ExecutionPlanSchema = z.strictObject({
  version: z.literal(CONTRACT_VERSION), id: IdentifierSchema, projectId: IdentifierSchema, teamId: SlugSchema,
  goal: text, branch: BranchSchema, remote: RemoteSchema, baseSha: GitShaSchema,
  tasks: z.array(PlannedTaskSchema).min(1).max(1000), definitionOfDone: z.array(text).min(1).max(100),
  limits: z.strictObject({ maxAttempts: z.literal(3), turnTimeoutMs: z.literal(1_800_000) }),
  policyHash: ContentHashSchema,
}).superRefine((plan, ctx) => {
  const byId = new Map(plan.tasks.map(task => [task.id, task]))
  if (byId.size !== plan.tasks.length) ctx.addIssue({ code: 'custom', path: ['tasks'], message: 'IDs de tarefas duplicados' })
  const visiting = new Set<string>(), visited = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false
    if (visited.has(id)) return true
    visiting.add(id)
    for (const dep of byId.get(id)?.dependsOn ?? []) if (!byId.has(dep) || !visit(dep)) return false
    visiting.delete(id)
    visited.add(id)
    return true
  }
  if (plan.tasks.some(task => !visit(task.id)))
    ctx.addIssue({ code: 'custom', path: ['tasks'], message: 'Dependências ausentes ou cíclicas' })
})
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>
export const TaskAttemptSchema = z.strictObject({
  id: IdentifierSchema, taskId: IdentifierSchema, attempt: z.number().int().min(1).max(3), baseSha: GitShaSchema,
  status: TaskStatusSchema, professionalId: SlugSchema, threadId: IdentifierSchema.optional(), turnId: IdentifierSchema.optional(),
  resultSha: GitShaSchema.optional(), evidenceIds: ids(), citationIds: ids(), reason: text.optional(),
}).superRefine((attempt, ctx) => {
  if (['BLOCKED', 'REJECTED'].includes(attempt.status) && !attempt.reason)
    ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Motivo obrigatório' })
  if (attempt.status === 'DONE' && !attempt.resultSha)
    ctx.addIssue({ code: 'custom', path: ['resultSha'], message: 'Conclusão exige SHA' })
})
export type TaskAttempt = z.infer<typeof TaskAttemptSchema>
export const ValidationEvidenceSchema = z.strictObject({
  id: IdentifierSchema, taskId: IdentifierSchema, attemptId: IdentifierSchema, command: CheckCommandSchema,
  exitCode: z.number().int(), startedAt: z.iso.datetime({ offset: true }), finishedAt: z.iso.datetime({ offset: true }),
  contentHash: ContentHashSchema, testedTreeHash: GitShaSchema.optional(), commitSha: GitShaSchema.optional(),
}).superRefine((evidence, ctx) => {
  if (!evidence.testedTreeHash && !evidence.commitSha)
    ctx.addIssue({ code: 'custom', path: ['testedTreeHash'], message: 'Evidência exige árvore ou commit testado' })
  if (Date.parse(evidence.finishedAt) < Date.parse(evidence.startedAt))
    ctx.addIssue({ code: 'custom', path: ['finishedAt'], message: 'Fim anterior ao início' })
})
export type ValidationEvidence = z.infer<typeof ValidationEvidenceSchema>
export const ApprovalDecisionSchema = z.enum(['accept', 'decline', 'cancel'])
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>
export const ApprovalRequestSchema = z.strictObject({
  id: IdentifierSchema, runId: IdentifierSchema, threadId: IdentifierSchema, turnId: IdentifierSchema, requestId: IdentifierSchema,
  kind: z.enum(['command', 'file_change', 'permissions']), summary: text, details: z.record(z.string(), z.json()),
  status: z.enum(['pending', 'accepted', 'declined', 'cancelled']),
})
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>
export const HostTurnInputSchema = z.strictObject({
  identity: z.strictObject({ professionalId: SlugSchema, role: ScrumRoleSchema, threadId: IdentifierSchema.optional() }),
  objective: text, retrievedData: z.array(KnowledgeCitationSchema).max(100), approvedPolicy: ExecutionPlanSchema,
})
export type HostTurnInput = z.infer<typeof HostTurnInputSchema>
export const HostEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('thread.started'), threadId: IdentifierSchema }),
  z.strictObject({ type: z.literal('turn.started'), threadId: IdentifierSchema, turnId: IdentifierSchema }),
  z.strictObject({ type: z.literal('content.delta'), turnId: IdentifierSchema, text: z.string() }),
  z.strictObject({ type: z.literal('tool.started'), turnId: IdentifierSchema, toolId: IdentifierSchema, name: text, input: z.json() }),
  z.strictObject({ type: z.literal('tool.completed'), turnId: IdentifierSchema, toolId: IdentifierSchema, output: z.json() }),
  z.strictObject({ type: z.literal('approval.requested'), request: ApprovalRequestSchema }),
  z.strictObject({ type: z.literal('error'), code: IdentifierSchema, message: text, retryable: z.boolean(), turnId: IdentifierSchema.optional() }),
  z.strictObject({ type: z.literal('turn.completed'), turnId: IdentifierSchema, status: z.enum(['completed', 'failed', 'interrupted', 'cancelled']) }),
])
export type HostEvent = z.infer<typeof HostEventSchema>
export interface HostAdapter {
  start(input: HostTurnInput, signal?: AbortSignal): AsyncIterable<HostEvent>
  respondToApproval(requestId: string, decision: ApprovalDecision): Promise<void>
  interrupt(turnId: string): Promise<void>
}
export const RunStatusSchema = z.enum(['queued', 'running', 'awaiting_approval', 'paused', 'blocked', 'interrupted', 'cancelled', 'completed'])
export type RunStatus = z.infer<typeof RunStatusSchema>
