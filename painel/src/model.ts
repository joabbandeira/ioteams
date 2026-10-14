export type Status = 'TODO' | 'PLANNING' | 'READY' | 'BLOCKED' | 'PROGRESS' | 'REJECTED' | 'DONE'
export type Person = { id: string; name: string; initials: string; specialty: string; role: 'Product Owner' | 'Scrum Master' | 'Developer'; color: string; activity: string }
export type Task = { id: string; title: string; owner: string; stage: string; status: Status; points: number; description: string; reason: string; reasonKind: 'block'|'rejection'|''; checks: boolean[]; history: string[] }

export const people: Person[] = [
  {id:'helena',name:'Helena Costa',initials:'HC',specialty:'Produto',role:'Product Owner',color:'violet',activity:'Valor e prioridades'},
  {id:'marcos',name:'Marcos Lima',initials:'ML',specialty:'Facilitação Scrum',role:'Scrum Master',color:'amber',activity:'Eficácia e impedimentos'},
  {id:'bia',name:'Bia Martins',initials:'BM',specialty:'App iOS',role:'Developer',color:'blue',activity:'Sincronização da agenda'},
  {id:'caio',name:'Caio Alves',initials:'CA',specialty:'App iOS',role:'Developer',color:'violet',activity:'Novo compromisso'},
  {id:'duda',name:'Duda Rocha',initials:'DR',specialty:'QA',role:'Developer',color:'rose',activity:'Qualidade funcional'},
  {id:'ravi',name:'Ravi Melo',initials:'RM',specialty:'QA',role:'Developer',color:'teal',activity:'Acessibilidade e testes'},
  {id:'nara',name:'Nara Dias',initials:'ND',specialty:'DBA',role:'Developer',color:'amber',activity:'Integridade dos dados'},
  {id:'ivo',name:'Ivo Santos',initials:'IS',specialty:'Infraestrutura',role:'Developer',color:'slate',activity:'Ambiente e entrega'},
]
export const statuses: {id:Status; label:string; subtitle:string; color:string}[] = [
  {id:'TODO',label:'TODO',subtitle:'A planejar',color:'slate'},
  {id:'PLANNING',label:'IN PLANNING',subtitle:'Em planejamento',color:'violet'},
  {id:'READY',label:'READY',subtitle:'Pronta para desenvolver',color:'blue'},
  {id:'BLOCKED',label:'BLOCKED',subtitle:'Bloqueada',color:'amber'},
  {id:'PROGRESS',label:'IN PROGRESS',subtitle:'Em desenvolvimento',color:'violet'},
  {id:'REJECTED',label:'REJECTED',subtitle:'Reprovada na validação',color:'rose'},
  {id:'DONE',label:'DONE',subtitle:'Concluída e entregue',color:'teal'},
]
export const stages = ['Fundação', 'Agenda e lembretes', 'Qualidade e entrega']
export const checkLabels = ['Critérios de aceitação atendidos', 'Testes e acessibilidade verificados', 'Integrada, utilizável e pronta para entrega']
export const transitions: Record<Status,Status[]> = {
  TODO:['PLANNING'], PLANNING:['READY','TODO'], READY:['PROGRESS','BLOCKED'], BLOCKED:['READY'],
  PROGRESS:['DONE','REJECTED'], REJECTED:['TODO'], DONE:[]
}
export const actionLabels: Partial<Record<Status,string>> = {
  TODO:'Replanejar',PLANNING:'Planejar',READY:'Marcar como pronta',PROGRESS:'Iniciar desenvolvimento',BLOCKED:'Registrar bloqueio',DONE:'Concluir e entregar',REJECTED:'Reprovar na validação'
}
const t = (id:string,title:string,owner:string,stage:string,status:Status,points:number,description:string,reason=''):Task => ({id,title,owner,stage,status,points,description,reason,reasonKind:status==='BLOCKED'?'block':status==='REJECTED'?'rejection':'',checks: status==='DONE'?[true,true,true]:[false,false,false],history:[status==='DONE'?'Entrega concluída com os critérios de pronto atendidos.':'Tarefa incluída no planejamento da Sprint 04.']})
export const initialTasks: Task[] = [
  t('LISA-101','Explorar lembretes recorrentes','duda',stages[1],'TODO',3,'Entender os cenários de repetição e definir critérios de aceitação com o Product Owner.'),
  t('LISA-102','Mapear estados vazios da agenda','duda',stages[1],'PLANNING',2,'Descrever o comportamento da agenda sem compromissos e os exemplos para validação.'),
  t('LISA-103','Validar acessibilidade com VoiceOver','ravi',stages[2],'READY',3,'Verificar leitura, ordem de foco e ações acessíveis no fluxo de criação.'),
  t('LISA-104','Cobrir criação e edição com testes','duda',stages[2],'READY',5,'Executar os cenários de criação, edição, cancelamento e retomada do aplicativo.'),
  t('LISA-105','Liberar ambiente de homologação','ivo',stages[0],'BLOCKED',2,'Disponibilizar o ambiente para a validação integrada do aplicativo.','Acesso ao ambiente de homologação aguardando liberação.'),
  t('LISA-106','Criar fluxo de novo compromisso','caio',stages[1],'PROGRESS',5,'Implementar o formulário SwiftUI com título, data, horário e confirmação de criação.'),
  t('LISA-107','Sincronizar agenda em background','bia',stages[1],'PROGRESS',5,'Sincronizar compromissos preservando alterações quando a conexão for restabelecida.'),
  t('LISA-108','Corrigir migração do banco local','nara',stages[0],'REJECTED',3,'Revisar a migração do armazenamento local sem perder compromissos existentes.','A validação identificou compromissos duplicados após a migração.'),
  t('LISA-109','Definir esquema de compromissos','nara',stages[0],'DONE',3,'Definir entidades, identificadores e regras de integridade do armazenamento.'),
  t('LISA-110','Configurar pipeline iOS','ivo',stages[0],'DONE',2,'Preparar compilação, testes e distribuição interna da versão de demonstração.'),
  t('LISA-111','Preparar a base em SwiftUI','bia',stages[0],'DONE',2,'Configurar a navegação inicial e os componentes compartilhados do aplicativo.'),
]
export const initialProductGoal = 'Ajudar pessoas a organizar a rotina e acompanhar seus compromissos em um app iOS simples e confiável.'
export const initialSprintGoal = 'Criar e sincronizar um compromisso, com uma experiência acessível e qualidade verificada.'

