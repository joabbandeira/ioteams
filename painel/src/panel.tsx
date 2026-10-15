import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, LayoutDashboard, Moon, Play, RefreshCw, Settings2, Sun } from 'lucide-react'
import { Button } from './components/ui/button'
import { Card } from './components/ui/card'
import { ConfirmAction, Notice, OperationalAvailability, useAction } from './components/panel-ui'
import { createPanelClient, errorMessage, loadSnapshot, PanelError, type PanelSnapshot } from './services/client'
import { WorkView } from './views/work'
import { KnowledgeView } from './views/knowledge'
import { ConfigurationView } from './views/configuration'
import { ExecutionsView } from './views/executions'
const views = [
  { id: 'trabalho', name: 'Trabalho', icon: LayoutDashboard }, { id: 'conhecimento', name: 'Conhecimento', icon: BookOpen },
  { id: 'execucoes', name: 'Execuções', icon: Play }, { id: 'configuracao', name: 'Configuração', icon: Settings2 },
] as const
type View = typeof views[number]['id']
const currentView = () => location.hash.slice(1) || 'trabalho'
export function PanelApp() {
  const client = useMemo(() => createPanelClient(), [])
  const [view, setView] = useState(currentView), [ready, setReady] = useState(false), [checking, setChecking] = useState(true)
  const [snapshot, setSnapshot] = useState<PanelSnapshot>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [connected, setConnected] = useState(false), [fresh, setFresh] = useState(false), [connectionEpoch, setConnectionEpoch] = useState(0)
  const [isDark, setIsDark] = useState(false), [dirty, setDirty] = useState(false), [destination, setDestination] = useState<string | null>(null)
  const pendingFocus = useRef(false)
  const activeLoad = useRef<AbortController | null>(null), alive = useRef(true), viewRef = useRef(view), dirtyRef = useRef(dirty)
  viewRef.current = view; dirtyRef.current = dirty
  const onFailure = useCallback((failure: unknown) => { if (failure instanceof PanelError && failure.status === 401) setReady(false) }, [])
  const refresh = useCallback(async () => {
    activeLoad.current?.abort(); const controller = new AbortController(); activeLoad.current = controller; setBusy(true); setFresh(false)
    try { const data = await loadSnapshot(client, controller.signal); if (alive.current && !controller.signal.aborted) { setSnapshot(data); setError(''); setFresh(true) } }
    catch (failure) { if (alive.current && !controller.signal.aborted) { setError(errorMessage(failure)); onFailure(failure) } }
    finally { if (alive.current && !controller.signal.aborted) setBusy(false) }
  }, [client, onFailure])
  const reconnect = useCallback(async () => {
    try { await client.session(); if (alive.current) { setReady(true); setChecking(false); setConnectionEpoch(old => old + 1); await refresh() } }
    catch (failure) { if (alive.current) { setReady(false); setChecking(false); if (!(failure instanceof PanelError && failure.status === 401)) setError(errorMessage(failure)) } }
  }, [client, refresh])
  useEffect(() => { alive.current = true; void reconnect(); return () => { alive.current = false; activeLoad.current?.abort() } }, [reconnect])
  useEffect(() => { document.documentElement.classList.toggle('dark', isDark) }, [isDark])
  useEffect(() => { document.title = `${checking ? 'Conectando' : !ready ? 'Acesso local' : views.find(item => item.id === view)?.name ?? 'Página não encontrada'} · ioteams` }, [view, ready, checking])
  useEffect(() => {
    const change = () => {
      const next = currentView()
      if (dirtyRef.current && next !== viewRef.current) { history.replaceState(null, '', `#${viewRef.current}`); setDestination(next) }
      else { pendingFocus.current = next !== viewRef.current; setView(next) }
    }
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('hashchange', change); window.addEventListener('beforeunload', unload)
    return () => { window.removeEventListener('hashchange', change); window.removeEventListener('beforeunload', unload) }
  }, [])
  useEffect(() => {
    if (!ready) return
    const events = new EventSource('/api/v1/events')
    events.onopen = () => { setConnected(true); void refresh() }
    events.addEventListener('change', () => { void refresh() })
    events.onerror = () => { setConnected(false); setFresh(false); void client.session().catch(onFailure) }
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    const offline = () => { setConnected(false); setFresh(false) }
    const online = () => { void reconnect() }
    window.addEventListener('offline', offline); window.addEventListener('online', online)
    document.addEventListener('visibilitychange', visible)
    return () => { events.close(); window.removeEventListener('offline', offline); window.removeEventListener('online', online); document.removeEventListener('visibilitychange', visible); setConnected(false) }
  }, [ready, client, refresh, onFailure, reconnect, connectionEpoch])
  function navigate(next: string) {
    if (next === view) return
    if (dirty) { setDestination(next); return }
    pendingFocus.current = true; location.hash = next; setView(next)
  }
  useLayoutEffect(() => { if (pendingFocus.current) { pendingFocus.current = false; document.querySelector<HTMLElement>(`[data-view="${view}"] h1`)?.focus() } }, [view])
  const onUnlocked = async () => { setReady(true); await refresh() }
  const available = ready && connected && fresh && !error && !busy
  return <OperationalAvailability.Provider value={available}><a className="skip-link" href="#panel-main" onClick={e => { e.preventDefault(); document.getElementById('panel-main')?.focus() }}>Pular para o conteúdo</a><header className="topbar panel-topbar"><a className="panel-brand" href="#trabalho" onClick={e => { e.preventDefault(); navigate('trabalho') }}>io<span className="brand-dot">teams</span></a><span className="prototype-tag">Operacional local</span><div className="top-actions"><a href="/demo">Modo demo</a><Button variant="ghost" aria-label="Alternar tema" aria-pressed={isDark} onClick={() => setIsDark(old => !old)}>{isDark ? <Sun/> : <Moon/>}{isDark ? 'Tema claro' : 'Tema escuro'}</Button></div></header><div className="panel-shell"><aside className="panel-sidebar"><nav aria-label="Navegação principal">{views.map(item => <a key={item.id} href={`#${item.id}`} aria-current={view === item.id ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate(item.id) }}><item.icon size={18}/>{item.name}</a>)}</nav><p>Conhecimento informa.<br/>Aprovação autoriza.<br/>Evidências confirmam.</p></aside><main id="panel-main" tabIndex={-1} className="panel-main" aria-busy={busy || checking}>{checking && <Notice>Verificando a sessão local…</Notice>}{!checking && !ready && <AccessForm client={client} onUnlocked={onUnlocked}/>}<div className="panel-connection" role="status">{ready ? connected && fresh ? 'Conectado ao serviço local · atualizações ao vivo' : 'Reconectando atualizações · dados podem estar desatualizados' : 'Sessão operacional fechada'}<Button variant="outline" disabled={busy || checking} onClick={() => { void reconnect() }}><RefreshCw size={14}/>Reconectar</Button></div>{error && <Notice error>{error}</Notice>}{busy && !snapshot && <Notice>Carregando catálogo e trabalho…</Notice>}{snapshot && <fieldset className="panel-content" disabled={!available}><legend className="sr-only">Painel operacional</legend><section hidden={view !== 'trabalho'} data-view="trabalho"><WorkView snapshot={snapshot}/></section><section hidden={view !== 'conhecimento'} data-view="conhecimento"><KnowledgeView client={client} snapshot={snapshot} onFailure={onFailure}/></section><section hidden={view !== 'execucoes'} data-view="execucoes"><ExecutionsView {...{ client, snapshot, refresh, onFailure, available }}/></section><section hidden={view !== 'configuracao'} data-view="configuracao"><ConfigurationView {...{ client, snapshot, refresh, onFailure }} onDirty={setDirty}/></section></fieldset>}{!views.some(item => item.id === view) && <Card className="panel-card"><h1>Página não encontrada</h1><p>Escolha uma das vistas na navegação para continuar.</p><Button onClick={() => navigate('trabalho')}>Voltar ao trabalho</Button></Card>}<footer className="panel-footer">ioteams · local, usuário único · pt-BR · dados operacionais do serviço</footer></main></div><ConfirmAction open={!!destination} title="Sair com alterações locais?" description="Os campos serão preservados nesta aba. As competências ainda não enviadas permanecem locais; recarregar a página as descarta." action="Continuar navegação" busy={false} onClose={() => setDestination(null)} onConfirm={() => { const next = destination!; setDestination(null); history.pushState(null, '', `#${next}`); pendingFocus.current = true; setView(next) }}/></OperationalAvailability.Provider>
}
function AccessForm({ client, onUnlocked }: { client: ReturnType<typeof createPanelClient>; onUnlocked(): Promise<void> }) {
  const [secret, setSecret] = useState(''), [show, setShow] = useState(false), [validation, setValidation] = useState('')
  const input = useRef<HTMLInputElement>(null), action = useAction(() => {})
  return <Card className="panel-card panel-access"><h1>Acesso ao painel local</h1><p>Abra o arquivo privado <code>browser-access.html</code> no diretório do produto configurado no launcher. Copie o código e cole abaixo para abrir a sessão neste navegador.</p><p>O código tem uso único e expira em até dois minutos. Se expirou, encerre e reinicie o launcher de forma segura para gerar novo acesso.</p><form noValidate onSubmit={e => { e.preventDefault(); if (!secret.trim()) { setValidation('Cole o código de acesso privado.'); input.current?.focus(); return } void action.run(async () => { try { await client.unlock(secret.trim()); await onUnlocked() } finally { setSecret(''); setShow(false) } }, 'Sessão local aberta.') }} onKeyDown={e => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault() }}><div className="form-field"><label htmlFor="private-code">Código de acesso privado</label><input id="private-code" ref={input} type={show ? 'text' : 'password'} autoComplete="one-time-code" value={secret} maxLength={128} spellCheck={false} aria-invalid={!!validation} aria-describedby={validation ? 'code-error' : 'code-help'} onChange={e => { setSecret(e.target.value); setValidation('') }}/><Button type="button" variant="ghost" aria-pressed={show} onClick={() => setShow(old => !old)}>{show ? 'Ocultar código' : 'Mostrar código'}</Button><p id="code-help">O código não é salvo no navegador nem enviado na URL.</p>{validation && <p id="code-error" role="alert">{validation}</p>}</div>{action.error && <Notice error>{action.error}</Notice>}<Button type="submit" disabled={action.busy || action.uncertain} aria-busy={action.busy}>Abrir sessão local</Button></form></Card>
}
