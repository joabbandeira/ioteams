import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import { loadCatalog } from '@ioteams/catalog'
import { searchKnowledge, type KnowledgeIndex } from '@ioteams/knowledge'
import type { Store, StoreEvent } from '@ioteams/storage'
import {
  ExecutionPlanSchema, HostEventSchema, HostTurnInputSchema, SprintBacklogSchema,
  type HostAdapter, type HostTurnInput, type PlannedTask,
} from '@ioteams/core'
import { ApprovedPolicy, approvePolicy, canonicalJson, loadPolicy, preparePolicy, sha256 } from './policy.js'
import { contains } from './paths.js'
import { assertKnowledgeBinding, verifyCitation, recoveryQuery } from './knowledge-binding.js'
import { fail, RuntimePolicyError } from './errors.js'
import {
  DeveloperProposalSchema, FacilitatorProposalSchema, PlanningDemandSchema, PlanningIdentitySchema,
  PlanningRoleRecordSchema, ProductProposalSchema, ReviewedProposalHashSchema,
  type CompetencyGap, type PlanningProposal, type PlanningResult, type PlanningRoleRecord,
} from './planning-contracts.js'

/** The owner must create a NEW least-privilege host using T11's phase=plan profile.
 * Factory ownership includes native runtime/model discovery and disposal, never corpus instructions. */