export type Ceremony = {id:string;name:string;when:string;status:string;duration:string;purpose:string;participants:string;output:string;note:string;source:string}
export const ceremonies: Ceremony[] = [
  {id:'planning',name:'Sprint Planning',when:'12 out · 09:00',status:'Realizada',duration:'90 min neste exemplo',purpose:'Definir por que a Sprint tem valor, o que pode ser entregue e como o trabalho será realizado.',participants:'Toda a equipe Scrum. O Product Owner traz objetivos e prioridades; os Developers selecionam e planejam o trabalho.',output:'Sprint Goal e Sprint Backlog: objetivo, itens selecionados e plano de execução.',note:'Acontece uma vez no início de cada Sprint. O plano pode ser adaptado ao longo dela.',source:'https://scrumguides.org/scrum-guide.html#sprint-planning'},
  {id:'daily',name:'Daily Scrum',when:'Hoje · 09:15',status:'Em foco',duration:'15 min',purpose:'Inspecionar o progresso em direção ao Sprint Goal e ajustar o plano para o próximo dia de trabalho.',participants:'Developers. Product Owner e Scrum Master participam como Developers quando trabalham em itens do Sprint Backlog.',output:'Plano de trabalho adaptado, com próximos passos e impedimentos identificados.',note:'Ocorre em cada dia de trabalho. A equipe pode adaptar o plano também fora desse evento.',source:'https://scrumguides.org/scrum-guide.html#daily-scrum'},
  {id:'review',name:'Sprint Review',when:'23 out · 14:00',status:'Agendada',duration:'60 min neste exemplo',purpose:'Inspecionar os resultados com stakeholders e discutir adaptações futuras para o produto.',participants:'Equipe Scrum e stakeholders relevantes.',output:'Aprendizado sobre o incremento e possíveis adaptações no Product Backlog.',note:'É uma sessão de trabalho colaborativa. Uma entrega pronta pode ser liberada antes da Review.',source:'https://scrumguides.org/scrum-guide.html#sprint-review'},
  {id:'retro',name:'Sprint Retrospective',when:'23 out · 15:15',status:'Agendada',duration:'45 min neste exemplo',purpose:'Inspecionar como a equipe trabalhou e escolher melhorias de qualidade e eficácia.',participants:'Toda a equipe Scrum: Product Owner, Scrum Master e Developers.',output:'Melhorias concretas para pessoas, interações, processos, ferramentas e qualidade.',note:'Encerra a Sprint. A conversa deve permitir analisar dificuldades e acertos com abertura.',source:'https://scrumguides.org/scrum-guide.html#sprint-retrospective'},
]

export function validateMove(task:Task,target:Status):string|null {
  if(!transitions[task.status].includes(target)) return 'Essa mudança não faz parte do fluxo de demonstração. Abra a tarefa para ver os próximos passos.'
  if(target==='DONE' && !task.checks.every(Boolean)) return 'Confira todos os critérios de pronto antes de concluir e entregar.'
  return null
}
export function movedTask(task:Task,target:Status,reason?:string):Task {
  const detail = target==='TODO'&&task.status==='REJECTED'?'Replanejada após reprovação. O identificador e o histórico foram preservados.':`Movida de ${statuses.find(s=>s.id===task.status)!.label} para ${statuses.find(s=>s.id===target)!.label}.`
  return {...task,status:target,reason: reason??task.reason,reasonKind:target==='BLOCKED'?'block':target==='REJECTED'?'rejection':task.reasonKind,checks:target==='TODO'&&task.status==='REJECTED'?[false,false,false]:task.checks,history:[...task.history,reason?`${detail} Motivo: ${reason}`:detail]}
}
