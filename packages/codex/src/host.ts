import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { open, realpath, unlink, lstat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ApprovalDecisionSchema, HostEventSchema, HostTurnInputSchema, IdentifierSchema, type ApprovalDecision, type HostAdapter, type HostEvent, type HostTurnInput } from '@ioteams/core'
import type { ClientRequest } from '../protocol/generated/ClientRequest.js'
import type { Model } from '../protocol/generated/v2/Model.js'
import type { LoginAccountResponse } from '../protocol/generated/v2/LoginAccountResponse.js'
import type { RequestPermissionProfile } from '../protocol/generated/v2/RequestPermissionProfile.js'
import type { PermissionsRequestApprovalResponse } from '../protocol/generated/v2/PermissionsRequestApprovalResponse.js'
import type { CommandExecutionRequestApprovalResponse } from '../protocol/generated/v2/CommandExecutionRequestApprovalResponse.js'
import type { FileChangeRequestApprovalResponse } from '../protocol/generated/v2/FileChangeRequestApprovalResponse.js'
import { CodexHostError, hostError } from './errors.js'
import { runtimeEnvironment, validateRuntimeHome } from './runtime.js'
import { StdioRpc, type RpcId, type RpcMessage } from './rpc.js'
import manifest from '../protocol/manifest.json' with { type: 'json' }
const VERSION = manifest.codexCliVersion
const optionsSchema = z.strictObject({
  runtimeHome: z.string(), cwd: z.string(), runId: IdentifierSchema, permissionProfile: z.string().min(1).max(128),
  model: z.string().min(1).optional(), executable: z.string().min(1).default('codex'), executableArgs: z.array(z.string()).default([]),
  trustedInstructionSources: z.array(z.string()).default([]), protectedHomes: z.array(z.string()).default([]),
  requestTimeoutMs: z.number().int().min(50).max(60_000).default(10_000),
  turnTimeoutMs: z.number().int().min(50).max(1_800_000).default(1_800_000),
  shutdownTimeoutMs: z.number().int().min(10).max(5000).default(1000),
})
export type CodexHostOptions = z.input<typeof optionsSchema>
type Options = z.output<typeof optionsSchema>
const id = IdentifierSchema
const page = z.object({ data: z.array(z.unknown()).max(1000), nextCursor: z.string().nullable() })
const threadResponse = z.object({
  thread: z.object({ id }), model: z.string(), cwd: z.string(), instructionSources: z.array(z.string()),
  activePermissionProfile: z.object({ id: z.string() }).nullable(), approvalPolicy: z.unknown(), approvalsReviewer: z.string(),
})
const turnResponse = z.object({ turn: z.object({ id, status: z.enum(['inProgress','completed','failed','interrupted']) }) })
const scoped = z.object({ threadId: id, turnId: id })
const turnNotification = z.object({ threadId: id, turn: z.object({ id, status: z.enum(['inProgress','completed','failed','interrupted']) }) })
const specialPath = z.discriminatedUnion('kind', [
  z.strictObject({kind:z.literal('root')}),z.strictObject({kind:z.literal('minimal')}),
  z.strictObject({kind:z.literal('tmpdir')}),z.strictObject({kind:z.literal('slash_tmp')}),
  z.strictObject({kind:z.literal('project_roots'),subpath:z.string().nullable()}),
  z.strictObject({kind:z.literal('unknown'),path:z.string(),subpath:z.string().nullable()}),
])
const fileSystemPath = z.discriminatedUnion('type', [
  z.strictObject({type:z.literal('path'),path:z.string()}),
  z.strictObject({type:z.literal('glob_pattern'),pattern:z.string()}),
  z.strictObject({type:z.literal('special'),value:specialPath}),
])
const permissionsSchema:z.ZodType<RequestPermissionProfile> = z.strictObject({
  network:z.strictObject({enabled:z.boolean().nullable()}).nullable(),
  fileSystem:z.strictObject({
    read:z.array(z.string()).nullable(),write:z.array(z.string()).nullable(),
    globScanMaxDepth:z.number().int().nonnegative().optional(),
    entries:z.array(z.strictObject({path:fileSystemPath,access:z.enum(['read','write','deny'])})).optional(),
  }).nullable(),
})
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new CodexHostError('PROTOCOL_ERROR', 'Resposta Codex incompatível com o protocolo instalado.')
  return result.data
}
class EventQueue {
  private values: HostEvent[] = []
  private ended = false
  private bytes = 0
  private wake?: () => void
  push(event: HostEvent): void {
    if (this.ended) return
    const size=Buffer.byteLength(JSON.stringify(event))
    if (this.values.length >= 1000 || this.bytes+size>4_194_304) throw new CodexHostError('EVENT_OVERFLOW', 'Consumidor não acompanhou os eventos Codex.')
    this.bytes+=size;this.values.push(HostEventSchema.parse(event));this.wake?.();this.wake=undefined
  }
  fail(event:HostEvent):void {this.values=[];this.bytes=0;this.push(event);this.end()}
  end(): void { this.ended=true;this.wake?.();this.wake=undefined }
  async *read(): AsyncIterable<HostEvent> {
    while (true) {
      const value=this.values.shift();if(value){this.bytes-=Buffer.byteLength(JSON.stringify(value));yield value;continue}
      if(this.ended)return
      await new Promise<void>(resolve=>{this.wake=resolve})
    }
  }
}
interface Active {
  queue: EventQueue; threadId?: string; turnId?: string; terminal: boolean; preTurn: RpcMessage[]; preTurnBytes:number; timer?: NodeJS.Timeout
}
interface Approval { rpcId: RpcId; kind: 'command'|'file_change'|'permissions'; params: Record<string, unknown>; turnId: string }
export class CodexHost implements HostAdapter {
  private active?: Active
  private approvals = new Map<string, Approval>()
  private model?: string
  private disposed = false
  private disposal?: Promise<void>
  private loginListeners = new Set<(event: {loginId:string|null;success:boolean}) => void>()
  private constructor(private options: Options, private rpc: StdioRpc, private release: () => Promise<void>) {
    this.model=options.model
    rpc.onMessage=message=>this.message(message)
    rpc.onFailure=error=>{this.failActive(error);void this.dispose().catch(()=>{/* Explicit dispose retains any release error for the owner. */})}
  }
  static async create(raw: CodexHostOptions): Promise<CodexHost> {
    const options = optionsSchema.parse(raw)
    if (!isAbsolute(options.cwd)) throw new CodexHostError('UNSAFE_CWD', 'Checkout deve ter caminho absoluto.')
    options.cwd=await realpath(options.cwd)
    options.runtimeHome=await validateRuntimeHome({runtimeHome:options.runtimeHome,checkoutRoots:[options.cwd],protectedHomes:options.protectedHomes})
    for(const path of options.trustedInstructionSources) if(!isAbsolute(path)) throw new CodexHostError('UNTRUSTED_INSTRUCTIONS','Fontes confiáveis exigem caminhos absolutos.')
    const lock=join(options.runtimeHome,'.ioteams-adapter.lock')
    let handle
    try {handle=await open(lock,'wx',0o600)} catch {throw new CodexHostError('RUNTIME_BUSY','Runtime já reservado; reconcilie o processo existente antes de reutilizar.')}
    const identity=await handle.stat()
    const release=async()=>{
      try {
        const current=await lstat(lock)
        if(current.dev!==identity.dev||current.ino!==identity.ino||current.isSymbolicLink())throw new CodexHostError('RUNTIME_LOCK_CHANGED','Reserva do runtime foi alterada externamente; reconciliação necessária.')
        await unlink(lock)
      } finally {await handle.close()}
    }
    let host:CodexHost|undefined
    try {
      const env=runtimeEnvironment(options.runtimeHome)
      const version=await promisify(execFile)(options.executable,[...options.executableArgs,'--version'],{env,cwd:options.runtimeHome,timeout:options.requestTimeoutMs,maxBuffer:8192})
      if(version.stdout.trim()!==`codex-cli ${VERSION}`)throw new CodexHostError('UNSUPPORTED_VERSION','Versão Codex difere do manifesto; regenere e revise o protocolo.')
      const args=[...options.executableArgs,'app-server','--listen','stdio://','--strict-config',
        '-c','cli_auth_credentials_store="file"','-c',`sqlite_home=${JSON.stringify(join(options.runtimeHome,'sqlite'))}`,
        '-c',`log_dir=${JSON.stringify(join(options.runtimeHome,'logs'))}`]
      const rpc=new StdioRpc(options.executable,args,options.cwd,env,options.requestTimeoutMs,options.shutdownTimeoutMs)
      host=new CodexHost(options,rpc,release)
      const init=parse(z.object({userAgent:z.string(),codexHome:z.string(),platformFamily:z.string(),platformOs:z.string()}),await host.request('initialize',{
        clientInfo:{name:'ioteams',title:'ioteams',version:'0.1.0'},capabilities:{experimentalApi:true,requestAttestation:false},
      }))
      let reportedHome:string|undefined
      try{reportedHome=await realpath(init.codexHome)}catch{/* Missing home cannot be accepted. */}
      if(reportedHome!==options.runtimeHome)throw new CodexHostError('UNSAFE_RUNTIME','App Server informou outro runtime.')
      rpc.send({method:'initialized'})
      const profiles=await host.pages('permissionProfile/list',{cwd:options.cwd})
      const profile=profiles.map(p=>parse(z.object({id:z.string(),allowed:z.boolean()}),p)).find(p=>p.id===options.permissionProfile)
      if(!profile?.allowed)throw new CodexHostError('PERMISSIONS_UNAVAILABLE','Perfil solicitado ausente ou proibido pelos requisitos efetivos.')
      if(options.model)await host.selectModel(options.model)
      return host
    } catch(error) {if(host)await host.dispose();else await release();throw hostError(error)}
  }
  private request<M extends ClientRequest['method']>(method:M,params:Extract<ClientRequest,{method:M}>['params']):Promise<unknown>{
    return this.rpc.request(method,params)
  }
  private async pages(method:'model/list'|'permissionProfile/list',params:Record<string,unknown>):Promise<unknown[]> {
    const values:unknown[]=[],cursors=new Set<string>();let cursor:string|null=null
    do {
      const response:z.output<typeof page>=parse(page,await this.rpc.request(method,{...params,...cursor?{cursor}:{}}))
      values.push(...response.data)
      if(values.length>10_000||cursors.size>=100||response.nextCursor&&cursors.has(response.nextCursor))throw new CodexHostError('PROTOCOL_ERROR','Paginação Codex inválida.')
      cursor=response.nextCursor;if(cursor)cursors.add(cursor)
    } while(cursor)
    return values
  }
  async models():Promise<Model[]> {
    return (await this.pages('model/list',{})).map(value=>{
      parse(z.object({id:z.string(),model:z.string(),displayName:z.string(),hidden:z.boolean()}),value)
      return structuredClone(value) as Model
    })
  }
  async selectModel(model:string):Promise<void> {
    if(this.active)throw new CodexHostError('BUSY','Não altere modelo durante um turno.')
    if(!(await this.models()).some(m=>m.model===model&&!m.hidden))throw new CodexHostError('MODEL_UNAVAILABLE','Modelo não consta no catálogo disponível.')
    this.model=model
  }
  async status():Promise<{authenticated:boolean;requiresOpenaiAuth:boolean}> {
    const value=parse(z.object({account:z.object({type:z.string()}).nullable(),requiresOpenaiAuth:z.boolean()}),await this.request('account/read',{refreshToken:false}))
    return {authenticated:value.account!==null,requiresOpenaiAuth:value.requiresOpenaiAuth}
  }
  async login():Promise<Extract<LoginAccountResponse,{type:'chatgptDeviceCode'}>> {
    return parse(z.object({type:z.literal('chatgptDeviceCode'),loginId:z.string(),verificationUrl:z.string().url(),userCode:z.string()}),await this.request('account/login/start',{type:'chatgptDeviceCode'}))
  }
  async cancelLogin(loginId:string):Promise<void> {await this.request('account/login/cancel',{loginId})}
  onLoginCompleted(listener:(event:{loginId:string|null;success:boolean})=>void):()=>void {this.loginListeners.add(listener);return()=>this.loginListeners.delete(listener)}
  async *start(raw:HostTurnInput,signal?:AbortSignal):AsyncIterable<HostEvent> {
    if(this.active){yield {type:'error',code:'BUSY',message:'Um turno já está em execução.',retryable:false};return}
    const active:Active={queue:new EventQueue(),terminal:false,preTurn:[],preTurnBytes:0};this.active=active
    const abort=()=>{if(active.turnId&&!active.terminal)void this.interrupt(active.turnId).catch(error=>this.rpc.fail(hostError(error)))}
    let completed=false
    try {
      const input=HostTurnInputSchema.parse(raw)
      if(this.disposed)throw new CodexHostError('DISPOSED','Adapter Codex encerrado.')
      if(signal?.aborted)throw new CodexHostError('CANCELLED','Execução cancelada antes do início.')
      if(!this.model)throw new CodexHostError('MODEL_REQUIRED','Selecione um modelo descoberto antes de executar.')
      const status=await this.status()
      if(!status.authenticated&&status.requiresOpenaiAuth)throw new CodexHostError('AUTH_REQUIRED','Autentique o runtime dedicado pelo fluxo nativo.')
      active.timer=setTimeout(()=>this.rpc.fail(new CodexHostError('TURN_TIMEOUT','Turno excedeu o prazo; reconciliação necessária.')),this.options.turnTimeoutMs)
      const settings={cwd:this.options.cwd,runtimeWorkspaceRoots:[this.options.cwd],model:this.model,permissions:this.options.permissionProfile,approvalPolicy:'on-request' as const,approvalsReviewer:'user' as const}
      const response=parse(threadResponse,input.identity.threadId
        ?await this.request('thread/resume',{...settings,threadId:input.identity.threadId})
        :await this.request('thread/start',{...settings,allowProviderModelFallback:false}))
      if(response.cwd!==this.options.cwd||response.model!==this.model||response.activePermissionProfile?.id!==this.options.permissionProfile||response.approvalPolicy!=='on-request'||response.approvalsReviewer!=='user')
        throw new CodexHostError('UNSAFE_THREAD','Configuração efetiva do thread diverge da política solicitada.')
      if(response.instructionSources.some(path=>!this.options.trustedInstructionSources.includes(path)))
        throw new CodexHostError('UNTRUSTED_INSTRUCTIONS','Thread carregou fontes de instrução sem decisão explícita de confiança.')
      active.threadId=response.thread.id
      yield {type:'thread.started',threadId:active.threadId}
      if(signal?.aborted)throw new CodexHostError('CANCELLED','Execução cancelada antes do turno.')
      signal?.addEventListener('abort',abort,{once:true})
      const started=parse(turnResponse,await this.request('turn/start',{
        ...settings,threadId:active.threadId,input:[{type:'text',text:JSON.stringify(input),text_elements:[]}],
      }))
      active.turnId=started.turn.id
      active.queue.push({type:'turn.started',threadId:active.threadId,turnId:active.turnId})
      for(const message of active.preTurn.splice(0))this.message(message)
      active.preTurnBytes=0
      if(started.turn.status!=='inProgress'&&!active.terminal)this.finish(active,started.turn.status)
      if(signal?.aborted)abort()
      for await(const event of active.queue.read())yield event
      completed=active.terminal
    } catch(error) {
      const safe=hostError(error)
      yield {type:'error',code:safe.code,message:safe.message,retryable:false,...active.turnId?{turnId:active.turnId}:{}}
      // A request may have run despite a failed response. No automatic retry on this connection.
      if(!['AUTH_REQUIRED','MODEL_REQUIRED','CANCELLED'].includes(safe.code))await this.dispose()
      completed=true
    } finally {
      signal?.removeEventListener('abort',abort);clearTimeout(active.timer)
      this.approvals.clear()
      if(!completed)await this.dispose()
      if(this.disposal)await this.disposal
      if(this.active===active)this.active=undefined
    }
  }
  private finish(active:Active,status:'completed'|'failed'|'interrupted'):void {
    if(active.terminal||!active.turnId)return
    active.queue.push({type:'turn.completed',turnId:active.turnId,status});active.terminal=true;clearTimeout(active.timer)
    this.approvals.clear();active.queue.end()
  }
  private failActive(error:CodexHostError):void {
    const active=this.active
    if(!active||active.terminal)return
    active.terminal=true;clearTimeout(active.timer)
    active.preTurn=[];active.preTurnBytes=0
    active.queue.fail({type:'error',code:error.code,message:error.message,retryable:false,...active.turnId?{turnId:active.turnId}:{}})
    this.approvals.clear()
  }
  private message(message:RpcMessage):void {
    try {
      if(message.method==='account/login/completed'){
        const event=parse(z.object({loginId:z.string().nullable(),success:z.boolean()}),message.params)
        for(const listener of this.loginListeners) {try{listener(event)}catch{/* UI callback cannot alter transport */}}
        return
      }
      const active=this.active
      if(!active||active.terminal){if(message.id!==undefined)this.rpc.send({id:message.id,error:{code:-32601,message:'No active approval'}});return}
      if(!active.threadId)return
      if(!active.turnId){active.preTurnBytes+=Buffer.byteLength(JSON.stringify(message));if(active.preTurn.length>=1000||active.preTurnBytes>4_194_304)throw new CodexHostError('EVENT_OVERFLOW','Eventos anteriores ao turno excederam o limite.');active.preTurn.push(message);return}
      const known=['turn/started','turn/completed','item/agentMessage/delta','item/started','item/completed','error']
      const kinds:Record<string,Approval['kind']>={'item/commandExecution/requestApproval':'command','item/fileChange/requestApproval':'file_change','item/permissions/requestApproval':'permissions'}
      const kind=kinds[message.method??'']
      if(!known.includes(message.method??'')&&!kind){if(message.id!==undefined){this.rpc.send({id:message.id,error:{code:-32601,message:'Unsupported server request'}});throw new CodexHostError('UNSUPPORTED_REQUEST','Solicitação Codex não suportada; execução interrompida.')}return}
      const p=message.params
      if(message.method?.startsWith('turn/')){
        const event=parse(turnNotification,p)
        if(event.threadId!==active.threadId||event.turn.id!==active.turnId)return
        if(message.method==='turn/completed'){
          if(event.turn.status==='inProgress')throw new CodexHostError('PROTOCOL_ERROR','Status terminal inválido.')
          this.finish(active,event.turn.status)
        }
        return
      }
      const scope=parse(scoped,p)
      if(scope.threadId!==active.threadId||scope.turnId!==active.turnId){if(message.id!==undefined)this.rpc.send({id:message.id,error:{code:-32602,message:'Inactive turn'}});return}
      const params=p as Record<string,unknown>
      if(kind){
        if(message.id===undefined)throw new CodexHostError('PROTOCOL_ERROR','Aprovação sem request id.')
        parse(z.object({itemId:id}),p)
        if(kind==='permissions')parse(permissionsSchema,params.permissions)
        if([...this.approvals.values()].some(a=>typeof a.rpcId===typeof message.id&&a.rpcId===message.id))throw new CodexHostError('PROTOCOL_ERROR','Request de aprovação duplicado.')
        const requestId=randomUUID()
        this.approvals.set(requestId,{rpcId:message.id,kind,params:structuredClone(params),turnId:active.turnId})
        active.queue.push({type:'approval.requested',request:{id:randomUUID(),requestId,runId:this.options.runId,threadId:active.threadId,turnId:active.turnId,kind,
          summary:kind==='command'?'Aprovar comando solicitado pelo Codex':kind==='file_change'?'Aprovar alterações solicitadas pelo Codex':'Aprovar permissões para este turno',details:parse(z.record(z.string(),z.json()),params),status:'pending'}})
      } else if(message.method==='item/agentMessage/delta') {
        active.queue.push({type:'content.delta',turnId:active.turnId,text:parse(z.object({delta:z.string()}),p).delta})
      } else if(message.method==='error') {
        active.queue.push({type:'error',code:'CODEX_ERROR',message:'Codex informou erro durante o turno.',retryable:parse(z.object({willRetry:z.boolean()}),p).willRetry,turnId:active.turnId})
      } else {
        const item=parse(z.object({item:z.object({id,type:z.string()}).passthrough()}),p).item
        if(['commandExecution','fileChange','mcpToolCall','dynamicToolCall','webSearch','imageView','imageGeneration'].includes(item.type)){
          active.queue.push(message.method==='item/started'
            ?{type:'tool.started',turnId:active.turnId,toolId:item.id,name:item.type,input:parse(z.json(),item)}
            :{type:'tool.completed',turnId:active.turnId,toolId:item.id,output:parse(z.json(),item)})
        }
      }
    }catch(error){this.rpc.fail(hostError(error))}
  }
  async respondToApproval(requestId:string,raw:ApprovalDecision):Promise<void> {
    const decision=ApprovalDecisionSchema.parse(raw),approval=this.approvals.get(requestId)
    if(!approval||!this.active||this.active.terminal||approval.turnId!==this.active.turnId)throw new CodexHostError('STALE_APPROVAL','Aprovação ausente, já respondida ou fora do turno ativo.')
    let result:PermissionsRequestApprovalResponse|CommandExecutionRequestApprovalResponse|FileChangeRequestApprovalResponse
    if(approval.kind==='permissions'){
      const requested=parse(permissionsSchema,approval.params.permissions)
      result={permissions:decision==='accept'?{...requested.network?{network:requested.network}:{},...requested.fileSystem?{fileSystem:requested.fileSystem}:{}}:{},scope:'turn'}
    }else{
      if(decision==='accept'&&approval.kind==='file_change'&&approval.params.grantRoot)throw new CodexHostError('UNSUPPORTED_GRANT','Grant de sessão não é suportado pelo contrato v1.')
      if(approval.kind==='command'&&Array.isArray(approval.params.availableDecisions)&&!approval.params.availableDecisions.includes(decision))throw new CodexHostError('UNSUPPORTED_DECISION','Decisão não oferecida pelo Codex.')
      result={decision}
    }
    this.rpc.send({id:approval.rpcId,result});this.approvals.delete(requestId)
  }
  async interrupt(turnId:string):Promise<void> {
    const active=this.active
    if(!active||active.terminal||active.turnId!==turnId||!active.threadId)throw new CodexHostError('STALE_TURN','Somente o turno ativo pode ser interrompido.')
    await this.request('turn/interrupt',{threadId:active.threadId,turnId})
  }
  dispose():Promise<void> {
    if(!this.disposal)this.disposal=Promise.resolve().then(async()=>{
      this.disposed=true;this.loginListeners.clear();await this.rpc.dispose();await this.release()
    })
    return this.disposal
  }
}
export const createCodexHost = (options:CodexHostOptions):Promise<CodexHost> => CodexHost.create(options)
