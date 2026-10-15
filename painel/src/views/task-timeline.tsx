import React, { useState } from 'react'
import { Button } from '../components/ui/button'
import type { PanelSnapshot } from '../services/client'

export function Timestamp({ value }: { value: string }) {
  return <time dateTime={value}>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))} UTC</time>
}
export function TaskTimeline({ task, evidence }: { task: PanelSnapshot['tasks'][number]['data']; evidence: PanelSnapshot['evidence'] }) {
  const [limit, setLimit] = useState(20)
  const state = task.state, completion = state.completion?.mode === 'operational' ? state.completion : undefined
  const proofs = evidence.map(item => item.data.evidence).filter(item => item.taskId === task.id).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
  return <div className="panel-task-timeline"><h3>Histórico de {task.id}</h3><p>Estado da tarefa: <strong>{state.status}</strong> · Responsável: {state.plan.professionalId}</p>
    {state.reason && <p>Motivo registrado: {state.reason}</p>}
    <details open><summary>Aceitação e Definition of Done</summary><h4>Aceitação da tarefa</h4><ul>{state.plan.acceptanceCriteria.map(text => <li key={text}>{text}</li>)}</ul><h4>Definition of Done</h4><ul>{state.definitionOfDone.map(text => <li key={text}>{text}</li>)}</ul><p>Escopo: {state.plan.allowedPaths.join(', ')}</p><p>Dependências: {state.plan.dependsOn.join(', ') || 'Nenhuma'}</p></details>
    <h4>Tentativas e evidências do host</h4>{!state.attempts.length && <p>Nenhuma tentativa iniciada.</p>}
    {state.attempts.map(attempt => <details key={attempt.id} open><summary>Tentativa {attempt.attempt} · {attempt.status}</summary><p><Timestamp value={attempt.startedAt}/> · {attempt.professionalId}</p><p>ID: <code>{attempt.id}</code></p><p>SHA base: <code>{attempt.baseSha ?? 'Indisponível'}</code></p>{attempt.resultSha && <p>SHA resultante: <code>{attempt.resultSha}</code></p>}{attempt.reason && <p>Motivo: {attempt.reason}</p>}
      {attempt.id !== state.attempts.at(-1)?.id && <p>Evidências históricas desta tentativa não validam a tentativa atual.</p>}
      {proofs.filter(item => item.attemptId === attempt.id).slice(0, limit).map(item => <section className="panel-evidence" key={item.id}><h5>Check · saída {item.exitCode}</h5><pre>{JSON.stringify(item.command, null, 2)}</pre><p>Início: <Timestamp value={item.startedAt}/> · Fim: <Timestamp value={item.finishedAt}/></p><p>Hash da saída: <code>{item.contentHash}</code></p><p>Árvore testada: <code>{item.testedTreeHash ?? 'Indisponível'}</code></p>{item.commitSha && <p>Commit testado: <code>{item.commitSha}</code></p>}</section>)}
      {!proofs.some(item => item.attemptId === attempt.id) && <p>Nenhum check registrado nesta tentativa.</p>}
    </details>)}
    <h4>Transições registradas</h4>{state.history.length ? <ol className="panel-timeline">{state.history.slice(0, limit).map(item => <li key={item.id}><Timestamp value={item.at}/><p>{item.from} → {item.to}</p>{item.reason && <p>{item.reason}</p>}</li>)}</ol> : <p>Nenhuma transição registrada.</p>}
    {(state.history.length > limit || state.attempts.some(attempt => proofs.filter(item => item.attemptId === attempt.id).length > limit)) && <Button variant="outline" onClick={() => setLimit(old => old + 20)}>Mostrar mais histórico e evidências</Button>}
    <h4>Entrega Git</h4>{completion ? <><p>Revisão aprovada para tentativa <code>{completion.review.attemptId}</code> e árvore <code>{completion.review.testedTreeHash}</code>.</p><p>Commit: <code>{completion.commit.sha}</code></p>{completion.remote ? <p>Push confirmado: {completion.remote.name}/{completion.remote.branch} · SHA remoto exato: <code>{completion.remote.sha}</code></p> : <p>Confirmação de push indisponível.</p>}</> : <p>Entrega ainda sem conclusão comprovada. SHA e push só aparecem como confirmados após registro do serviço.</p>}
  </div>
}