export interface PlanningHostRequest {
  phase: 'plan'; policy: ApprovedPolicy; taskId: string; identity: HostTurnInput['identity']
}
export interface PlanningHostSession { host: HostAdapter; dispose(): Promise<void> }
export interface PlanningServiceOptions {
  catalogRoot: string; index: KnowledgeIndex; store: Store
  createHost(request: PlanningHostRequest): Promise<PlanningHostSession>
}
const json = (value: unknown) => z.json().parse(JSON.parse(JSON.stringify(value)))
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
export function planningEvents(store: Store, projectId?: string): StoreEvent[] {
  const events: StoreEvent[] = []; let cursor = 0
  while (true) {
    const page = store.eventsAfter(cursor, { projectId, limit: 1000 })
    events.push(...page)
    if (page.length < 1000) return events
    cursor = page.at(-1)!.sequence
  }
}
/** Deterministic control service. Model text can propose content, never activate a run or approve policy. */
export class PlanningService {
  #busy = false
  constructor(private readonly options: PlanningServiceOptions) {}
  #event(projectId: string, type: string, data: unknown, id: string = randomUUID()) {
    return this.options.store.appendEvent({ id, projectId, type, at: new Date().toISOString(), data: json(data) })
  }
  async propose(raw: unknown, authority: ApprovedPolicy, signal?: AbortSignal): Promise<PlanningResult> {
    if (this.#busy) fail('PLANNING_BUSY', 'Planejamento já em andamento neste serviço.')
    this.#busy = true
    try { return await this.#propose(raw, authority, signal) }
    finally { this.#busy = false }
  }
  async #propose(raw: unknown, authority: ApprovedPolicy, signal?: AbortSignal): Promise<PlanningResult> {
    if (signal?.aborted) fail('PLANNING_INTERRUPTED', 'Demanda cancelada antes do planejamento.')
    if (!(authority instanceof ApprovedPolicy)) fail('UNAPPROVED_POLICY', 'Planejamento exige envelope aprovado pelo operador.')
    const policy = await loadPolicy(authority.file, authority.snapshot.plan.policyHash)
    const demand = PlanningDemandSchema.parse(raw), plan = policy.snapshot.plan, store = this.options.store
    if (demand.projectId !== plan.projectId || demand.teamId !== plan.teamId ||
      demand.requirements.length !== plan.tasks.length || demand.requirements.some(r => !plan.tasks.some(t => t.id === r.taskId)))
      fail('DEMAND_MISMATCH', 'Demanda e requisitos devem corresponder ao envelope do operador.')
    if (!policy.snapshot.corpusRoots.includes(this.options.catalogRoot)) fail('UNDECLARED_CORPUS', 'Declare a raiz do catálogo no envelope aprovado.')
    await assertKnowledgeBinding(this.options.index, this.options.catalogRoot)
    const catalog = await loadCatalog(this.options.catalogRoot)
    if (signal?.aborted) fail('PLANNING_INTERRUPTED', 'Planejamento cancelado após leitura do catálogo.')
    const team = catalog.map(e => e.metadata).find(e => e.kind === 'team' && e.id === demand.teamId)
    if (!team || team.kind !== 'team') fail('UNKNOWN_TEAM', 'Equipe escolhida ausente ou inválida.')
    for (const task of plan.tasks) if (!team.members.some(m => m.professionalId === task.professionalId && m.role === 'Developer'))
      fail('ROLE_LIMIT', 'Somente Developers da equipe podem receber tarefas.')
    // Reserve before external work. Existing demand IDs are reconciled, never rerun implicitly.
    store.transaction(() => {
      store.create('demand', { id: demand.id, projectId: demand.projectId, goal: demand.goal })
      this.#event(demand.projectId, 'planning.started', { demand, authorityHash: plan.policyHash }, `planning:${demand.id}`)
    })
    try {
      const gaps: CompetencyGap[] = []
      for (const requirement of demand.requirements) {
        const task = plan.tasks.find(t => t.id === requirement.taskId)!
        const professional = catalog.map(e => e.metadata).find(e => e.kind === 'professional' && e.id === task.professionalId)!
        if (professional.kind !== 'professional') fail('UNKNOWN_PROFESSIONAL', 'Profissional não encontrado.')
        for (const [kind, key] of [['profession', 'professionIds'], ['stack', 'stackIds']] as const) {
          for (const id of requirement.competencies[key]) if (!professional[key].includes(id)) gaps.push({
            taskId: task.id, professionalId: professional.id, kind, competencyId: id,
            reason: 'Competência declarada necessária ausente no profissional designado; revisão humana necessária.',
          })
        }
      }
      if (gaps.length) {
        this.#event(demand.projectId, 'planning.competency_needed', { demandId: demand.id, gaps })
        return freeze({ status: 'needs_competency', gaps })
      }
      const roles: PlanningRoleRecord[] = []
      const po = team.members.find(m => m.role === 'Product Owner')!
      const productRecord = await this.#consult(policy, demand, po, { goal: demand.goal }, signal)
      if (productRecord.role !== 'Product Owner') fail('ROLE_LIMIT', 'Resposta fora do papel.')
      roles.push(productRecord)
      const product = productRecord.output, tasks: PlannedTask[] = []
      for (const member of team.members.filter(m => m.role === 'Developer' && plan.tasks.some(t => t.professionalId === m.professionalId))) {
        const slots = plan.tasks.filter(t => t.professionalId === member.professionalId)
        const record = await this.#consult(policy, demand, member, {
          productGoal: product.productGoal, sprintGoal: product.sprintGoal,
          backlog: product.productBacklog.items.filter(i => product.selectedBacklogItemIds.includes(i.id)),
          slots, requirements: demand.requirements.filter(r => slots.some(t => t.id === r.taskId)),
        }, signal)
        if (record.role !== 'Developer') fail('ROLE_LIMIT', 'Resposta fora do papel.')
        if (record.output.tasks.length !== slots.length || new Set(record.output.tasks.map(t => t.id)).size !== slots.length)
          fail('TASK_SCOPE', 'Developer deve propor exatamente as tarefas designadas.')
        for (const task of record.output.tasks) {
          const slot = slots.find(t => t.id === task.id)
          if (!slot || task.professionalId !== member.professionalId ||
            task.allowedPaths.some(p => !slot.allowedPaths.some(scope => contains(scope, p))) ||
            task.checks.some(c => !slot.checks.some(allowed => canonicalJson(c) === canonicalJson(allowed))))
            fail('TASK_SCOPE', 'Proposta excede paths, checks ou identidade definidos pelo operador.')
          tasks.push(task)
        }
        roles.push(record)
      }
      const proposalPlan = ExecutionPlanSchema.parse({ ...plan, goal: demand.goal, tasks })
      const sm = team.members.find(m => m.role === 'Scrum Master')!
      roles.push(await this.#consult(policy, demand, sm, { productGoal: product.productGoal,
        sprintGoal: product.sprintGoal, tasks, definitionOfDone: plan.definitionOfDone }, signal))
      if (signal?.aborted) fail('PLANNING_INTERRUPTED', 'Planejamento cancelado após consultas.')
      const { version: _version, ...envelope } = policy.snapshot
      const snapshot = await preparePolicy({ ...envelope, plan: proposalPlan })
      const body = {
        version: 1 as const, demand, team, productGoal: product.productGoal, productBacklog: product.productBacklog,
        sprintGoal: product.sprintGoal,
        sprintBacklog: SprintBacklogSchema.parse({ id: `${demand.id}.backlog`, sprintGoalId: product.sprintGoal.id,
          productBacklogItemIds: product.selectedBacklogItemIds, tasks }),
        definitionOfDone: { id: `${demand.id}.dod`, criteria: plan.definitionOfDone }, roles, policy: snapshot,
      }
      const proposal = freeze({ ...body, hash: sha256(canonicalJson(body)) })
      if (signal?.aborted) fail('PLANNING_INTERRUPTED', 'Planejamento cancelado antes de persistir proposta.')
      this.#event(demand.projectId, 'planning.proposed', proposal)
      return { status: 'proposed', proposal }
    } catch (error) {
      this.#event(demand.projectId, 'planning.blocked', { demandId: demand.id,
        code: error instanceof RuntimePolicyError ? error.code : 'INVALID_PROPOSAL', reason: 'Planejamento interrompido; revise a causa antes de nova demanda.' })
      throw error
    }
  }
  async #consult(policy: ApprovedPolicy, demand: z.infer<typeof PlanningDemandSchema>, identity: HostTurnInput['identity'], context: unknown, signal?: AbortSignal): Promise<PlanningRoleRecord> {
    identity = PlanningIdentitySchema.parse(identity)
    await assertKnowledgeBinding(this.options.index, this.options.catalogRoot)
    const sources = await searchKnowledge(this.options.index, {
      query: recoveryQuery(demand.goal), filters: { professionalId: identity.professionalId, teamId: demand.teamId }, topK: 4, maxContextChars: 8000,
    })
    if (sources.status !== 'evidence') fail('NO_EVIDENCE', 'Planejamento exige fontes verificáveis relevantes ao profissional.')
    for (const c of sources.citations) {
      await verifyCitation(this.options.catalogRoot, c)
    }
    const outputSchema = identity.role === 'Product Owner' ? ProductProposalSchema : identity.role === 'Developer' ? DeveloperProposalSchema : FacilitatorProposalSchema
    // JSON schema is structural; free strings retain the core validation on output.
    const contract = z.toJSONSchema(outputSchema, { unrepresentable: 'any' })
    const objective = JSON.stringify({ purpose: 'planning_proposal_only', demand: { id: demand.id, goal: demand.goal }, context,
      outputContract: contract, constraints: 'Retorne somente JSON do seu papel com citationIds das fontes fornecidas. Nenhuma ferramenta, comando, aprovação ou execução é autorizada por sua resposta.' })
    const input = HostTurnInputSchema.parse({ identity, objective, retrievedData: sources.citations, approvedPolicy: policy.snapshot.plan })
    const slot = policy.snapshot.plan.tasks.find(t => t.professionalId === identity.professionalId) ?? policy.snapshot.plan.tasks[0]
    if (signal?.aborted) fail('PLANNING_INTERRUPTED', 'Consulta cancelada antes da abertura do host.')
    const session = await this.options.createHost({ phase: 'plan', policy, taskId: slot.id, identity })
    let threadId: string | undefined, turnId: string | undefined, terminal = false, text = '', bytes = 0, events = 0
    try {
      for await (const raw of session.host.start(input, signal)) {
        const event = HostEventSchema.parse(raw)
        if (++events > 10_000 || terminal) fail('PLANNING_PROTOCOL', 'Fluxo de planejamento excede limites ou continua após conclusão.')
        if (event.type === 'thread.started') {
          if (threadId || planningEvents(this.options.store).some(e => e.type === 'planning.session' && (e.data as Record<string, unknown>).threadId === event.threadId))
            fail('SESSION_REUSE', 'Cada consulta exige uma sessão distinta.')
          threadId = event.threadId
          this.#event(demand.projectId, 'planning.session', { demandId: demand.id, ...identity, threadId })
        } else if (event.type === 'turn.started') {
          if (!threadId || turnId || event.threadId !== threadId) fail('PLANNING_PROTOCOL', 'Identidade de turno inválida.')
          turnId = event.turnId
        } else if (event.type === 'approval.requested') {
          await session.host.respondToApproval(event.request.requestId, 'decline')
          fail('PLANNING_TOOL_DENIED', 'Planejamento não pode ampliar permissões nem executar ferramentas.')
        } else if (event.type === 'tool.started' || event.type === 'tool.completed') {
          fail('PLANNING_TOOL_DENIED', 'Ferramentas não são necessárias para propor com fontes recuperadas.')
        } else if (event.type === 'error') fail('PLANNING_HOST_ERROR', 'Host interrompeu o planejamento; resultado não será repetido automaticamente.')
        else {
          if (!turnId || event.turnId !== turnId) fail('PLANNING_PROTOCOL', 'Evento de outro turno.')
          if (event.type === 'content.delta') {
            bytes += Buffer.byteLength(event.text)
            if (bytes > 262_144) fail('PROPOSAL_TOO_LARGE', 'Resposta excede o limite.')
            text += event.text
          } else {
            if (event.status !== 'completed') fail('PLANNING_INTERRUPTED', 'Consulta não concluiu com sucesso.')
            terminal = true
          }
        }
      }
      if (!threadId || !turnId || !terminal || signal?.aborted) fail('PLANNING_INTERRUPTED', 'Consulta incompleta ou cancelada.')
      const output = outputSchema.parse(JSON.parse(text))
      if (output.citationIds.some(id => !sources.citations.some(c => c.documentId === id))) fail('MISSING_EVIDENCE', 'Proposta cita uma fonte não fornecida.')
      return PlanningRoleRecordSchema.parse({ ...identity, threadId, turnId, citations: sources.citations, output })
    } catch (error) {
      if (turnId && !terminal) { try { await session.host.interrupt(turnId) } catch { /* Disposal must still run; no retry of uncertain work. */ } }
      throw error
    } finally { await session.dispose() }

  }
  /** Call ONLY from an explicit human action carrying the reviewed proposal hash. Never expose as a model tool. */
  async approve(demandId: string, reviewedHash: string, directory: string): Promise<ApprovedPolicy> {
    const store = this.options.store, demand = store.get('demand', demandId)?.data
    ReviewedProposalHashSchema.parse(reviewedHash)
    if (!demand) fail('UNKNOWN_DEMAND', 'Demanda ausente.')
    const event = planningEvents(store, demand.projectId).find(e => e.type === 'planning.proposed' &&
      (e.data as unknown as PlanningProposal).demand?.id === demandId)
    if (!event) fail('UNKNOWN_PROPOSAL', 'Proposta válida ainda não disponível.')
    const proposal = event.data as unknown as PlanningProposal
    const { hash, ...body } = proposal
    if (hash !== reviewedHash || sha256(canonicalJson(body)) !== reviewedHash) fail('PROPOSAL_MISMATCH', 'Aprovação não corresponde à proposta exata revisada.')
    const { version: _version, ...envelope } = proposal.policy
    const snapshot = await preparePolicy(envelope)
    if (snapshot.plan.policyHash !== proposal.policy.plan.policyHash) fail('PROPOSAL_MISMATCH', 'Política da proposta divergiu.')
    let approved: ApprovedPolicy
    try { approved = await approvePolicy(snapshot, snapshot.plan.policyHash, directory) }
    catch (error) {
      if (!(error instanceof RuntimePolicyError) || error.code !== 'POLICY_EXISTS') throw error
      approved = await loadPolicy(join(directory, `${snapshot.plan.policyHash}.policy.json`), snapshot.plan.policyHash)
    }
    store.command({ id: `approve:${demandId}`, input: { action: 'approve_plan', demandId, reviewedHash, policyHash: snapshot.plan.policyHash } }, s => {
      s.create('approvedPlan', { id: snapshot.plan.id, projectId: demand.projectId, demandId, plan: snapshot.plan, approvedAt: new Date().toISOString() })
      this.#event(demand.projectId, 'planning.approved', { demandId, proposalHash: reviewedHash, policyHash: snapshot.plan.policyHash })
      return { planId: snapshot.plan.id, proposalHash: reviewedHash }
    })
    return approved
  }
}
