import React, { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCheck, ChevronRight, CircleHelp, Clock3, Flag, Layers3, ListChecks, LockKeyhole, MessageSquare, Moon, Plus, RotateCcw, Search, ShieldCheck, Sparkles, Sun, Target, Undo2, Users, Workflow, X, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldSelect } from './components/panel-ui'
import { actionLabels, ceremonies, checkLabels, initialProductGoal, initialSprintGoal, initialTasks, movedTask, people, stages, statuses, transitions, validateMove, type Person, type Status, type Task } from './model'

type Snapshot = { tasks:Task[]; productGoal:string; sprintGoal:string }
type Modal = {type:'task';id:string}|{type:'event';id:string}|{type:'person';id:string}|{type:'goal';kind:'product'|'sprint'}|{type:'new'}|{type:'help'}|null
const clone = <T,>(value:T):T => JSON.parse(JSON.stringify(value))
const eventIcons:LucideIcon[] = [ListChecks,MessageSquare,CheckCheck,Sparkles]
const roleText = {
  'Product Owner': {title:'Direção de produto',text:'Helena orienta o valor da entrega, comunica o Product Goal e ordena o Product Backlog. Pode delegar atividades, mantendo a responsabilidade pelo resultado.',note:'Prioridades e valor do produto',source:'https://www.scrum.org/resources/what-is-a-product-owner'},
  'Scrum Master': {title:'Eficácia da equipe',text:'Marcos apoia a aplicação do Scrum, a autogestão, a colaboração e a remoção de impedimentos. Garante que os eventos aconteçam e cumpram seu propósito.',note:'Facilitação e melhoria do trabalho',source:'https://www.scrum.org/resources/what-is-a-scrum-master'},
  'Developer': {title:'Produção do incremento',text:'Os Developers planejam e executam o trabalho necessário à entrega. Incluem desenvolvimento iOS, QA, dados e infraestrutura, conforme as competências exigidas pelo objetivo.',note:'Execução com qualidade e autogestão',source:'https://www.scrum.org/resources/blog/developers-accountability-scrum'},
}
function Avatar({person,small=false}:{person:Person;small?:boolean}) {return <span className={`avatar ${person.color} ${small?'avatar-small':''}`} aria-hidden="true">{person.initials}</span>}


