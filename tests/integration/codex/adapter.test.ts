import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createCodexHost, initializeRuntimeHome, type CodexHost } from '../../../packages/codex/src/index.js'
import { turn } from '../../fixtures/contracts.js'
import type { HostEvent, HostTurnInput } from '@ioteams/core'
const fixture = fileURLToPath(new URL('../../fixtures/codex/server.mjs', import.meta.url))
const homes: string[] = [], hosts: CodexHost[] = []
afterEach(async () => { for (const host of hosts.splice(0)) await host.dispose();for (const home of homes.splice(0)) await rm(home,{recursive:true,force:true}) })
async function setup(mode='normal', overrides: Record<string,unknown>={}) {
  const root=await realpath(await mkdtemp(join(tmpdir(),'ioteams-t10-')));homes.push(root)
  const runtimeHome=join(root,'runtime'),cwd=join(root,'checkout')
  const {mkdir}=await import('node:fs/promises');await mkdir(cwd)
  await initializeRuntimeHome({runtimeHome,checkoutRoots:[cwd]})
  const options={runtimeHome,cwd,runId:'run-1',permissionProfile:'fixture-profile',model:'fixture-model',executable:process.execPath,executableArgs:[fixture,'--mode',mode],requestTimeoutMs:1000,turnTimeoutMs:2000,shutdownTimeoutMs:100,...overrides}
  const host=await createCodexHost(options);hosts.push(host);return {host,runtimeHome,options,cwd}
}
const input=turn as HostTurnInput
async function collect(host:CodexHost,signal?:AbortSignal){const events:HostEvent[]=[];for await(const event of host.start(input,signal))events.push(event);return events}
async function messages(home:string){return (await readFile(join(home,'fixture-messages.jsonl'),'utf8')).trim().split('\n').map(s=>JSON.parse(s))}
describe('Codex stdio adapter (no credentials or inference)',()=>{
  it('handshakes, paginates capabilities, isolates env and sends corpus only as user data',async()=>{
    const {host,runtimeHome,cwd}=await setup()
    expect(await host.status()).toEqual({authenticated:true,requiresOpenaiAuth:true})
    expect((await host.models()).map(m=>m.model)).toEqual(['fixture-model'])
    const events=await collect(host)
    expect(events.map(e=>e.type)).toEqual(['thread.started','turn.started','tool.started','content.delta','tool.completed','turn.completed'])
    expect(events.find(e=>e.type==='content.delta')).toEqual({type:'content.delta',turnId:'turn-1',text:'Olá 🧪'})
    expect(events.at(-1)).toEqual({type:'turn.completed',turnId:'turn-1',status:'completed'})
    const calls=await messages(runtimeHome)
    expect(calls.slice(0,2).map(m=>m.method)).toEqual(['initialize','initialized'])
    const threadCall=calls.find(m=>m.method==='thread/start').params
    expect(threadCall).toMatchObject({cwd,permissions:'fixture-profile',approvalPolicy:'on-request',approvalsReviewer:'user',model:'fixture-model',allowProviderModelFallback:false})
    expect(threadCall).not.toHaveProperty('sandbox');expect(threadCall).not.toHaveProperty('baseInstructions');expect(threadCall).not.toHaveProperty('developerInstructions')
    const payload=calls.find(m=>m.method==='turn/start').params
    expect(JSON.parse(payload.input[0].text)).toEqual(input)
    expect(payload.input[0].type).toBe('text')
    const env=JSON.parse(await readFile(join(runtimeHome,'fixture-environment.json'),'utf8'))
    expect(env.codexHome).toBe(runtimeHome);expect(env.sqliteHome).toBe(join(runtimeHome,'sqlite'))
    expect(env.keys).not.toContain('OPENAI_API_KEY');expect(env.keys).not.toContain('CODEX_THREAD_ID');expect(env.home).toBe(join(runtimeHome,'home'))
    expect(env.argv).toContain('cli_auth_credentials_store="file"')
    expect(env.argv).toContain(`log_dir=${JSON.stringify(join(runtimeHome,'logs'))}`)
  })
  it.each([['bad-version','UNSUPPORTED_VERSION'],['wrong-home','UNSAFE_RUNTIME'],['missing-capability','RPC_ERROR'],['denied-profile','PERMISSIONS_UNAVAILABLE']])('blocks incompatible initialization: %s',async (mode,code)=>{
    await expect(setup(mode)).rejects.toMatchObject({code})
  })
  it.each(['instructions','changed-profile','changed-model','changed-policy'])('refuses unsafe effective thread settings: %s',async mode=>{
    const {host,runtimeHome}=await setup(mode)
    const events=await collect(host);expect(events.at(-1)?.type).toBe('error')
    expect((await messages(runtimeHome)).some(m=>m.method==='turn/start')).toBe(false)
  })
  it('routes command/file/permissions approvals once using distinct numeric and string RPC ids',async()=>{
    const {host,runtimeHome}=await setup('approvals');const kinds:string[]=[]
    for await(const event of host.start(input)) if(event.type==='approval.requested'){
      kinds.push(event.request.kind)
      await host.respondToApproval(event.request.requestId,'accept')
      await expect(host.respondToApproval(event.request.requestId,'accept')).rejects.toThrow()
    }
    expect(kinds).toEqual(['command','file_change','permissions'])
    const replies=(await messages(runtimeHome)).filter(m=>!m.method)
    expect(replies).toEqual([{id:91,result:{decision:'accept'}},{id:'91',result:{decision:'accept'}},{id:92,result:{permissions:{network:{enabled:true}},scope:'turn'}}])
  })
  it.each(['decline','cancel'] as const)('maps approval %s without persistent grants',async decision=>{
    const {host,runtimeHome}=await setup('approvals')
    for await(const event of host.start(input)) if(event.type==='approval.requested')await host.respondToApproval(event.request.requestId,decision)
    const replies=(await messages(runtimeHome)).filter(m=>!m.method)
    expect(replies[0].result).toEqual({decision});expect(replies[1].result).toEqual({decision})
    expect(replies[2].result).toEqual({permissions:{},scope:'turn'})
  })
  it.each(['malformed','oversize','rpc-error','disconnect','timeout','hang','unknown-request','invalid-event'])('terminates uncertain work on %s without leaking diagnostics',async mode=>{
    const {host,runtimeHome}=await setup(mode,{requestTimeoutMs:250,turnTimeoutMs:350})
    const events=await collect(host)
    expect(events.at(-1)?.type).toBe('error');expect(JSON.stringify(events)).not.toContain('private diagnostic')
    await expect(host.status()).rejects.toThrow()
    const pid=Number(await readFile(join(runtimeHome,'fixture-pid'),'utf8'))
    expect(()=>process.kill(pid,0)).toThrow()
    await expect(readFile(join(runtimeHome,'.ioteams-adapter.lock'))).rejects.toMatchObject({code:'ENOENT'})
  })
  it('preserves terminal failure and error events',async()=>{
    const {host}=await setup('failed');const events=await collect(host)
    expect(events.some(e=>e.type==='error')).toBe(true)
    expect(events.at(-1)).toEqual({type:'turn.completed',turnId:'turn-1',status:'failed'})
  })
  it('handles completion before turn/start response and ignores late events',async()=>{
    const {host}=await setup('fast');expect((await collect(host)).at(-1)).toEqual({type:'turn.completed',turnId:'turn-1',status:'completed'})
  })
  it('interrupts only the active turn and closes exact owned process idempotently',async()=>{
    const {host,runtimeHome}=await setup('hang');const events:HostEvent[]=[]
    for await(const event of host.start(input)){events.push(event);if(event.type==='turn.started'){
      await expect(host.interrupt('wrong')).rejects.toThrow();await host.interrupt(event.turnId)
    }}
    expect(events.at(-1)).toEqual({type:'turn.completed',turnId:'turn-1',status:'interrupted'})
    const pid=Number(await readFile(join(runtimeHome,'fixture-pid'),'utf8'))
    await host.dispose();await host.dispose();expect(()=>process.kill(pid,0)).toThrow()
  })
  it('aborts using turn/interrupt and rejects a second writer',async()=>{
    const {host}=await setup('hang');const controller=new AbortController()
    const events:HostEvent[]=[]
    for await(const event of host.start(input,controller.signal)){events.push(event);if(event.type==='turn.started'){
      const concurrent=await collect(host);expect(concurrent.at(-1)?.type).toBe('error');controller.abort()
    }}
    expect(events.at(-1)).toEqual({type:'turn.completed',turnId:'turn-1',status:'interrupted'})
  })
  it('kills only its stubborn child on iterator disposal',async()=>{
    const {host,runtimeHome}=await setup('stubborn')
    for await(const event of host.start(input))if(event.type==='turn.started')break
    const pid=Number(await readFile(join(runtimeHome,'fixture-pid'),'utf8'))
    expect(()=>process.kill(pid,0)).toThrow()
  })
  it('exposes native device login and cancellation, refuses logged-out turns',async()=>{
    const {host,runtimeHome}=await setup('logged-out')
    expect(await host.status()).toEqual({authenticated:false,requiresOpenaiAuth:true})
    expect((await collect(host)).at(-1)?.type).toBe('error')
    expect(await host.login()).toMatchObject({type:'chatgptDeviceCode',loginId:'login-1'})
    await host.cancelLogin('login-1')
    const calls=await messages(runtimeHome)
    expect(calls.find(m=>m.method==='account/login/start').params).toEqual({type:'chatgptDeviceCode'})
    expect(calls.some(m=>m.method==='turn/start')).toBe(false)
  })
  it('reserves the dedicated runtime exclusively and releases only after disposal',async()=>{
    const {host,options,runtimeHome}=await setup()
    await expect(createCodexHost(options)).rejects.toMatchObject({code:'RUNTIME_BUSY'})
    expect(await host.status()).toMatchObject({authenticated:true})
    await host.dispose()
    await expect(readFile(join(runtimeHome,'.ioteams-adapter.lock'))).rejects.toMatchObject({code:'ENOENT'})
    const next=await createCodexHost(options);hosts.push(next)
    expect(await next.status()).toMatchObject({authenticated:true})
  })
  it('selects a discovered model explicitly and resumes only a supplied thread id',async()=>{
    const {host,runtimeHome}=await setup('normal',{model:undefined})
    expect((await collect(host)).at(-1)).toMatchObject({code:'MODEL_REQUIRED'})
    await expect(host.selectModel('absent')).rejects.toMatchObject({code:'MODEL_UNAVAILABLE'})
    await host.selectModel('fixture-model')
    const events:HostEvent[]=[]
    for await(const event of host.start({...input,identity:{...input.identity,threadId:'thread-1'}}))events.push(event)
    expect(events.at(-1)).toMatchObject({type:'turn.completed',status:'completed'})
    expect((await messages(runtimeHome)).find(m=>m.method==='thread/resume').params.threadId).toBe('thread-1')
  })
  it('correlates concurrent read-only RPC results when responses arrive out of order',async()=>{
    const {host}=await setup('reordered')
    const [status,models]=await Promise.all([host.status(),host.models()])
    expect(status).toEqual({authenticated:true,requiresOpenaiAuth:true})
    expect(models.map(model=>model.model)).toEqual(['fixture-model'])
  })
  it('accepts only explicitly trusted instruction sources',async()=>{
    const {host}=await setup('instructions',{trustedInstructionSources:['/untrusted/AGENTS.md']})
    expect((await collect(host)).at(-1)).toMatchObject({type:'turn.completed',status:'completed'})
  })
  it('delivers native login completion separately from turn events',async()=>{
    const {host}=await setup()
    let unsubscribe=()=>{}
    const completed=new Promise<unknown>(resolve=>{unsubscribe=host.onLoginCompleted(resolve)})
    await host.login()
    expect(await completed).toEqual({loginId:'login-1',success:true});unsubscribe()
  })

  it('reports event overflow as a terminal error and bounds buffered events',async()=>{
    const {host}=await setup('overflow')
    const events:HostEvent[]=[]
    for await(const event of host.start(input)){
      events.push(event)
      if(event.type==='turn.started')await new Promise(resolve=>setTimeout(resolve,100))
    }
    expect(events.at(-1)).toMatchObject({type:'error',code:'EVENT_OVERFLOW'})
    expect(events.length).toBeLessThanOrEqual(1003)
  })

})
