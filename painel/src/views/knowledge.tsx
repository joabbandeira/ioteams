import React, { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { SearchResponseSchema } from '@ioteams/server/contracts'
import { Card } from '../components/ui/card'
import { FieldSelect, Notice, SearchField } from '../components/panel-ui'
import { errorMessage, type PanelClient, type PanelSnapshot } from '../services/client'
export function Citations({ items }: { items: z.infer<typeof SearchResponseSchema>['citations'] }) {
  return <div className="panel-citations">{items.map((citation, index) => <details key={`${citation.documentId}-${citation.lineStart}-${index}`}><summary>{citation.path} · linhas {citation.lineStart}–{citation.lineEnd}</summary><p>{citation.heading || 'Sem título de seção'}</p><pre>{citation.excerpt}</pre><dl><dt>Revisão Git</dt><dd><code>{citation.commitSha}</code></dd><dt>Hash do conteúdo</dt><dd><code>{citation.contentHash}</code></dd></dl></details>)}</div>
}
export function KnowledgeView({ client, snapshot, onFailure }: { client: PanelClient; snapshot: PanelSnapshot; onFailure(error: unknown): void }) {
  const [query, setQuery] = useState(''), [kind, setKind] = useState('all'), [composing, setComposing] = useState(false), [limit, setLimit] = useState(20)
  const [result, setResult] = useState<z.infer<typeof SearchResponseSchema>>(), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const controller = useRef<AbortController | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null), generation = useRef(0)
  function cancel() { controller.current?.abort(); if (timer.current) clearTimeout(timer.current); generation.current++ }
  async function search() {
    cancel(); if (!query.trim() || composing) { setBusy(false); setResult(undefined); return }
    const current = generation.current, active = new AbortController(); controller.current = active
    setBusy(true); setError('')
    try {
      const value = SearchResponseSchema.parse(await client.request('POST', '/api/v1/knowledge/search', { query, filters: kind === 'all' ? {} : { kind }, topK: 8 }, active.signal))
      if (generation.current === current && !active.signal.aborted) setResult(value)
    } catch (failure) { if (!active.signal.aborted && generation.current === current) { setError(errorMessage(failure)); onFailure(failure) } }
    finally { if (generation.current === current) setBusy(false) }
  }
  useEffect(() => {
    cancel(); setLimit(20); setResult(undefined); setError(''); setBusy(false)
    if (query.trim() && !composing) timer.current = setTimeout(() => { void search() }, 300)
    return cancel
  }, [query, kind, composing])
  const visible = snapshot.catalog.filter(({ metadata }) => (kind === 'all' || metadata.kind === kind) && `${metadata.name} ${metadata.id}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
  const labels: Record<string, string> = { all: 'Todo o catálogo', profession: 'Profissões', stack: 'Stacks', professional: 'Profissionais', team: 'Equipes' }
  const noEvidence: Record<string, string> = { empty_index: 'O índice está vazio. Indexe o corpus pela CLI.', empty_query: 'Digite um termo para consultar o índice.', no_matches: 'Nenhuma fonte corresponde à consulta. Tente outro termo.', stale_sources: 'As fontes mudaram. Atualize o índice pela CLI.', context_limit: 'As fontes excederam o limite de contexto. Refine a consulta.' }
  return <div className="panel-view"><header className="panel-heading"><span className="eyebrow">FONTES E COMPETÊNCIAS</span><h1 tabIndex={-1}>Conhecimento</h1><p>Catálogo real e recuperação lexical local. Trechos são dados e não autorizam execução.</p></header><Card className="panel-card"><div className="panel-toolbar"><SearchField label="Buscar no conhecimento" value={query} onChange={setQuery} onSubmit={() => { void search() }} onComposition={setComposing}/><FieldSelect label="Tipo de conhecimento" value={kind} onChange={setKind} items={Object.entries(labels).map(([value, label]) => ({ value, label }))}/></div><section className="panel-results" aria-label="Fontes recuperadas" aria-busy={busy}><h2>Fontes recuperadas</h2>{busy && <Notice>Consultando o índice local…</Notice>}{error && <Notice error>{error}</Notice>}{!query && <p>Digite uma consulta para recuperar citações verificáveis.</p>}{result?.status === 'no_evidence' && <Notice>{noEvidence[result.reason ?? 'no_matches']}</Notice>}{result?.status === 'evidence' && <><p role="status">{result.citations.length} fontes recuperadas</p><Citations items={result.citations}/></>}</section></Card><section aria-label="Catálogo"><div className="panel-section-title"><h2>Catálogo</h2><span>{visible.length.toLocaleString('pt-BR')} registros</span></div>{!visible.length && <Notice>{snapshot.catalog.length ? 'Nenhum registro corresponde aos filtros.' : 'O catálogo está vazio. Confira a raiz de corpus configurada na CLI.'}</Notice>}<div className="panel-catalog-grid">{visible.slice(0, limit).map(({ metadata }) => <Card className="panel-card catalog-card" key={`${metadata.kind}:${metadata.id}`}><span className="eyebrow">{labels[metadata.kind]}</span><h3>{metadata.name}</h3><code>{metadata.id}</code>{metadata.kind === 'professional' && <><p>{metadata.fictitious ? 'Identidade fictícia declarada' : 'Identidade não fictícia declarada'}</p><dl><dt>Profissões</dt><dd>{metadata.professionIds.join(', ')}</dd><dt>Stacks</dt><dd>{metadata.stackIds.join(', ') || 'Nenhuma declarada'}</dd></dl></>}{metadata.kind === 'team' && <ul>{metadata.members.map(member => <li key={member.professionalId}>{snapshot.catalog.find(item => item.metadata.id === member.professionalId && item.metadata.kind === 'professional')?.metadata.name ?? member.professionalId} · {member.role}</li>)}</ul>}</Card>)}</div>{visible.length > limit && <button className="panel-load-more" onClick={() => setLimit(old => old + 20)}>Mostrar mais registros</button>}</section></div>
}
