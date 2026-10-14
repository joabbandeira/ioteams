import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  ApprovalDecisionSchema, HostEventSchema, HostTurnInputSchema, IdentifierSchema, GitShaSchema,
  recordHostEvidence, transitionTask, type ApprovalDecision, type HostAdapter, type HostTurnInput, type RunStatus,
  type TaskTransition, type PlannedTask, type ScrumTask,
} from '@ioteams/core'
import type { Store, StoreEvent } from '@ioteams/storage'
import { ApprovedPolicy, canonicalJson, loadPolicy, sha256, assertCheckCommand } from './policy.js'
import { gitCommand, verifyRepository } from './git.js'
import { verifyWorkspace, type Workspace } from './workspace.js'
import { assertTree, observeTree, type TestedTree } from './execution-tree.js'
import { fail, RuntimePolicyError } from './errors.js'
import type { CheckSandbox } from './checks.js'
import { planningEvents } from './planning.js'
import { PlanningRoleRecordSchema, type PlanningProposal } from './planning-contracts.js'
import { verifyCitation } from './knowledge-binding.js'

export interface ExecutionHostRequest { runId: string; attemptId: string; phase: 'implement' | 'review'; policy: ApprovedPolicy; taskId: string; identity: HostTurnInput['identity'] }
export interface ExecutionHostSession { host: HostAdapter; dispose(): Promise<void> }
/** Factories are trusted host dependencies, never model-provided controls. Each creates
 * a new dedicated runtime with T11's exact phase profile and disposes its process. */
export interface ExecutionServiceOptions {
  store: Store
  createHost(request: ExecutionHostRequest, signal?: AbortSignal): Promise<ExecutionHostSession>
  createCheckSandbox(request: { policy: ApprovedPolicy; taskId: string }, signal?: AbortSignal): Promise<CheckSandbox>
}
export interface ExecutionResult { id: string; status: RunStatus; reason?: string }
interface ActiveTurn { runId: string; host: HostAdapter; requestId?: string; denied: boolean; signal: AbortSignal; abort(): void; fault?: string; response?: Promise<void> }
const reviewSchema = z.strictObject({ taskId: IdentifierSchema, attemptId: IdentifierSchema, testedTreeHash: GitShaSchema,
  approved: z.boolean(), acceptanceMet: z.array(z.string()).max(100), definitionOfDoneMet: z.array(z.string()).max(100), reason: z.string().min(1).max(4000).optional() })
type Review = z.infer<typeof reviewSchema>
const json = (value: unknown) => z.json().parse(JSON.parse(JSON.stringify(value)))
const sameSet = (a: string[], b: readonly string[]) => a.length === b.length && new Set(a).size === a.length && b.every(v => a.includes(v))
const now = () => new Date().toISOString()
const activeWorkspaces = new Set<string>()
function assertActive(signal?: AbortSignal) { if (signal?.aborted) fail('EXECUTION_INTERRUPTED', 'Execução interrompida antes do próximo efeito.') }
/** Bound an adapter even if its async iterator ignores AbortSignal. No blind retry. */
async function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) fail('EXECUTION_INTERRUPTED', 'Operação interrompida ou excedeu o prazo.')
  let abort!: () => void
  const cancelled = new Promise<never>((_, reject) => { abort = () => reject(new RuntimePolicyError('EXECUTION_INTERRUPTED', 'Operação interrompida ou excedeu o prazo.')); signal.addEventListener('abort', abort, { once: true }) })
  try { return await Promise.race([work, cancelled]) } finally { signal.removeEventListener('abort', abort) }
}
async function dispose(operation: () => Promise<void>) { await bounded(operation(), AbortSignal.timeout(2000)) }

