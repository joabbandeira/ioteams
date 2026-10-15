import React, { useState } from 'react'
import { TaskStatusSchema } from '@ioteams/core'
import { Button } from '../components/ui/button'
import { TaskTimeline } from './task-timeline'
import { Card } from '../components/ui/card'
import { Notice, FieldSelect } from '../components/panel-ui'
import type { PanelSnapshot } from '../services/client'
export function WorkView({ snapshot }: { snapshot: PanelSnapshot }) {
  const teams = snapshot.catalog.filter(entry => entry.metadata.kind === 'team')
  const [teamId, setTeamId] = useState(''), [taskId, setTaskId] = useState(''), [limit, setLimit] = useState(20)
  const selectedTask = snapshot.tasks.find(item => item.data.id === taskId)?.data
  const selected = teams.find(entry => entry.metadata.id === (teamId || teams[0]?.metadata.id))?.metadata
  const members = selected?.kind === 'team' ? selected.members : []
  return <div className="panel-view"><header className="panel-heading"><span className="eyebrow">PESSOAS · CADÊNCIA · ENTREGA</span><h1 tabIndex={-1}>Trabalho</h1><p>Do objetivo à entrega, com responsabilidades e evidências visíveis.</p></header><div className="panel-work-grid"><Card className="panel-card"><div className="panel-section-title"><h2>Pessoas</h2><FieldSelect label="Equipe do catálogo" value={teamId || teams[0]?.metadata.id || ''} onChange={setTeamId} items={teams.map(({ metadata }) => ({ value: metadata.id, label: metadata.name }))} disabled={!teams.length}/></div>{!members.length && <Notice>Nenhuma equipe cadastrada no corpus.</Notice>}<ul className="panel-people">{members.map(member => {
    const person = snapshot.catalog.find(entry => entry.metadata.kind === 'professional' && entry.metadata.id === member.professionalId)?.metadata
    return <li key={member.professionalId}><span className="avatar violet" aria-hidden="true">{(person?.name ?? member.professionalId).split(' ').map(word => word[0]).slice(0, 2).join('')}</span><div><strong>{person?.name ?? member.professionalId}</strong><p>{member.role}</p>{person?.kind === 'professional' && <small>{person.fictitious ? 'Identidade fictícia · ' : ''}Profissões: {person.professionIds.join(', ')} · Stacks: {person.stackIds.join(', ') || 'Nenhuma'}</small>}</div></li>
  })}</ul></Card><Card className="panel-card"><h2>Cadência</h2>{snapshot.sprints.length ? snapshot.sprints.map(({ data }) => <section key={data.id}><h3>{data.id}</h3><p><strong>Sprint Goal:</strong> {data.goal.objective}</p><p><strong>Definition of Done:</strong> {data.definitionOfDone.criteria.join('; ')}</p><p>{data.backlog?.tasks.length ?? 0} tarefas no Sprint Backlog</p></section>) : <p>Nenhuma sprint registrada.</p>}<p className="panel-muted">Os registros completos de Planning, Daily, Review e Retrospective ainda não são expostos pela API. Eventos de atualização da conexão não substituem esses registros.</p></Card></div><Card className="panel-card"><h2>Entrega</h2><p>Estados registrados pelo serviço. A validação e a entrega pertencem à execução; o painel não avança tarefas manualmente.</p>{!snapshot.tasks.length && <Notice>Nenhuma tarefa operacional registrada. Configure uma demanda e revise sua proposta.</Notice>}<p id="board-help">Use Tab para alcançar o quadro e as tarefas; as setas percorrem a área horizontal. Inspecionar tarefa abre o histórico abaixo.</p><div className="panel-board" role="region" tabIndex={0} aria-label="Quadro de tarefas operacionais" aria-describedby="board-help">{TaskStatusSchema.options.map(status => {
    const tasks = snapshot.tasks.filter(task => task.data.state.status === status)
    return <section key={status} aria-label={status}><h3>{status.replaceAll('_', ' ')} · {tasks.length}</h3>{!tasks.length && <p className="panel-muted">Sem tarefas</p>}{tasks.slice(0, limit).map(({ data }) => {
      const person = snapshot.catalog.find(entry => entry.metadata.kind === 'professional' && entry.metadata.id === data.state.plan.professionalId)?.metadata
      const run = snapshot.runs.find(item => item.data.planId === data.planId)?.data
      return <article key={data.id}><code>{data.id}</code><h4>{data.state.plan.title}</h4><p>Responsável: {person?.name ?? data.state.plan.professionalId}</p>{run && <p>Execução: {run.status}</p>}{data.state.reason && <p>{data.state.status === 'DONE' ? 'Rejeição anterior: ' : 'Último motivo registrado: '}{data.state.reason}</p>}<p>{data.state.attempts.length} / 3 tentativas</p><Button variant="outline" aria-pressed={taskId === data.id} onClick={() => { setTaskId(data.id); requestAnimationFrame(() => document.getElementById('task-inspection')?.focus()) }}>Inspecionar {data.id}</Button></article>
    })}{tasks.length > limit && <Button variant="outline" onClick={() => setLimit(old => old + 20)}>Mostrar mais em {status}</Button>}</section>
  })}</div></Card>{selectedTask && <Card className="panel-card" id="task-inspection" tabIndex={-1}><TaskTimeline task={selectedTask} evidence={snapshot.evidence}/></Card>}</div>
}
