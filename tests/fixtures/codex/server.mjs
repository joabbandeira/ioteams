import { fixtureModel as model, fixtureTurn as turn, fixtureThread } from './payloads.ts'
import { createInterface } from 'node:readline'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const mode = process.argv[process.argv.indexOf('--mode') + 1] ?? 'normal'
if (process.argv.includes('--version')) {
  console.log(mode === 'bad-version' ? 'codex-cli 0.1.0' : 'codex-cli 0.162.1'); process.exit(0)
}
const home = process.env.CODEX_HOME
writeFileSync(join(home, 'fixture-pid'), String(process.pid))
writeFileSync(join(home, 'fixture-environment.json'), JSON.stringify({
  keys: Object.keys(process.env), home: process.env.HOME, codexHome: home,
  sqliteHome: process.env.CODEX_SQLITE_HOME, argv: process.argv.slice(2),
}))
if (mode === 'stubborn') process.on('SIGTERM', () => {})
const send = message => process.stdout.write(JSON.stringify(message) + '\n')
const result = (id, value) => send({ id, result: value })
const notify = (method, params) => send({ method, params })
const done = status => notify('turn/completed', { threadId: 'thread-1', turn: turn(status) })
let initialized = false, handshake = false, approval = 0
const approvals = [
  ['item/commandExecution/requestApproval', 91, {kind:'command',command:'npm test',cwd:'/fixture',availableDecisions:['accept','decline','cancel']}],
  ['item/fileChange/requestApproval', '91', {reason:'fixture files',grantRoot:null}],
  ['item/permissions/requestApproval', 92, {cwd:'/fixture',reason:'fixture permissions',permissions:{network:{enabled:true},fileSystem:null}}],
]
function nextApproval() {
  const entry = approvals[approval++]
  if (entry) send({method:entry[0], id:entry[1], params:{threadId:'thread-1',turnId:'turn-1',itemId:'tool-1',environmentId:null,startedAtMs:1,...entry[2]}})
  else done('completed')
}
createInterface({input:process.stdin}).on('line', line => {
  const m = JSON.parse(line)
  appendFileSync(join(home, 'fixture-messages.jsonl'), line + '\n')
  if (!m.method) { if (mode === 'approvals') nextApproval(); return }
  if (m.method === 'initialize') {handshake=true;result(m.id,{userAgent:'fixture',codexHome:mode==='wrong-home'?'/wrong':home,platformFamily:'unix',platformOs:process.platform});return}
  if (m.method === 'initialized') { initialized=handshake;return }
  if (!initialized) {send({id:m.id,error:{code:-32000,message:'Not initialized'}});return}
  switch (m.method) {
    case 'permissionProfile/list':
      if (mode === 'missing-capability') {send({id:m.id,error:{code:-32601,message:'not found'}});break}
      result(m.id,{data:m.params.cursor?[{id:'fixture-profile',description:null,allowed:mode!=='denied-profile'}]:[],nextCursor:m.params.cursor?null:'profiles-page-2'});break
    case 'model/list':result(m.id,{data:m.params.cursor?[model]:[],nextCursor:m.params.cursor?null:'models-page-2'});break
    case 'account/read':{const sendStatus=()=>result(m.id,{account:mode==='logged-out'?null:{type:'chatgpt',email:'fixture@example.invalid',planType:'plus'},requiresOpenaiAuth:true,workspaceRouting:null});if(mode==='reordered')setTimeout(sendStatus,30);else sendStatus();break}
    case 'account/login/start':result(m.id,{type:'chatgptDeviceCode',loginId:'login-1',verificationUrl:'https://example.invalid/device',userCode:'FIXTURE'});notify('account/login/completed',{loginId:'login-1',success:true,error:null});break
    case 'account/login/cancel':result(m.id,{status:'canceled'});break
    case 'thread/start':case 'thread/resume':
      result(m.id,fixtureThread(m.params,mode));break
    case 'turn/start':
      if(mode==='malformed'){process.stdout.write('{bad json\n');break}
      if(mode==='oversize'){process.stdout.write('x'.repeat(5_000_000));break}
      if(mode==='rpc-error'){send({id:m.id,error:{code:-32000,message:'private diagnostic must not leak'}});break}
      if(mode==='disconnect'){process.exit(17)}
      if(mode==='timeout'){break}
      if(mode==='fast'){done('completed');result(m.id,{turn:turn('inProgress')});break}
      result(m.id,{turn:turn('inProgress')})
      notify('turn/started',{threadId:'thread-1',turn:turn('inProgress')})
      if(['hang','stubborn'].includes(mode)) break
      if(mode==='invalid-event'){notify('item/agentMessage/delta',{threadId:'thread-1',turnId:'turn-1',itemId:'a',delta:42});break}
      if(mode==='overflow'){for(let i=0;i<1100;i++)notify('item/agentMessage/delta',{threadId:'thread-1',turnId:'turn-1',itemId:'a',delta:'x'});break}
      if(mode==='unknown-request'){send({id:93,method:'unknown/approval',params:{}});break}
      if(mode==='approvals'){nextApproval();break}
      notify('item/agentMessage/delta',{threadId:'other-thread',turnId:'turn-1',itemId:'a',delta:'WRONG'})
      notify('item/agentMessage/delta',{threadId:'thread-1',turnId:'other-turn',itemId:'a',delta:'WRONG'})
      const item={type:'commandExecution',id:'tool-1',command:'npm test',cwd:'/fixture',processId:null,pluginId:null,scriptPath:null,source:'agent',status:'inProgress',commandActions:[],aggregatedOutput:null,exitCode:null,durationMs:null}
      notify('item/started',{threadId:'thread-1',turnId:'turn-1',item})
      notify('item/agentMessage/delta',{threadId:'thread-1',turnId:'turn-1',itemId:'a',delta:'Olá 🧪'})
      notify('item/completed',{threadId:'thread-1',turnId:'turn-1',item:{...item,status:'completed',exitCode:0,aggregatedOutput:'passed'}})
      if(mode==='failed')notify('error',{threadId:'thread-1',turnId:'turn-1',error:{message:'fixture failure',codexErrorInfo:null,additionalDetails:null},willRetry:false})
      done(mode==='failed'?'failed':'completed')
      notify('item/agentMessage/delta',{threadId:'thread-1',turnId:'turn-1',itemId:'a',delta:'LATE'})
      break
    case 'turn/interrupt': result(m.id,{});done('interrupted');break
    default:send({id:m.id,error:{code:-32601,message:'not found'}})
  }
})