export class ExecutionService {
  #busy = false
  #hosts = new WeakSet<HostAdapter>()
  #approvalResponses = new Set<string>()
  #active?: ActiveTurn
  constructor(private readonly options: ExecutionServiceOptions) {}
  #events(id: string): StoreEvent[] {
    const events: StoreEvent[] = []; let cursor = 0
    while (true) { const page = this.options.store.eventsAfter(cursor, { limit: 1000 }); events.push(...page.filter(e => e.runId === id)); if (page.length < 1000) return events; cursor = page.at(-1)!.sequence }
  }
  #event(id: string, type: string, data: unknown, eventId: string = randomUUID()) {
    const run = this.options.store.get('run', id)!.data
    return this.options.store.appendEvent({ id: eventId, projectId: run.projectId, runId: id, type: `execution.${type}`, at: now(), data: json(data) })
  }
  #state(id: string, status: RunStatus, reason?: string): ExecutionResult {
    const run = this.options.store.get('run', id)!
    this.options.store.transaction(() => {
      this.options.store.update('run', { ...run.data, status }, run.version)
      this.#event(id, 'status', { status, ...(reason ? { reason } : {}) })
    })
    return this.status(id)
  }
  status(id: string): ExecutionResult {
    const run = this.options.store.get('run', id)
    if (!run) fail('UNKNOWN_RUN', 'Execução não encontrada.')
    const event = this.#events(id).filter(e => e.type === 'execution.status').at(-1)
    const reason = (event?.data as { reason?: string } | undefined)?.reason
    return { id, status: run.data.status, ...(reason ? { reason } : {}) }
  }
  #task(id: string): ScrumTask { return this.options.store.get('task', id)!.data.state }
  #saveTask(id: string, state: ScrumTask) {
    const record = this.options.store.get('task', id)!
    this.options.store.update('task', { ...record.data, state }, record.version)
  }
  #transition(id: string, command: Omit<TaskTransition, 'eventId' | 'at'>) {
    this.#saveTask(id, transitionTask(this.#task(id), { ...command, eventId: randomUUID(), at: now() }))
  }
  async #authority(authority: ApprovedPolicy) {
    if (!(authority instanceof ApprovedPolicy)) fail('UNAPPROVED_POLICY', 'Execução exige política aprovada.')
    const policy = await loadPolicy(authority.file, authority.snapshot.plan.policyHash)
    const approved = this.options.store.get('approvedPlan', policy.snapshot.plan.id)?.data
    if (!approved || canonicalJson(approved.plan) !== canonicalJson(policy.snapshot.plan)) fail('POLICY_MISMATCH', 'Plano persistido e política aprovada divergem.')
    for (const task of policy.snapshot.plan.tasks) {
      const record = this.options.store.get('task', task.id)?.data
      if (!record || record.planId !== approved.id || record.state.mode !== 'operational' || canonicalJson(record.state.plan) !== canonicalJson(task))
        fail('TASK_MISMATCH', 'Tarefas operacionais devem existir e corresponder ao plano aprovado.')
    }
    return policy
  }
  async #guard(policy: ApprovedPolicy, workspace: Workspace, taskId: string, expectedSha: string, baseSha: string, clean = false) {
    await this.#authority(policy)
    await verifyRepository(policy.snapshot.repository, { clean: true, allowWriter: true })
    return verifyWorkspace(policy, workspace, { taskId, expectedSha, baseSha, clean })
  }
  #binding(id: string, policy: ApprovedPolicy, workspace: Workspace) {
    const start = this.#events(id).find(e => e.type === 'execution.started')?.data as { policyHash?: string; workspace?: unknown } | undefined
    if (start?.policyHash !== policy.snapshot.plan.policyHash || canonicalJson(start.workspace) !== canonicalJson(workspace.repository))
      fail('RUN_MISMATCH', 'Execução pertence a outra política ou checkout.')
  }
  /** A repeated start is a status read, never permission to repeat external effects. */
  async start(raw: unknown, authority: ApprovedPolicy, workspace: Workspace, signal?: AbortSignal): Promise<ExecutionResult> {
    const { id } = z.strictObject({ id: IdentifierSchema }).parse(raw)
    const policy = await this.#authority(authority), plan = policy.snapshot.plan
    if (this.options.store.get('run', id)) { this.#binding(id, policy, workspace); return this.status(id) }
    if (this.#busy || activeWorkspaces.has(workspace.repository.root)) fail('EXECUTION_BUSY', 'Coordenador já executa uma demanda.')
    if (signal?.aborted) fail('EXECUTION_INTERRUPTED', 'Execução cancelada antes de iniciar.')
    await this.#guard(policy, workspace, plan.tasks[0].id, plan.baseSha, plan.baseSha, true)
    if (plan.tasks.some(t => this.#task(t.id).status !== 'TODO' || this.#task(t.id).attempts.length)) fail('TASK_MISMATCH', 'Nova execução exige tarefas ainda não iniciadas.')
    this.options.store.transaction(() => {
      this.options.store.create('run', { id, projectId: plan.projectId, planId: plan.id, status: 'running' })
      // Database uniqueness also rejects another service using the same retained workspace lease.
      this.#event(id, 'started', { policyHash: plan.policyHash, workspace: workspace.repository }, `workspace:${sha256(workspace.repository.root)}`)
    })
    return this.#executePlan(id, policy, workspace, signal)
  }
  /** Explicit operator resume, only after previous effects are reconciled. */
  async resume(raw: unknown, authority: ApprovedPolicy, workspace: Workspace, signal?: AbortSignal): Promise<ExecutionResult> {
    const { id } = z.strictObject({ id: IdentifierSchema }).parse(raw)
    const policy = await this.#authority(authority)
    this.#binding(id, policy, workspace)
    if (this.#busy || activeWorkspaces.has(workspace.repository.root) || ['running', 'awaiting_approval'].includes(this.status(id).status)) fail('EXECUTION_BUSY', 'Execução ativa ou ainda não reconciliada.')
    if (this.status(id).status === 'completed') return this.status(id)
    if (policy.snapshot.plan.tasks.some(t => !['TODO', 'DONE'].includes(this.#task(t.id).status))) return this.#state(id, 'paused', 'RECONCILIATION_REQUIRED')
    if (signal?.aborted) return this.#state(id, 'interrupted', 'EXECUTION_INTERRUPTED')
    this.#state(id, 'running')
    return this.#executePlan(id, policy, workspace, signal)
  }
  async #executePlan(id: string, policy: ApprovedPolicy, workspace: Workspace, signal?: AbortSignal): Promise<ExecutionResult> {
    this.#busy = true; activeWorkspaces.add(workspace.repository.root)
    try {
      const plan = policy.snapshot.plan
      let head = this.#events(id).filter(e => e.type === 'execution.commit.result' && this.#task((e.data as { taskId: string }).taskId).status === 'DONE').map(e => (e.data as { sha: string }).sha).at(-1) ?? plan.baseSha
      const remaining = new Set(plan.tasks.filter(t => this.#task(t.id).status !== 'DONE').map(t => t.id))
      while (remaining.size) {
        assertActive(signal)
        const task = plan.tasks.find(t => remaining.has(t.id) && t.dependsOn.every(dep => this.#task(dep).status === 'DONE'))
        if (!task) fail('DEPENDENCY_BLOCKED', 'Dependência ainda não concluída.')
        for (let attempt = this.#task(task.id).attempts.length + 1; attempt <= plan.limits.maxAttempts; attempt++) {
          await this.#guard(policy, workspace, task.id, head, head)
          assertActive(signal)
          this.#transition(task.id, { target: 'IN_PLANNING' }); this.#transition(task.id, { target: 'READY' })
          const attemptId = randomUUID()
          this.#transition(task.id, { target: 'IN_PROGRESS', execution: { mode: 'operational', attemptId, baseSha: head } })
          const run = this.options.store.get('run', id)!
          this.options.store.update('run', { ...run.data, taskId: task.id, attemptId, threadId: undefined, turnId: undefined }, run.version)
          this.#event(id, 'attempt', { taskId: task.id, attemptId, baseSha: head, attempt })
          const turnSignal = AbortSignal.any([AbortSignal.timeout(plan.limits.turnTimeoutMs), ...signal ? [signal] : []])
          await this.#turn(id, policy, task, 'implement', { attemptId, baseSha: head, taskId: task.id,
            previousRejection: this.#task(task.id).reason ?? null }, turnSignal)
          const paths = await this.#guard(policy, workspace, task.id, head, head)
          assertActive(turnSignal)
          if (paths.length) await gitCommand(workspace.repository.root, ['add', '--all', '--force', '--', ...paths.map(p => `:(literal)${p}`)])
          const tree = await observeTree(workspace.repository.root)
          if (tree.treeHash === (await gitCommand(workspace.repository.root, ['rev-parse', `${head}^{tree}`])).trim()) fail('NO_INCREMENT', 'Tarefa não produziu incremento para entregar.')
          let failed = false
          for (const check of task.checks) {
            await this.#guard(policy, workspace, task.id, head, head); await assertTree(workspace.repository.root, tree)
            assertActive(turnSignal)
            const command = await assertCheckCommand(policy, task.id, check)
            this.#event(id, 'check.intent', { taskId: task.id, attemptId, command: check, ...tree })
            const checkSignal = AbortSignal.any([AbortSignal.timeout(check.timeoutMs), turnSignal])
            const factory = this.options.createCheckSandbox({ policy, taskId: task.id }, checkSignal)
            const sandbox = await bounded(factory, checkSignal).catch(error => { void factory.then(s => dispose(() => s.dispose())).catch(() => {}); throw error })
            const startedAt = now()
            let result
            try { result = await bounded(sandbox.execute(command, checkSignal), checkSignal) } finally { await dispose(() => sandbox.dispose()) }
            const finishedAt = now()
            assertActive(turnSignal)
            await this.#guard(policy, workspace, task.id, head, head); await assertTree(workspace.repository.root, tree)
            const evidence = { id: randomUUID(), taskId: task.id, attemptId, command: check, exitCode: result.exitCode,
              startedAt, finishedAt, contentHash: result.contentHash, testedTreeHash: tree.treeHash }
            this.#saveTask(task.id, recordHostEvidence(this.#task(task.id), evidence))
            this.#event(id, 'check.result', evidence)
            if (result.exitCode !== 0) { failed = true; break }
          }
          if (failed) { this.#reject(id, task.id, 'CHECK_FAILED: check do host falhou.'); continue }
          const text = await this.#turn(id, policy, task, 'review', { attemptId, taskId: task.id, testedTreeHash: tree.treeHash,
            validation: { evidenceIds: this.#task(task.id).evidence.map(e => e.id), allPassed: true, evidenceHash: sha256(canonicalJson(this.#task(task.id).evidence)) } }, turnSignal)
          await this.#guard(policy, workspace, task.id, head, head); await assertTree(workspace.repository.root, tree)
          assertActive(turnSignal)
          const review = reviewSchema.parse(JSON.parse(text))
          if (review.taskId !== task.id || review.attemptId !== attemptId || review.testedTreeHash !== tree.treeHash) fail('REVIEW_MISMATCH', 'Revisão pertence a outra tentativa ou árvore.')
          if (!review.approved) { this.#reject(id, task.id, `REVIEW_REJECTED: ${review.reason ?? 'Critérios não atendidos.'}`); continue }
          if (!sameSet(review.acceptanceMet, task.acceptanceCriteria) || !sameSet(review.definitionOfDoneMet, plan.definitionOfDone)) fail('REVIEW_INCOMPLETE', 'Revisão não cobriu aceitação e DoD exatas.')
          this.#event(id, 'review', review)
          head = await this.#commit(id, policy, workspace, task, attemptId, head, tree, turnSignal)
          await this.#deliver(id, policy, workspace, task, attemptId, head, tree.treeHash, review, turnSignal)
          break
        }
        if (this.#task(task.id).status !== 'DONE') return this.#state(id, 'blocked', 'ATTEMPTS_EXHAUSTED')
        remaining.delete(task.id)
      }
      return this.#state(id, 'completed')
    } catch (error) { return this.#failure(id, error, signal) }
    finally { this.#busy = false; activeWorkspaces.delete(workspace.repository.root) }
  }
  #reject(id: string, taskId: string, reason: string) {
    this.options.store.transaction(() => {
      this.#transition(taskId, { target: 'REJECTED', reason }); this.#transition(taskId, { target: 'TODO' })
      this.#event(id, 'rejected', { taskId, reason })
    })
  }
  #failure(id: string, error: unknown, signal?: AbortSignal): ExecutionResult {
    const code = error instanceof RuntimePolicyError ? error.code : 'EXECUTION_INFRASTRUCTURE'
    const paused = ['GIT_FAILED', 'PUSH_UNCERTAIN', 'REMOTE_DIVERGED', 'COMMIT_UNCERTAIN', 'APPROVAL_UNCERTAIN', 'NATIVE_APPROVAL_DENIED', 'HOST_ERROR', 'HOST_INCOMPLETE', 'EXECUTION_INTERRUPTED', 'CHECK_INFRASTRUCTURE', 'CHECK_TIMEOUT', 'CHECK_INTERRUPTED', 'EXECUTION_INFRASTRUCTURE'].includes(code)
    return this.#state(id, signal?.aborted ? 'interrupted' : paused ? 'paused' : 'blocked', code)
  }
  async #sources(policy: ApprovedPolicy, task: PlannedTask) {
    const proposal = planningEvents(this.options.store, policy.snapshot.plan.projectId).find(event =>
      event.type === 'planning.proposed' && (event.data as unknown as PlanningProposal).policy?.plan?.policyHash === policy.snapshot.plan.policyHash)?.data as unknown as PlanningProposal | undefined
    // A manually approved operator plan may have no planning/RAG proposal.
    if (!proposal) return []
    const role = proposal.roles.find(record => record.role === 'Developer' && record.professionalId === task.professionalId)
    if (!role) fail('NO_EVIDENCE', 'Proposta aprovada não contém fontes do Developer designado.')
    const citations = PlanningRoleRecordSchema.parse(role).citations
    for (const citation of citations) {
      let verified = false
      for (const root of policy.snapshot.corpusRoots) {
        try { await verifyCitation(root, citation); verified = true; break } catch { /* Only declared corpus roots are considered. */ }
      }
      if (!verified) fail('NO_EVIDENCE', 'Fonte da proposta aprovada não é mais verificável.')
    }
    return citations
  }
  async #turn(id: string, policy: ApprovedPolicy, task: PlannedTask, phase: 'implement' | 'review', context: unknown, outerSignal: AbortSignal): Promise<string> {
    const controller = new AbortController(), signal = AbortSignal.any([outerSignal, controller.signal])
    const identity = { professionalId: task.professionalId, role: 'Developer' as const }
    const objective = { purpose: phase, ...context as object,
      constraints: phase === 'implement' ? 'Implemente somente a tarefa designada no plano aprovado. Não faça commit/push nem altere controles. O host executa checks e entrega Git.' : 'Revise de forma independente com ferramentas somente leitura. Aceitação e DoD estão no plano aprovado. Retorne somente JSON do contrato; evidência de checks vem exclusivamente do host.',
      ...(phase === 'review' ? { outputContract: z.toJSONSchema(reviewSchema) } : {}),
    }
    const retrievedData = await this.#sources(policy, task)
    const input = HostTurnInputSchema.parse({ identity, objective: JSON.stringify(objective), retrievedData, approvedPolicy: policy.snapshot.plan })
    assertActive(signal)
    const attemptId = this.#task(task.id).attempts.at(-1)!.id
    const factory = this.options.createHost({ runId: id, attemptId, phase, policy, taskId: task.id, identity }, signal)
    const session = await bounded(factory, signal).catch(error => { void factory.then(s => dispose(() => s.dispose())).catch(() => {}); throw error })
    let threadId: string | undefined, turnId: string | undefined, terminal = false, count = 0, text = ''
    try {
      if (this.#hosts.has(session.host)) fail('SESSION_REUSE', 'Factory reutilizou host de outra fase ou tentativa.')
      this.#hosts.add(session.host)
      const active: ActiveTurn = { runId: id, host: session.host, denied: false, signal, abort: () => controller.abort() }; this.#active = active
      const iterator = session.host.start(input, signal)[Symbol.asyncIterator]()
      while (true) {
        const uncertain = (error: unknown): never => { if (active.fault) fail(active.fault, 'Resposta nativa incerta; reconciliação necessária.'); throw error }
        const next = await bounded(iterator.next(), signal).catch(uncertain)
        if (active.response) { await bounded(active.response, signal).catch(uncertain); active.response = undefined }
        if (active.denied) fail('NATIVE_APPROVAL_DENIED', 'Decisão nativa recusou a operação; não é rejeição técnica.')
        if (next.done) break
        const event = HostEventSchema.parse(next.value)
        if (++count > 10000 || terminal) fail('HOST_PROTOCOL', 'Fluxo inválido ou excessivo.')
        if (event.type === 'thread.started') {
          if (threadId) fail('SESSION_REUSE', 'Turno deve usar exatamente uma nova sessão.')
          // Event ID uniqueness is global, including planning sessions.
          const all: StoreEvent[] = []; let cursor = 0
          while (true) { const page = this.options.store.eventsAfter(cursor, { limit: 1000 }); all.push(...page); if (page.length < 1000) break; cursor = page.at(-1)!.sequence }
          if (all.some(e => ['execution.session', 'planning.session'].includes(e.type) && (e.data as { threadId?: string }).threadId === event.threadId)) fail('SESSION_REUSE', 'Sessão já utilizada.')
          threadId = event.threadId; this.#event(id, 'session', { phase, taskId: task.id, attemptId, threadId })
        } else if (event.type === 'turn.started') {
          if (!threadId || turnId || event.threadId !== threadId) fail('HOST_PROTOCOL', 'Turno de outra sessão.')
          turnId = event.turnId
          const run = this.options.store.get('run', id)!
          this.options.store.update('run', { ...run.data, threadId, turnId }, run.version)
          this.#event(id, 'turn', { phase, taskId: task.id, attemptId, threadId, turnId })
        } else if (event.type === 'error') fail('HOST_ERROR', 'Host reportou falha; não repetir inferência automaticamente.')
        else if (event.type === 'approval.requested') {
          const request = event.request
          if (!turnId || request.runId !== id || request.threadId !== threadId || request.turnId !== turnId || request.status !== 'pending' || active.requestId) fail('HOST_PROTOCOL', 'Aprovação não corresponde ao turno ativo.')
          active.requestId = request.requestId
          const run = this.options.store.get('run', id)!.data
          this.options.store.create('approval', { ...request, projectId: run.projectId })
          this.#state(id, 'awaiting_approval')
        } else {
          if (!turnId || event.turnId !== turnId) fail('HOST_PROTOCOL', 'Evento de outro turno.')
          if (event.type === 'content.delta') {
            text += event.text
            if (Buffer.byteLength(text) > 262144) fail('HOST_PROTOCOL', 'Resposta excessiva.')
          } else if (event.type === 'turn.completed') {
            if (event.status !== 'completed' || active.requestId) fail('HOST_INCOMPLETE', 'Turno não concluído ou aprovação pendente.')
            terminal = true
          }
        }
      }
      if (!threadId || !turnId || !terminal) fail('HOST_INCOMPLETE', 'Host terminou sem conclusão verificável.')
      this.#event(id, 'turn.result', { phase, taskId: task.id, attemptId, threadId, turnId, contentHash: sha256(text) })
      return text
    } finally {
      if (turnId && !terminal) { try { await dispose(() => session.host.interrupt(turnId!)) } catch { /* preserve uncertain state */ } }
      this.#active = undefined
      await dispose(() => session.dispose())
    }
  }
  /** Trusted human/service endpoint only; never exposed as a model tool. */
  async respondToApproval(runId: string, requestId: string, raw: ApprovalDecision): Promise<void> {
    const decision = ApprovalDecisionSchema.parse(raw), active = this.#active
    if (!active || active.runId !== runId || active.requestId !== requestId) fail('STALE_APPROVAL', 'Solicitação não está ativa neste serviço.')
    const request = this.options.store.list('approval').find(r => r.data.runId === runId && r.data.requestId === requestId && r.data.status === 'pending')
    if (!request) fail('STALE_APPROVAL', 'Decisão já registrada ou solicitação ausente.')
    if (this.#approvalResponses.has(request.data.id)) fail('STALE_APPROVAL', 'Decisão já enviada; resultado exige reconciliação.')
    this.#approvalResponses.add(request.data.id)
    // Persist intent before native RPC; failure is uncertain and never auto-replayed.
    this.#event(runId, 'approval.intent', { requestId, decision })
    active.denied = decision !== 'accept'
    const response = (async () => {
      try {
        await bounded(active.host.respondToApproval(requestId, decision), AbortSignal.any([active.signal, AbortSignal.timeout(10_000)]))
        if (this.#active !== active || active.signal.aborted) fail('APPROVAL_UNCERTAIN', 'Turno encerrou durante a decisão nativa.')
        this.options.store.update('approval', { ...request.data, status: decision === 'accept' ? 'accepted' : decision === 'decline' ? 'declined' : 'cancelled' }, request.version)
        active.requestId = undefined
        this.#state(runId, 'running')
      } catch {
        active.fault = 'APPROVAL_UNCERTAIN'; active.abort()
        fail('APPROVAL_UNCERTAIN', 'Decisão enviada sem confirmação segura; não repetir o RPC.')
      }
    })()
    active.response = response
    await response
  }
  async #commit(id: string, policy: ApprovedPolicy, workspace: Workspace, task: PlannedTask, attemptId: string, parentSha: string, tree: TestedTree, signal: AbortSignal) {
    await this.#guard(policy, workspace, task.id, parentSha, parentSha); await assertTree(workspace.repository.root, tree)
    assertActive(signal)
    const subject = `ioteams: ${task.id} (${attemptId})`
    this.#event(id, 'commit.intent', { taskId: task.id, attemptId, parentSha, ...tree, subject })
    await gitCommand(workspace.repository.root, ['-c', 'user.name=ioteams', '-c', 'user.email=ioteams@localhost.invalid', 'commit', '-m', subject])
    const sha = (await gitCommand(workspace.repository.root, ['rev-parse', 'HEAD'])).trim()
    await this.#verifyCommit(policy, workspace, task.id, { parentSha, treeHash: tree.treeHash, subject }, sha)
    this.#event(id, 'commit.result', { taskId: task.id, attemptId, sha, treeHash: tree.treeHash })
    assertActive(signal)
    return sha
  }
  async #verifyCommit(policy: ApprovedPolicy, workspace: Workspace, taskId: string, intent: { parentSha: string; treeHash: string; subject: string }, sha: string) {
    await this.#guard(policy, workspace, taskId, sha, intent.parentSha, true)
    const observed = (await gitCommand(workspace.repository.root, ['show', '-s', '--format=%P%n%T%n%s', sha])).trim().split('\n')
    if (observed[0] !== intent.parentSha || observed[1] !== intent.treeHash || observed[2] !== intent.subject) fail('COMMIT_UNCERTAIN', 'Commit não corresponde à intenção registrada.')
    if ((await gitCommand(workspace.repository.root, ['ls-files', '--others', '-z'])).length) fail('TREE_CHANGED', 'Artefatos não versionados após commit.')
  }
  async #remote(policy: ApprovedPolicy, workspace: Workspace): Promise<string> {
    const plan = policy.snapshot.plan, ref = `refs/heads/${plan.branch}`
    const output = (await gitCommand(workspace.repository.root, ['ls-remote', '--exit-code', plan.remote, ref])).trim().split('\n')
    if (output.length !== 1 || output[0].split('\t')[1] !== ref) fail('REMOTE_DIVERGED', 'Remote não confirmou referência exata.')
    return GitShaSchema.parse(output[0].split('\t')[0])
  }
  async #deliver(id: string, policy: ApprovedPolicy, workspace: Workspace, task: PlannedTask, attemptId: string, sha: string, treeHash: string, review: Review, signal: AbortSignal) {
    assertActive(signal)
    const state = this.#task(task.id)
    if (state.delivery.pushRequired) {
      const expectedRemoteSha = this.#events(id).filter(e => e.type === 'execution.push.result').map(e => (e.data as { sha: string }).sha).at(-1) ?? policy.snapshot.plan.baseSha
      if (await this.#remote(policy, workspace) !== expectedRemoteSha) fail('REMOTE_DIVERGED', 'Remote avançou antes da entrega; reconciliação necessária.')
      assertActive(signal)
      this.#event(id, 'push.intent', { taskId: task.id, attemptId, sha, treeHash, expectedRemoteSha })
      await gitCommand(workspace.repository.root, ['push', '--porcelain', policy.snapshot.plan.remote, `${sha}:refs/heads/${policy.snapshot.plan.branch}`])
      if (await this.#remote(policy, workspace) !== sha) fail('PUSH_UNCERTAIN', 'Remote não confirmou exatamente o commit autorizado.')
      this.#event(id, 'push.result', { taskId: task.id, attemptId, sha })
    }
    assertActive(signal)
    this.#finish(task.id, policy, sha, treeHash, review)
  }
  #finish(taskId: string, policy: ApprovedPolicy, sha: string, treeHash: string, review: Review) {
    this.#transition(taskId, { target: 'DONE', completion: { mode: 'operational', acceptanceMet: review.acceptanceMet,
      definitionOfDoneMet: review.definitionOfDoneMet, review: { taskId, attemptId: review.attemptId, testedTreeHash: treeHash, approved: true },
      commit: { sha, treeHash }, ...this.#task(taskId).delivery.pushRequired ? { remote: { name: policy.snapshot.plan.remote, branch: policy.snapshot.plan.branch, sha } } : {} } })
  }
  /** Reconcile existing commit/push only. Never restart a turn, check or commit.
   * retryPush is an explicit operator resume, allowed only after observing unchanged remote. */
  async reconcile(raw: unknown, authority: ApprovedPolicy, workspace: Workspace): Promise<ExecutionResult> {
    const { id, retryPush } = z.strictObject({ id: IdentifierSchema, retryPush: z.boolean().default(false) }).parse(raw)
    const policy = await this.#authority(authority)
    this.#binding(id, policy, workspace)
    if (this.#busy || this.#active || activeWorkspaces.has(workspace.repository.root)) fail('EXECUTION_BUSY', 'Execução ainda ativa; aguarde liberação.')
    if (this.status(id).status === 'completed') return this.status(id)
    this.#busy = true; activeWorkspaces.add(workspace.repository.root)
    try {
      const events = this.#events(id)
      const event = events.filter(e => e.type === 'execution.commit.intent').at(-1)
      if (!event) return this.#state(id, 'paused', 'RECONCILIATION_REQUIRED')
      const intent = event.data as unknown as { taskId: string; attemptId: string; parentSha: string; treeHash: string; workingHash: string; subject: string }
      const state = this.#task(intent.taskId)
      if (state.attempts.at(-1)?.id !== intent.attemptId) fail('COMMIT_UNCERTAIN', 'Tentativa divergiu da intenção de entrega.')
      const sha = (await gitCommand(workspace.repository.root, ['rev-parse', 'HEAD'])).trim()
      if (sha === intent.parentSha) return this.#state(id, 'paused', 'COMMIT_NOT_CONFIRMED')
      await this.#verifyCommit(policy, workspace, intent.taskId, intent, sha)
      const reviewEvent = events.filter(e => e.type === 'execution.review' && (e.data as { attemptId: string }).attemptId === intent.attemptId).at(-1)
      const review = reviewSchema.parse(reviewEvent?.data)
      if (!review.approved || review.testedTreeHash !== intent.treeHash) fail('REVIEW_MISMATCH', 'Revisão persistida não cobre o commit.')
      if (!events.some(e => e.type === 'execution.commit.result' && (e.data as { sha: string }).sha === sha)) this.#event(id, 'commit.result', { taskId: intent.taskId, attemptId: intent.attemptId, sha, treeHash: intent.treeHash })
      if (state.delivery.pushRequired) {
        let remote = await this.#remote(policy, workspace)
        const push = events.filter(e => e.type === 'execution.push.intent' && (e.data as { sha: string }).sha === sha).at(-1)?.data as { expectedRemoteSha: string } | undefined
        if (remote !== sha && retryPush) {
          const expected = push?.expectedRemoteSha ?? events.filter(e => e.type === 'execution.push.result').map(e => (e.data as { sha: string }).sha).at(-1) ?? policy.snapshot.plan.baseSha
          if (remote !== expected) fail('REMOTE_DIVERGED', 'Remote avançou; não repetir push.')
          this.#event(id, 'push.intent', { taskId: intent.taskId, attemptId: intent.attemptId, sha, treeHash: intent.treeHash, expectedRemoteSha: expected })
          await gitCommand(workspace.repository.root, ['push', '--porcelain', policy.snapshot.plan.remote, `${sha}:refs/heads/${policy.snapshot.plan.branch}`])
          remote = await this.#remote(policy, workspace)
        }
        if (remote !== sha) return this.#state(id, 'paused', push && remote === push.expectedRemoteSha ? 'PUSH_NOT_CONFIRMED' : 'REMOTE_DIVERGED')
        if (!events.some(e => e.type === 'execution.push.result' && (e.data as { sha: string }).sha === sha)) this.#event(id, 'push.result', { taskId: intent.taskId, attemptId: intent.attemptId, sha })
      }
      if (state.status !== 'DONE') this.#finish(intent.taskId, policy, sha, intent.treeHash, review)
      return this.#state(id, policy.snapshot.plan.tasks.every(t => this.#task(t.id).status === 'DONE') ? 'completed' : 'paused', policy.snapshot.plan.tasks.every(t => this.#task(t.id).status === 'DONE') ? undefined : 'RECONCILED_REMAINING_TASKS')
    } catch (error) { return this.#failure(id, error) }
    finally { this.#busy = false; activeWorkspaces.delete(workspace.repository.root) }
  }
}
