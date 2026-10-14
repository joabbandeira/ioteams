import React, { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { PlanRequestSchema, PlanningStatusSchema, ProposalResponseSchema, TrustedBindingSchema, records } from '@ioteams/server/contracts'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { ConfirmAction, FieldSelect, Notice, useAction } from '../components/panel-ui'
import { errorMessage, type PanelClient, type PanelSnapshot } from '../services/client'
import { PlanReview, type PlanningState, type Proposal } from './plan-review'
type Binding = z.infer<typeof TrustedBindingSchema>
type Requirements = z.infer<typeof PlanRequestSchema>['requirements']
export function ConfigurationView({ client, snapshot, refresh, onFailure, onDirty }: { client: PanelClient; snapshot: PanelSnapshot; refresh(): Promise<void>; onFailure(error: unknown): void; onDirty(value: boolean): void }) {
  const [id, setId] = useState(''), [dirty, setDirty] = useState(false)
  const binding = snapshot.bindings.find(item => item.demandId === (id || snapshot.bindings[0]?.demandId))
  return <div className="panel-view"><header className="panel-heading"><span className="eyebrow">AUTORIDADE REVISADA · ESCOPO EXPLÍCITO</span><h1 tabIndex={-1}>Configuração</h1><p>Configure a demanda dentro dos limites aprovados pelo operador na CLI.</p></header>{!binding ? <Notice>Nenhum binding confiável disponível. Prepare e aprove a política na CLI e associe o ID da demanda na configuração do launcher. O painel não inventa projeto, equipe ou slots.</Notice> : <><Card className="panel-card"><label>Configuração confiável inicial</label><FieldSelect label="Binding confiável" value={binding.demandId} onChange={setId} disabled={dirty} items={snapshot.bindings.map(item => ({ value: item.demandId, label: `${item.demandId} · ${item.plan.projectId}` }))}/>{dirty && <p>Salve ou descarte as alterações antes de escolher outro binding.</p>}</Card><DemandForm key={binding.demandId} {...{ client, snapshot, refresh, onFailure, binding }} onDirty={value => { setDirty(value); onDirty(value) }}/></>}</div>
}
function DemandForm({ binding, client, snapshot, refresh, onFailure, onDirty }: { binding: Binding; client: PanelClient; snapshot: PanelSnapshot; refresh(): Promise<void>; onFailure(error: unknown): void; onDirty(value: boolean): void }) {
  const record = snapshot.demands.find(item => item.data.id === binding.demandId)
  const project = snapshot.projects.find(item => item.data.id === binding.plan.projectId)
  const [goal, setGoal] = useState(record?.data.goal ?? binding.plan.goal), [savedGoal, setSavedGoal] = useState(record?.data.goal ?? binding.plan.goal)
  const [projectName, setProjectName] = useState(project?.data.name ?? binding.plan.projectId)
  const initialRequirements = (): Requirements => binding.plan.tasks.map(task => {
    const person = snapshot.catalog.find(entry => entry.metadata.kind === 'professional' && entry.metadata.id === task.professionalId)?.metadata
    return { taskId: task.id, competencies: { professionIds: person?.kind === 'professional' ? [...person.professionIds] : [], stackIds: person?.kind === 'professional' ? [...person.stackIds] : [] } }
  })
  const [requirements, setRequirements] = useState<Requirements>(initialRequirements), [requirementsDirty, setRequirementsDirty] = useState(false)
  const [status, setStatus] = useState<PlanningState>(), [proposal, setProposal] = useState<Proposal>(), [reviewError, setReviewError] = useState('')
  const [competencyError, setCompetencyError] = useState('')
  const [validation, setValidation] = useState(''), [confirm, setConfirm] = useState<'plan' | 'approve' | 'run' | null>(null)
  const input = useRef<HTMLTextAreaElement>(null), action = useAction(onFailure)
  const dirty = goal !== savedGoal || requirementsDirty || !project && projectName !== binding.plan.projectId
  useEffect(() => { onDirty(dirty) }, [dirty])
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined
    async function read() {
      if (!record) { setStatus(undefined); setProposal(undefined); return }
      try {
        const state = PlanningStatusSchema.parse(await client.request('GET', `/api/v1/demands/${binding.demandId}/planning`, undefined, controller.signal))
        const value = state.status === 'proposed' || state.status === 'approved' ? ProposalResponseSchema.parse(await client.request('GET', `/api/v1/demands/${binding.demandId}/proposal`, undefined, controller.signal)) : undefined
        if (!controller.signal.aborted) { setStatus(state); setProposal(value); setReviewError(''); if (state.status === 'planning') timer = setTimeout(() => { void read() }, 1000) }
      } catch (failure) { if (!controller.signal.aborted) { setReviewError(errorMessage(failure)); onFailure(failure) } }
    }
    void read(); return () => { controller.abort(); clearTimeout(timer) }
  }, [binding.demandId, record?.version, snapshot.plans.length])
  const checkingPlanning = !!record && !status
  const frozen = !!status && status.status !== 'draft'
  const displayedRequirements = frozen ? proposal?.requirements : checkingPlanning ? undefined : requirements
  const projectMismatch = project && project.data.repositoryPath !== binding.repositoryPath || record && record.data.projectId !== binding.plan.projectId
  const blocked = action.busy || action.uncertain || !!projectMismatch || checkingPlanning
  function toggle(taskId: string, kind: 'professionIds' | 'stackIds', id: string, checked: boolean) {
    setCompetencyError('')
    setRequirements(old => old.map(item => item.taskId === taskId ? { ...item, competencies: { ...item.competencies, [kind]: checked ? [...item.competencies[kind], id] : item.competencies[kind].filter(value => value !== id) } } : item)); setRequirementsDirty(true)
  }
  async function save() {
    const demand = records.demands.shape.data.safeParse({ id: binding.demandId, projectId: binding.plan.projectId, goal: goal.trim() })
    if (!demand.success) { setValidation('Descreva um objetivo não vazio, com até 16.384 caracteres.'); input.current?.focus(); return }
    setValidation('')
    await action.run(async () => {
      if (!project) await client.request('POST', '/api/v1/projects', { id: binding.plan.projectId, name: projectName.trim() || binding.plan.projectId, repositoryPath: binding.repositoryPath })
      await client.request(record ? 'PATCH' : 'POST', record ? `/api/v1/demands/${binding.demandId}` : '/api/v1/demands', record ? { expectedVersion: record.version, data: demand.data } : demand.data)
      setSavedGoal(demand.data.goal); setGoal(demand.data.goal); await refresh()
    }, 'Demanda salva. Competências serão vinculadas ao solicitar o planejamento.')
  }
  function requestPlan() {
    if (!record || dirty && goal !== savedGoal) return
    const parsed = PlanRequestSchema.safeParse({ expectedVersion: record.version, teamId: binding.plan.teamId, requirements })
    if (!parsed.success) { setCompetencyError('Declare ao menos uma competência para cada slot, usando o catálogo.'); document.getElementById('competencies')?.focus(); return }
    setCompetencyError(''); setConfirm('plan')
  }
  async function confirmAction() {
    if (!record || !confirm) return
    const kind = confirm
    const success = await action.run(async () => {
      if (kind === 'plan') { await client.request('POST', `/api/v1/demands/${binding.demandId}/plan`, { expectedVersion: record.version, teamId: binding.plan.teamId, requirements }); setRequirementsDirty(false) }
      if (kind === 'approve' && proposal) await client.request('POST', `/api/v1/demands/${binding.demandId}/approve`, { expectedVersion: record.version, reviewedHash: proposal.hash })
      if (kind === 'run' && status?.status === 'approved') await client.request('POST', '/api/v1/runs', { id: `run-${crypto.randomUUID()}`, planId: status.planId })
      await refresh()
    }, kind === 'plan' ? 'Planejamento solicitado.' : kind === 'approve' ? 'Hash aprovado.' : 'Execução solicitada. Acompanhe em Execuções.')
    if (success) setConfirm(null)
  }
  return <><Card className="panel-card"><h2>Limites do binding confiável</h2><p>Estes valores são somente leitura. Alterações de repositório, projeto, equipe, branch, remote, checks ou escopo exigem nova revisão e aprovação pela CLI.</p><dl className="panel-binding"><dt>Demanda / projeto</dt><dd>{binding.demandId} / {binding.plan.projectId}</dd><dt>Repositório</dt><dd><code>{binding.repositoryPath}</code></dd><dt>Equipe</dt><dd>{binding.plan.teamId}</dd><dt>Branch</dt><dd>{binding.plan.branch}</dd><dt>Remote</dt><dd>{binding.plan.remote}</dd><dt>SHA base</dt><dd><code>{binding.plan.baseSha}</code></dd><dt>Hash da política inicial</dt><dd><code>{binding.plan.policyHash}</code></dd></dl>{binding.plan.tasks.map(task => <details key={task.id} open><summary><code>{task.id}</code> · {task.professionalId}</summary><p>Escopo: {task.allowedPaths.join(', ')}</p><p>Dependências: {task.dependsOn.join(', ') || 'Nenhuma'}</p><h3>Checks</h3>{task.checks.map((check, index) => <pre key={index}>{JSON.stringify(check, null, 2)}</pre>)}</details>)}</Card>{projectMismatch && <Notice error>O projeto ou a demanda registrados divergem do binding confiável. Reconcilie essa identidade pela CLI antes de continuar.</Notice>}<Card className="panel-card"><h2>Demanda</h2><form noValidate onSubmit={e => { e.preventDefault(); if (!blocked && !frozen) void save() }} onKeyDown={e => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault() }}><fieldset disabled={blocked || frozen}><div className="form-field"><label htmlFor="project-name">Nome do projeto</label><input id="project-name" value={projectName} disabled={!!project} maxLength={16384} onChange={e => setProjectName(e.target.value)}/></div><div className="form-field"><label htmlFor="demand-goal">Objetivo da demanda</label><textarea className="resize-none" id="demand-goal" ref={input} value={goal} rows={5} maxLength={16384} aria-invalid={!!validation} aria-describedby={validation ? 'demand-validation' : 'demand-help'} onChange={e => { setGoal(e.target.value); setValidation('') }}/><p id="demand-help">O texto permanece neste formulário até salvar. A tentativa de planejamento torna a demanda imutável, inclusive quando há lacunas.</p></div>{validation && <p className="inline-error" id="demand-validation" role="alert">{validation}</p>}<fieldset id="competencies" tabIndex={-1} className="panel-competencies" aria-invalid={!!competencyError} aria-describedby={competencyError ? 'competency-error' : undefined}><legend>Competências exigidas por slot</legend><p>{frozen ? 'Requisitos persistidos no snapshot da proposta. A identidade profissional não é uma garantia de competência.' : 'Seleção local até solicitar o planejamento. A identidade profissional não é uma garantia de competência.'}</p>{!displayedRequirements && <p>{checkingPlanning ? 'Consultando o estado persistido da demanda…' : 'Os requisitos completos desta tentativa não estão disponíveis nesta API. Consulte as lacunas registradas abaixo; valores não serão reconstruídos a partir do catálogo.'}</p>}{competencyError && <p id="competency-error" className="inline-error" role="alert">{competencyError}</p>}{displayedRequirements?.map(item => <fieldset key={item.taskId}><legend>{item.taskId}</legend>{(['professionIds', 'stackIds'] as const).map(kind => <div key={kind}><h3>{kind === 'professionIds' ? 'Profissões' : 'Stacks'}</h3>{snapshot.catalog.filter(entry => entry.metadata.kind === (kind === 'professionIds' ? 'profession' : 'stack')).map(({ metadata }) => <label className="check-row" key={metadata.id}><input type="checkbox" checked={item.competencies[kind].includes(metadata.id)} onChange={e => toggle(item.taskId, kind, metadata.id, e.target.checked)}/><span>{metadata.name}</span></label>)}</div>)}</fieldset>)}</fieldset><div className="dialog-actions"><Button type="button" variant="outline" onClick={() => { setGoal(savedGoal); setRequirements(initialRequirements()); setRequirementsDirty(false); setProjectName(project?.data.name ?? binding.plan.projectId); setValidation(''); setCompetencyError('') }}>Descartar alterações</Button><Button type="submit" aria-busy={action.busy}>Salvar demanda</Button></div></fieldset></form>{checkingPlanning && <Notice>Consultando o estado persistido da demanda…</Notice>}{frozen && <Notice>Demanda imutável após iniciar o planejamento. Para alterar requisitos, crie outra demanda e binding pela CLI.</Notice>}{action.error && <Notice error>{action.error}</Notice>}{action.message && <Notice>{action.message}</Notice>}<Button disabled={blocked || frozen || !record || goal !== savedGoal || !!reviewError} onClick={requestPlan}>Propor plano</Button>{!record && <p>Salve a demanda para habilitar o planejamento.</p>}</Card>{reviewError && <Notice error>{reviewError}</Notice>}<PlanReview proposal={proposal} status={status} busy={blocked || !!reviewError} onApprove={() => setConfirm('approve')} onStart={() => setConfirm('run')}/><ConfirmAction open={confirm !== null} busy={action.busy} onClose={() => setConfirm(null)} onConfirm={() => { void confirmAction() }} title={confirm === 'plan' ? 'Propor plano para esta demanda' : confirm === 'approve' ? 'Aprovar o snapshot revisado' : 'Iniciar a execução aprovada'} action={confirm === 'plan' ? 'Propor plano' : confirm === 'approve' ? 'Aprovar este hash' : 'Iniciar execução'} description={confirm === 'plan' ? 'O runtime abrirá sessões de planejamento nos limites do binding confiável. Esta demanda e seus requisitos ficarão imutáveis.' : confirm === 'approve' ? 'A aprovação autoriza somente a proposta exibida, com este hash exato.' : 'O runtime poderá escrever, testar e entregar por Git dentro do plano aprovado. As aprovações nativas continuam obrigatórias.'}>{confirm === 'approve' && <code className="panel-hash">{proposal?.hash}</code>}{action.error && <Notice error>{action.error}</Notice>}</ConfirmAction></>
}