export function DemoApp() {
  const [isDark,setIsDark]=useState(false)
  useEffect(()=>{document.documentElement.classList.toggle('dark',isDark)},[isDark])
  const [data,setData]=useState<Snapshot>(()=>({tasks:clone(initialTasks),productGoal:initialProductGoal,sprintGoal:initialSprintGoal}))
  const [undo,setUndo]=useState<Snapshot[]>([])
  const [modal,setModal]=useState<Modal>(null)
  const [query,setQuery]=useState('')
  const [stageFilter,setStageFilter]=useState('all')
  const [ownerFilter,setOwnerFilter]=useState('all')
  const [toast,setToast]=useState<{text:string;error?:boolean}|null>(null)
  const [error,setError]=useState('')
  const [pendingTarget,setPendingTarget]=useState<Status|null>(null)
  const [reason,setReason]=useState('')
  const [draft,setDraft]=useState({title:'',owner:'caio',stage:stages[1]})
  const [goalDraft,setGoalDraft]=useState('')
  const restoreFocus=useRef<HTMLElement|null>(null)
  const titleInput=useRef<HTMLInputElement>(null)
  const searchInput=useRef<HTMLInputElement>(null)
  const reasonInput=useRef<HTMLTextAreaElement>(null)
  const boardRef=useRef<HTMLDivElement>(null)
  const [boardScroll,setBoardScroll]=useState({left:0,max:1})
  const goalInput=useRef<HTMLTextAreaElement>(null)
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),6500);return()=>clearTimeout(timer)},[toast])
  useEffect(()=>{if(pendingTarget)reasonInput.current?.focus()},[pendingTarget])
  useEffect(()=>{const board=boardRef.current;if(!board)return;const update=()=>setBoardScroll({left:board.scrollLeft,max:board.scrollWidth-board.clientWidth});const observer=new ResizeObserver(update);observer.observe(board);update();return()=>observer.disconnect()},[])
  const commit=(next:Snapshot)=>{setUndo(old=>[...old.slice(-19),clone(data)]);setData(next)}
  const announce=(text:string,isError=false)=>setToast({text,error:isError})
  const open=(next:Modal)=>{if(!modal)restoreFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setError('');setPendingTarget(null);setReason('');if(next?.type==='new')setDraft({title:'',owner:'caio',stage:stages[1]});if(next?.type==='goal')setGoalDraft(next.kind==='product'?data.productGoal:data.sprintGoal);setModal(next)}
  const close=()=>{setModal(null);setError('');setPendingTarget(null)}
  const requestMove=(id:string,target:Status,providedReason?:string)=>{
    const task=data.tasks.find(t=>t.id===id);if(!task)return
    const problem=validateMove(task,target)
    if(problem){open({type:'task',id});setError(problem);announce(problem,true);return}
    if((target==='REJECTED'||target==='BLOCKED')&&!providedReason){open({type:'task',id});setPendingTarget(target);return}
    const next=movedTask(task,target,providedReason)
    commit({...data,tasks:data.tasks.map(t=>t.id===id?next:t)})
    setError('');setPendingTarget(null);setReason('');if(target==='TODO')boardRef.current?.scrollTo({left:0})
    announce(target==='TODO'&&task.status==='REJECTED'?`${id} voltou para TODO. Histórico preservado.`:`${id} · ${statuses.find(s=>s.id===target)!.subtitle}.`)
  }
  const selected=modal?.type==='task'?data.tasks.find(t=>t.id===modal.id):undefined
  const selectedEvent=modal?.type==='event'?ceremonies.find(e=>e.id===modal.id):undefined
  const selectedPerson=modal?.type==='person'?people.find(p=>p.id===modal.id):undefined
  const developers=people.filter(p=>p.role==='Developer')
  const visible=data.tasks.filter(t=>(stageFilter==='all'||t.stage===stageFilter)&&(ownerFilter==='all'||t.owner===ownerFilter)&&(`${t.id} ${t.title} ${people.find(p=>p.id===t.owner)?.name}`.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(query.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,''))))
  const done=data.tasks.filter(t=>t.status==='DONE').length
  const blocked=data.tasks.filter(t=>t.status==='BLOCKED').length
  const rejected=data.tasks.filter(t=>t.status==='REJECTED').length
  const active=data.tasks.filter(t=>t.status==='PROGRESS').length
  const filtered=!!query||stageFilter!=='all'||ownerFilter!=='all'
  const clearFilters=()=>{setQuery('');setStageFilter('all');setOwnerFilter('all');searchInput.current?.focus()}
  const progress=Math.round(done/data.tasks.length*100)
  let dialogTitle='Como explorar o painel'
  let dialogDescription='Uma simulação para conversar sobre pessoas, Scrum e entrega.'
  if(selected){dialogTitle=selected.title;dialogDescription=`${selected.id} · ${selected.stage}`}
  if(selectedEvent){dialogTitle=selectedEvent.name;dialogDescription=`${selectedEvent.when} · ${selectedEvent.duration}`}
  if(selectedPerson){dialogTitle=selectedPerson.name;dialogDescription=`${selectedPerson.role} · ${selectedPerson.specialty}`}
  if(modal?.type==='new'){dialogTitle='Nova tarefa';dialogDescription='Adicione trabalho fictício ao Sprint Backlog. A tarefa começa em TODO.'}
  if(modal?.type==='goal'){dialogTitle=modal.kind==='product'?'Ajustar Product Goal':'Ajustar Sprint Goal';dialogDescription=modal.kind==='product'?'O Product Owner responde pela comunicação do objetivo do produto.':'O Sprint Goal é definido pela equipe durante a Sprint Planning. Esta edição é apenas exploratória.'}

  return <>
    <a className="skip-link" href="#entrega">Ir para o quadro de tarefas</a>
    <header className="topbar">
      <a className="brand" href="#inicio" aria-label="Teams, início"><span className="brand-mark"><Workflow size={20}/></span><strong>teams<span className="brand-dot">.</span></strong><span className="brand-divider"/><span className="brand-label">Laboratório de trabalho</span></a>
      <div className="top-actions"><span className="prototype-tag"><span/>Protótipo interativo</span><Button className="theme-toggle" variant="ghost" size="sm" aria-label={isDark?'Ativar modo claro':'Ativar modo escuro'} aria-pressed={isDark} title={isDark?'Ativar modo claro':'Ativar modo escuro'} onClick={()=>setIsDark(value=>!value)}>{isDark?<Sun/>:<Moon/>}{isDark?'Modo claro':'Modo escuro'}</Button><Button variant="ghost" size="sm" onClick={()=>open({type:'help'})}><CircleHelp/>Como funciona</Button></div>
    </header>
    <main id="inicio">
      <section className="page-heading" aria-labelledby="page-title">
        <div><div className="eyebrow"><span className="tiny-logo"><Layers3 size={13}/></span>PROJETO TRILHA <ChevronRight size={13}/> APLICATIVO iOS</div><h1 id="page-title">Uma equipe. Uma direção.</h1><p>Pessoas, cadência e entrega conectadas no mesmo espaço.</p></div>
        <div className="demo-note"><span className="demo-dot"/><span><strong>Um cenário para experimentar</strong><br/>Dados fictícios · mudanças só nesta aba</span></div>
      </section>
      <div className="workspace">
        <section className="people-column" aria-labelledby="team-heading">
          <div className="section-label"><Users size={15}/>PESSOAS<span className="section-index">LISA</span></div>
          <Card className="team-panel">
            <div className="team-identity"><span className="team-emblem">L</span><div><h2 id="team-heading">Time LISA</h2><span>8 profissionais · uma equipe Scrum</span></div></div>
            <div className="team-divider"/>
            <div className="subsection-label">PRODUTO E FACILITAÇÃO</div>
            {people.filter(p=>p.role!=='Developer').map(p=><button className={`leader-card ${p.role==='Product Owner'?'product-leader':'scrum-leader'}`} key={p.id} onClick={()=>open({type:'person',id:p.id})}>
              <div className="person-heading"><Avatar person={p}/><div><strong>{p.name}</strong><span className={`role-label ${p.color}`}>{p.role}</span></div><ArrowUpRight size={14}/></div><p>{p.activity}</p>
            </button>)}
            <div className="developers-title"><div><strong>Developers</strong><span>Quem produz o incremento</span></div><Badge variant="secondary">6</Badge></div>
            <div className="developer-list">{developers.map(p=>{const running=data.tasks.filter(t=>t.owner===p.id&&t.status==='PROGRESS');const own=data.tasks.filter(t=>t.owner===p.id);return <button className={`developer-row ${ownerFilter===p.id?'person-filtered':''}`} key={p.id} onClick={()=>open({type:'person',id:p.id})}>
              <Avatar person={p}/><span className="developer-copy"><strong>{p.name}</strong><span>{p.specialty}</span></span><span className={`person-work ${running.length?'working':''}`}><span/>{running.length?`${running.length} em execução`:`${own.length} tarefa${own.length!==1?'s':''}`}</span>
            </button>})}</div>
            <div className="team-footnote"><ShieldCheck size={16}/><p>Especialidades diferentes.<br/><strong>Responsabilidade compartilhada pela entrega.</strong></p></div>
          </Card>
          <div className="role-legend"><span className="legend-line"/><p>Profissão é o campo de atuação.<br/>Papel Scrum é a responsabilidade na equipe.</p></div>
        </section>

        <section className="cadence-column" aria-labelledby="cadence-heading">
          <div className="section-label"><CalendarDays size={15}/>CADÊNCIA<span className="section-index">SPRINT 04</span></div>
          <Card className="cadence-panel">
            <div className="cadence-head"><span className="soft-icon violet"><CalendarDays size={18}/></span><div><h2 id="cadence-heading">O ritmo da entrega</h2><span>Inspecionar. Aprender. Adaptar.</span></div></div>
            <div className="sprint-window"><div><span>JANELA DA SPRINT</span><Badge className="active-badge">Ativa</Badge></div><strong>12 — 23 outubro</strong><p>2026 · dia 3 de 10 dias de trabalho</p><div className="days-track" aria-label="Terceiro de dez dias de trabalho">{Array.from({length:10},(_,i)=><span key={i} className={i<2?'past':i===2?'today':''}/>)}</div><div className="date-edges"><span>12 out</span><span>23 out</span></div></div>
            <div className="ceremony-timeline">{ceremonies.map((event,i)=>{const Icon=eventIcons[i];return <button key={event.id} className={`ceremony ${event.id==='daily'?'ceremony-current':''}`} onClick={()=>open({type:'event',id:event.id})} aria-label={`Abrir ${event.name}`}>
              <span className={`timeline-node ${i===0?'completed':''} ${i===1?'current':''}`}>{i===0?<Check size={12}/>:<span/>}</span><span className="ceremony-content"><span className="ceremony-top"><Icon size={16}/><strong>{event.name}</strong><ChevronRight size={14}/></span><span className="ceremony-time">{event.when}<span>{event.status}</span></span>{event.id==='daily'&&<span className="daily-explanation">Developers ajustam o plano em direção ao Sprint Goal.<span><Clock3 size={12}/>15 minutos · a cada dia de trabalho</span></span>}</span>
            </button>})}</div>
            <div className="cadence-note"><span className="soft-icon amber"><Sparkles size={16}/></span><p><strong>Uma Sprint contém os quatro eventos.</strong><br/>O trabalho pode ser adaptado ao longo dela, preservando seu objetivo.</p></div>
          </Card>
          <button className="framework-link" onClick={()=>open({type:'help'})}><CircleHelp size={15}/><span>Scrum e convenções deste exemplo</span><ArrowUpRight size={14}/></button>
        </section>

        <section className="delivery-column" id="entrega" aria-labelledby="delivery-heading">
          <div className="section-label"><Target size={15}/>DIREÇÃO E ENTREGA<span className="section-index">TRILHA</span></div>
          <div className="goals-grid">
            <Card className="goal-card product-goal"><div className="goal-label"><Flag size={15}/><h2>Product Goal</h2><span>PRODUCT OWNER</span><button className="mini-edit" aria-label="Ajustar Product Goal" onClick={()=>open({type:'goal',kind:'product'})}><ArrowUpRight size={15}/></button></div><p>{data.productGoal}</p><span className="goal-context">O destino que orienta o produto</span></Card>
            <Card className="goal-card sprint-goal"><div className="goal-label"><Target size={15}/><h2>Sprint Goal</h2><span>EQUIPE SCRUM</span><button className="mini-edit" aria-label="Ajustar Sprint Goal" onClick={()=>open({type:'goal',kind:'sprint'})}><ArrowUpRight size={15}/></button></div><p>{data.sprintGoal}</p><span className="goal-context">O objetivo compartilhado da Sprint 04</span></Card>
          </div>
          <Card className="board-panel">
            <div className="board-header"><div className="board-title"><span className="soft-icon violet"><Layers3 size={19}/></span><div><h2 id="delivery-heading">Sprint 04 <span>· Agenda que acompanha você</span></h2><p>Sprint Backlog · {data.tasks.length} tarefas em 3 etapas</p></div></div><Badge className="active-badge">Sprint ativa</Badge></div>
            <div className="sprint-progress"><div className="completion"><strong>{done}<span>/{data.tasks.length}</span></strong><span>tarefas concluídas</span></div><div className="completion-bar"><div role="progressbar" aria-label="Tarefas concluídas" aria-valuemin={0} aria-valuemax={data.tasks.length} aria-valuenow={done}><span style={{width:progress+'%'}}/></div><span>{progress}% da entrega planejada</span></div><div className="sprint-health"><span><i className="dot violet"/>{active} em execução</span><span className={blocked?'warning-text':''}><LockKeyhole size={12}/>{blocked} bloqueada{blocked!==1?'s':''}</span></div></div>
            <div className="board-controls"><div className="search-field"><Search size={15}/><input ref={searchInput} aria-label="Buscar tarefas" placeholder="Buscar tarefa ou pessoa..." value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="Limpar busca" onClick={()=>{setQuery('');searchInput.current?.focus()}}><X size={14}/></button>}</div><FieldSelect label="Filtrar por etapa" value={stageFilter} onChange={setStageFilter} items={[{value:'all',label:'Todas as etapas'},...stages.map(s=>({value:s,label:s}))]}/><Button size="sm" onClick={()=>open({type:'new'})}><Plus/>Nova tarefa</Button></div>
            <div className="board-subtoolbar"><div><span className="execution-label"><i className="dot violet"/>DEVELOPERS · EXECUÇÃO</span>{filtered&&<button className="clear-filters" onClick={clearFilters}>Limpar filtros <X size={11}/></button>}</div><div className="utility-actions"><Button size="icon-sm" variant="ghost" aria-label="Ver colunas anteriores" disabled={boardScroll.left<2} onClick={()=>boardRef.current?.scrollBy({left:-400})}><ArrowRight className="rotate-180"/></Button><Button size="icon-sm" variant="ghost" aria-label="Ver próximas colunas" disabled={boardScroll.left>=boardScroll.max-2} onClick={()=>boardRef.current?.scrollBy({left:400})}><ArrowRight/></Button><span>{visible.length} de {data.tasks.length}</span><Button size="icon-sm" variant="ghost" aria-label="Desfazer última alteração" title="Desfazer última alteração" disabled={!undo.length} onClick={()=>{const previous=undo[undo.length-1];setData(previous);setUndo(old=>old.slice(0,-1));setError('');announce('Última alteração desfeita.')}}><Undo2/></Button><Button size="icon-sm" variant="ghost" aria-label="Reiniciar demonstração" title="Reiniciar demonstração" onClick={()=>{commit({tasks:clone(initialTasks),productGoal:initialProductGoal,sprintGoal:initialSprintGoal});clearFilters();close();announce('Demonstração reiniciada. Você pode desfazer essa ação.')}}><RotateCcw/></Button></div></div>
            {ownerFilter!=='all'&&<div className="owner-filter">Tarefas de <strong>{people.find(p=>p.id===ownerFilter)?.name}</strong><button aria-label="Remover filtro de profissional" onClick={()=>setOwnerFilter('all')}><X size={13}/></button></div>}
            {!visible.length&&<div className="no-results"><Search size={22}/><strong>Nenhuma tarefa encontrada</strong><p>Tente outro termo ou remova os filtros.</p><Button variant="outline" size="sm" onClick={clearFilters}>Limpar filtros</Button></div>}
            <div ref={boardRef} onScroll={e=>setBoardScroll({left:e.currentTarget.scrollLeft,max:e.currentTarget.scrollWidth-e.currentTarget.clientWidth})} className="kanban-scroll" role="region" aria-label="Quadro Kanban da Sprint 04" tabIndex={0}>
              <div className="kanban-board">{statuses.map(status=>{const tasks=visible.filter(t=>t.status===status.id);return <section key={status.id} className={`kanban-lane lane-${status.id.toLowerCase()}`} aria-label={`${status.label}: ${tasks.length} tarefa${tasks.length!==1?'s':''}`} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move';e.currentTarget.classList.add('drag-over')}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))e.currentTarget.classList.remove('drag-over')}} onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain');if(data.tasks.some(t=>t.id===id))requestMove(id,status.id)}}>
                <div className="lane-header"><div><i className={`dot ${status.color}`}/><h3>{status.label}</h3><span>{tasks.length}</span></div><p>{status.subtitle}</p></div>
                <div className="lane-cards">{tasks.map(task=>{const person=people.find(p=>p.id===task.owner)!;return <article draggable key={task.id} onDragStart={e=>{e.dataTransfer.setData('text/plain',task.id);e.dataTransfer.effectAllowed='move'}} className={`task-card task-${task.status.toLowerCase()}`} data-task-id={task.id}>
                  <button className="task-open" onClick={()=>open({type:'task',id:task.id})} aria-label={`Abrir ${task.id}: ${task.title}`}><span className="task-meta"><span>{task.id}</span>{task.status==='DONE'?<CheckCheck size={14}/>:task.status==='BLOCKED'?<LockKeyhole size={13}/>:<ArrowUpRight size={12}/>}</span><strong>{task.title}</strong><span className="stage-tag">{task.stage}</span>{task.status==='BLOCKED'&&<span className="task-note blocked-note">Aguardando liberação de acesso</span>}{task.status==='REJECTED'&&<span className="task-note rejected-note">Validação falhou · replanejar</span>}<span className="task-footer"><span><Avatar person={person} small/><span>{person.name.split(' ')[0]}</span></span><span className="points">{task.points} pts</span></span></button>
                  {task.status==='REJECTED'&&<button className="replan-button" onClick={()=>requestMove(task.id,'TODO')} aria-label={`Replanejar ${task.id}`}><RotateCcw size={12}/>Replanejar<ArrowRight size={12}/></button>}
                </article>})}{!tasks.length&&<div className="empty-lane"><span/>Sem tarefas</div>}</div>
              </section>})}</div>
            </div>
            <div className="board-footer"><span><ArrowRight size={13}/>Arraste um cartão ou abra a tarefa para avançar.</span><span><ShieldCheck size={13}/>DONE exige critérios de pronto</span></div>
          </Card>
          <div className="feedback-strip"><span className={`feedback-symbol ${rejected?'rose':'teal'}`}><RotateCcw size={17}/></span><div><strong>Aprendizado também faz parte do fluxo.</strong><p>{rejected?`${rejected} tarefa${rejected!==1?'s':''} em REJECTED pode${rejected!==1?'m':''} voltar para TODO com o mesmo identificador e histórico.`:'Reprovações retornam ao planejamento com o histórico preservado.'}</p></div><button onClick={()=>{setStageFilter('all');setOwnerFilter('all');setQuery('');const task=data.tasks.find(t=>t.status==='REJECTED');open(task?{type:'task',id:task.id}:{type:'help'})}}>Explorar<ArrowUpRight size={14}/></button></div>
        </section>
      </div>
      <footer className="page-footer"><span><span className="footer-dot"/>LISA · cenário fictício para discussão</span><span>Scrum + fluxo visual próprio · shadcn/ui</span><span>Sem armazenamento de dados desta simulação</span></footer>
    </main>

    <Dialog open={modal!==null} onOpenChange={value=>{if(!value)close()}}>
      <DialogContent className="app-dialog" onCloseAutoFocus={event=>{event.preventDefault();restoreFocus.current?.focus()}}>
        <DialogHeader><DialogTitle>{dialogTitle}</DialogTitle><DialogDescription>{dialogDescription}</DialogDescription></DialogHeader>
        {selected&&<div className="task-details">
          <div className="detail-meta"><Badge variant="secondary">{statuses.find(s=>s.id===selected.status)!.label}</Badge><span><Avatar person={people.find(p=>p.id===selected.owner)!} small/>{people.find(p=>p.id===selected.owner)!.name}</span><span>{selected.points} pontos</span></div><p className="detail-description">{selected.description}</p>
          {selected.reason&&<div className={`inline-note ${selected.reasonKind==='block'?'amber':'rose'}`}><strong>{selected.reasonKind==='block'?(selected.status==='BLOCKED'?'Impedimento registrado':'Último impedimento resolvido'):'Última reprovação registrada'}</strong><p>{selected.reason}</p></div>}
          <div className="definition-done"><h3><ShieldCheck size={16}/>Critérios de pronto deste exemplo</h3><p>Todos precisam estar atendidos para concluir a tarefa.</p>{checkLabels.map((label,index)=><label key={label} className="check-row"><input type="checkbox" checked={selected.checks[index]} disabled={selected.status==='DONE'} onChange={e=>{const checks=[...selected.checks];checks[index]=e.target.checked;commit({...data,tasks:data.tasks.map(t=>t.id===selected.id?{...t,checks}:t)});setError('')}}/><span>{label}</span></label>)}</div>
          {error&&<p className="inline-error" role="alert">{error}</p>}
          {pendingTarget?<form noValidate onSubmit={event=>{event.preventDefault();if(reason.trim().length<8){setError('Descreva o motivo com pelo menos 8 caracteres.');reasonInput.current?.focus();return}requestMove(selected.id,pendingTarget,reason.trim())}} className="reason-form"><label htmlFor="reason">{pendingTarget==='BLOCKED'?'Qual é o impedimento?':'O que falhou na validação?'}</label><textarea className="resize-none" id="reason" ref={reasonInput} value={reason} onChange={e=>setReason(e.target.value)} rows={3} maxLength={400} aria-invalid={!!error} aria-describedby={error?'reason-error':undefined}/>{error&&<span id="reason-error" className="inline-error">{error}</span>}<div className="dialog-actions"><Button variant="outline" type="button" onClick={()=>{setPendingTarget(null);setError('')}}>Cancelar</Button><Button type="submit">{pendingTarget==='BLOCKED'?'Registrar bloqueio':'Registrar reprovação'}</Button></div></form>:<div className="task-actions">{transitions[selected.status].map(target=><Button key={target} variant={target==='REJECTED'||target==='BLOCKED'?'outline':'default'} onClick={()=>requestMove(selected.id,target)}>{target==='TODO'?<RotateCcw/>:target==='DONE'?<CheckCheck/>:<ArrowRight/>}{actionLabels[target]}</Button>)}{selected.status==='DONE'&&<span className="done-message"><CheckCheck size={16}/>Entrega concluída com os critérios atendidos.</span>}</div>}
          <details className="history-details"><summary>Histórico da tarefa <span>{selected.history.length}</span></summary><ol>{selected.history.map((item,i)=><li key={i}>{item}</li>)}</ol></details>
        </div>}
        {modal?.type==='new'&&<form noValidate className="new-task-form" onSubmit={event=>{event.preventDefault();if(draft.title.trim().length<5){setError('Descreva a tarefa com pelo menos 5 caracteres.');titleInput.current?.focus();return}const max=Math.max(...data.tasks.map(t=>Number(t.id.split('-')[1])));const id=`LISA-${max+1}`;const task:Task={id,title:draft.title.trim(),owner:draft.owner,stage:draft.stage,status:'TODO',points:3,description:'Tarefa criada durante a exploração do protótipo. Detalhar os critérios de aceitação durante o planejamento.',reason:'',reasonKind:'',checks:[false,false,false],history:['Criada em TODO durante a demonstração.']};commit({...data,tasks:[...data.tasks,task]});clearFilters();boardRef.current?.scrollTo({left:0});close();announce(`${id} criada em TODO.`)}}>
          <div className="form-field"><label htmlFor="task-title">O que precisa ser feito?</label><input id="task-title" ref={titleInput} value={draft.title} maxLength={100} placeholder="Ex.: Validar lembrete com o app fechado" onChange={e=>{setDraft({...draft,title:e.target.value});setError('')}} aria-invalid={!!error} aria-describedby={error?'title-error':undefined}/>{error&&<p id="title-error" className="inline-error" role="alert">{error}</p>}</div>
          <div className="form-field"><label htmlFor="task-owner">Profissional responsável · Developer</label><FieldSelect id="task-owner" label="Profissional responsável" value={draft.owner} onChange={owner=>setDraft({...draft,owner})} items={developers.map(p=>({value:p.id,label:`${p.name} · ${p.specialty}`}))}/></div>
          <div className="form-field"><label htmlFor="task-stage">Etapa do projeto</label><FieldSelect id="task-stage" label="Etapa do projeto" value={draft.stage} onChange={stage=>setDraft({...draft,stage})} items={stages.map(s=>({value:s,label:s}))}/></div><p className="form-note">Estimativa ilustrativa: 3 pontos. O novo trabalho deve ser discutido pela equipe sem comprometer o Sprint Goal.</p><div className="dialog-actions"><Button variant="outline" type="button" onClick={close}>Cancelar</Button><Button type="submit"><Plus/>Criar tarefa</Button></div>
        </form>}
        {selectedEvent&&<div className="event-details"><Badge variant="secondary">{selectedEvent.status}</Badge><div className="detail-section"><h3>Propósito</h3><p>{selectedEvent.purpose}</p></div><div className="detail-section"><h3>Quem participa</h3><p>{selectedEvent.participants}</p></div><div className="detail-section"><h3>O que resulta dessa conversa</h3><p>{selectedEvent.output}</p></div><div className="inline-note violet"><p>{selectedEvent.note}</p></div><a className="source-link" href={selectedEvent.source} target="_blank" rel="noreferrer">Consultar o Scrum Guide<ArrowUpRight size={13}/></a></div>}
        {selectedPerson&&<div className="person-details"><div className="person-profile"><Avatar person={selectedPerson}/><div><strong>{roleText[selectedPerson.role].title}</strong><span>{roleText[selectedPerson.role].note}</span></div></div><p>{roleText[selectedPerson.role].text}</p><div className="inline-note violet"><strong>Relação entre os conceitos</strong><p>{selectedPerson.name.split(' ')[0]} é o profissional. {selectedPerson.specialty} descreve sua atuação. {selectedPerson.role} é sua responsabilidade nesta equipe Scrum.</p></div>{selectedPerson.role==='Developer'&&<Button onClick={()=>{setOwnerFilter(selectedPerson.id);setQuery('');setStageFilter('all');close();announce(`Exibindo tarefas de ${selectedPerson.name}.`)}}>Ver tarefas deste profissional<ArrowRight/></Button>}<a className="source-link" href={roleText[selectedPerson.role].source} target="_blank" rel="noreferrer">Conhecer essa responsabilidade no Scrum<ArrowUpRight size={13}/></a></div>}
        {modal?.type==='goal'&&<form noValidate className="goal-form" onSubmit={event=>{event.preventDefault();if(goalDraft.trim().length<15){setError('Descreva o objetivo com pelo menos 15 caracteres.');goalInput.current?.focus();return}commit({...data,...(modal.kind==='product'?{productGoal:goalDraft.trim()}:{sprintGoal:goalDraft.trim()})});close();announce('Objetivo atualizado nesta demonstração.')}}><label htmlFor="goal-text">Objetivo</label><textarea className="resize-none" id="goal-text" ref={goalInput} rows={4} value={goalDraft} maxLength={300} onChange={e=>{setGoalDraft(e.target.value);setError('')}} aria-invalid={!!error} aria-describedby={error?'goal-error':undefined}/>{error&&<p id="goal-error" className="inline-error" role="alert">{error}</p>}<div className="dialog-actions"><Button variant="outline" type="button" onClick={close}>Cancelar</Button><Button type="submit">Atualizar objetivo</Button></div></form>}
        {modal?.type==='help'&&<div className="help-content"><div className="help-intro"><span className="soft-icon violet"><Workflow size={22}/></span><p><strong>Três perspectivas do mesmo trabalho.</strong><br/>Explore quem atua, quando a equipe inspeciona o trabalho e como a entrega avança.</p></div><div className="help-grid"><div><h3>Pessoas</h3><p>Product Owner cuida do valor; Scrum Master favorece a eficácia; Developers produzem o incremento.</p></div><div><h3>Cadência</h3><p>Abra os quatro eventos para conhecer participantes, propósito e resultados esperados.</p></div><div><h3>Entrega</h3><p>Abra ou arraste tarefas. Para concluir, marque os critérios de pronto. Use Desfazer para experimentar.</p></div></div><div className="inline-note amber"><strong>Scrum e escolhas ilustrativas</strong><p>As sete colunas, as etapas, os pontos e o retorno de REJECTED para TODO são convenções desta demonstração. Não são regras obrigatórias do Scrum.</p><p>A Sprint é uma janela de inspeção e adaptação com um objetivo. O Sprint Backlog é um plano que pode evoluir. A Review não é uma autorização obrigatória para liberar uma entrega pronta.</p></div><div className="detail-section"><h3>Artefatos e compromissos</h3><ul><li>Product Backlog → Product Goal</li><li>Sprint Backlog → Sprint Goal</li><li>Incremento → Definition of Done</li></ul></div><p className="privacy-note">Todas as pessoas e tarefas são fictícias. Nenhum agente é executado. As alterações ficam apenas na memória temporária desta aba e são descartadas ao recarregar a página.</p><a className="source-link" href="https://scrumguides.org/scrum-guide.html" target="_blank" rel="noreferrer">Base conceitual: Scrum Guide 2020<ArrowUpRight size={13}/></a></div>}
      </DialogContent>
    </Dialog>
    <div className={`toast ${toast?'toast-visible':''} ${toast?.error?'toast-error':''}`} role="status" aria-live="polite" aria-atomic="true">{toast&&<>{toast.error?<CircleHelp size={17}/>:<Check size={17}/>}<span>{toast.text}</span><button aria-label="Fechar aviso" onClick={()=>setToast(null)}><X size={14}/></button></>}</div>
  </>
}
