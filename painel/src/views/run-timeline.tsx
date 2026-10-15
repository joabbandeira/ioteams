import React, { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { RunTimelineSchema } from '@ioteams/server/contracts'
import { Button } from '../components/ui/button'
import { Notice } from '../components/panel-ui'
import { errorMessage, PanelError, type PanelClient } from '../services/client'
import { Citations } from './knowledge'
import { Timestamp } from './task-timeline'
type Timeline = z.infer<typeof RunTimelineSchema>
const labels: Record<string, string> = { 'execution.status': 'Estado técnico', 'execution.attempt': 'Tentativa iniciada', 'execution.session': 'Sessão iniciada', 'execution.turn': 'Turno iniciado', 'execution.turn.result': 'Turno encerrado', 'execution.rejected': 'Rejeição técnica', 'execution.commit.intent': 'Commit solicitado', 'execution.commit.result': 'Commit registrado', 'execution.push.intent': 'Push solicitado', 'execution.push.result': 'Push confirmado' }
export function RunTimeline({ client, id, version, revision, onFailure }: { client: PanelClient; id: string; version: number; revision: object; onFailure(error: unknown): void }) {
  const [timeline, setTimeline] = useState<Timeline>(), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const active = useRef<AbortController | null>(null), loaded = useRef<Timeline | undefined>(undefined)
  async function load(after?: number) {
    active.current?.abort(); const controller = new AbortController(); active.current = controller; setBusy(true)
    const previous = loaded.current?.runId === id ? loaded.current : undefined
    const cursor = after ?? previous?.events.at(-1)?.sequence
    try {
      const data = RunTimelineSchema.parse(await client.request('GET', `/api/v1/runs/${id}/timeline${cursor ? `?after=${cursor}` : ''}`, undefined, controller.signal))
      if (data.runId !== id) throw new PanelError('INVALID_RESPONSE')
      if (!controller.signal.aborted) {
        const events = [...new Map([...(previous?.events ?? []), ...data.events].map(item => [item.sequence, item])).values()].sort((a, b) => a.sequence - b.sequence)
        loaded.current = { ...data, events }; setTimeline(loaded.current); setError('')
      }
    } catch (failure) { if (!controller.signal.aborted) { setError(errorMessage(failure)); onFailure(failure) } }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  useEffect(() => { if (loaded.current?.runId !== id) { loaded.current = undefined; setTimeline(undefined) }; void load(); return () => active.current?.abort() }, [id, version, revision])
  return <section aria-label={`Timeline de ${id}`} aria-busy={busy}><h3>Timeline da execução</h3>{error && <Notice error>{error}</Notice>}{busy && <Notice>Consultando registros da execução…</Notice>}{timeline && <><p>Sequência persistida, horários em UTC. Intenções de commit e push não são confirmações.</p>{!timeline.events.length && <p>Nenhum evento de execução disponível.</p>}<ol className="panel-timeline">{timeline.events.map(item => <li key={item.sequence}><Timestamp value={item.at}/><h4>{labels[item.type]}</h4><dl>{Object.entries(item.data).map(([key, value]) => <React.Fragment key={key}><dt>{({ taskId: 'Tarefa', attemptId: 'Tentativa', phase: 'Fase', threadId: 'Thread', turnId: 'Turno', status: 'Estado técnico', reason: 'Motivo', attempt: 'Número da tentativa', baseSha: 'SHA base', sha: 'SHA', treeHash: 'Árvore', parentSha: 'SHA anterior' } as Record<string, string>)[key]}</dt><dd><code>{String(value)}</code></dd></React.Fragment>)}</dl></li>)}</ol>{timeline.nextCursor && <Button variant="outline" disabled={busy} onClick={() => { void load(timeline.nextCursor) }}>Mostrar mais eventos</Button>}<h3>Fontes do plano aprovado</h3><p>Estas fontes informaram o planejamento; os checks e a revisão da tentativa comprovam a entrega.</p>{timeline.plannedSources.length ? <Citations items={timeline.plannedSources}/> : <p>Fontes do plano indisponíveis nesta execução.</p>}</>}{error && <Button variant="outline" disabled={busy} onClick={() => { void load() }}>Atualizar timeline</Button>}</section>
}
