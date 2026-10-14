import { trackedBody, drainTestBodies } from '../../fixtures/runtime/test-lifetime.js'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { openKnowledge } from '@ioteams/knowledge'
import { PlanningService } from '@ioteams/runtime'
import { createDomainServices,createLocalServer } from '../../../apps/server/src/index.js'
import { initializeProduct,publishCliConnection } from '../../../apps/cli/src/index.js'
import { planningFixture } from '../runtime/planning.fixture.js'
import { executionFixture,FixtureExecutionService as ExecutionService } from '../runtime/execution.fixture.js'
import { fixtureSpawn, currentFixtureLifetime, git } from '../../fixtures/runtime/repository.js'
const cleanup:(()=>Promise<void>|void)[]=[]
afterEach(async()=>{ await drainTestBodies();for(const close of cleanup.splice(0).reverse())await close()})
function subprocess(args:string[],input?:unknown){
  const started=performance.now(),owned=fixtureSpawn(process.execPath,['--import','tsx','apps/cli/src/main.ts',...args],{stdio:['pipe','pipe','pipe']}),child=owned.child
  const trace=(phase:string)=>{if(process.env.IOTEAMS_FIXTURE_TIMINGS==='1')console.error('[cli-process]',JSON.stringify({pid:child.pid,command:args[0],phase,ms:Math.round(performance.now()-started)}))}
  let stdout='',stderr='',first=true;child.stdout!.on('data',b=>{if(first){trace('first-output');first=false}stdout+=b});child.stderr!.on('data',b=>stderr+=b)
  child.stdin!.end(input===undefined?undefined:JSON.stringify(input));child.once('exit',()=>trace('exit'))
  const operation=owned.closed.then(()=>{trace('close');if(owned.failure())throw owned.failure();return {code:child.exitCode??1,stdout,stderr,value:stdout?JSON.parse(stdout):undefined}})
  const done=currentFixtureLifetime()?.run(()=>operation,`cli:${args[0]}`)??operation
  return {child,done}
}
async function connect(base:string,catalogRoot:string,store:Parameters<typeof createLocalServer>[0]['store'],services:Parameters<typeof createLocalServer>[0]['services']){
  const home=join(base,'cli-product');await initializeProduct({home,catalogRoot,checkoutRoots:[catalogRoot]})
  const server=createLocalServer({store,services}),origin=await server.listen()
  const release=await publishCliConnection(home,origin,server.bootstrapSecret)
  cleanup.push(async()=>{await server.close();await release()})
  const command=(name:string,args:string[]=[],input?:unknown)=>subprocess([name,'--home',home,'--json',...args],input).done
  return {home,command}
}
it('plans, presents the exact proposal hash, approves and creates an operational task through the shared services',trackedBody(async()=>{
  const f=await planningFixture();cleanup.push(()=>f.cleanup())
  const directory=join(f.base,'approved');await mkdir(directory,{mode:0o700})
  const service=createDomainServices({...f.options,planning:new PlanningService(f.options),planningPolicy:async()=>f.policy,policyDirectory:directory})
  const {command}=await connect(f.base,f.corpus.root,f.store,service)
  const {teamId,requirements,...draft}=f.demand
  expect((await command('demand',['--input','-','--key','draft'],draft)).code).toBe(0)
  expect((await command('plan',['--demand',draft.id,'--input','-','--key','plan'],{expectedVersion:1,teamId,requirements})).code).toBe(0)
  await expect.poll(()=>f.store.eventsAfter(0).some(e=>e.type==='planning.proposed'),{timeout:7000}).toBe(true)
  const proposed=await command('plan',['--demand',draft.id,'--show']);expect(proposed.code).toBe(0)
  const proposal=proposed.value as {hash:string;policy:{plan:{id:string}}}
  const record=await service.read('demands',draft.id,{}) as {version:number}
  expect((await command('approve',['--demand',draft.id,'--hash','f'.repeat(64),'--version',String(record.version),'--key','bad-hash'])).code).toBe(4)
  const approved=await command('approve',['--demand',draft.id,'--hash',proposal.hash,'--version',String(record.version),'--key','approve'])
  expect(approved.code).toBe(0)
  const planId=f.store.list('approvedPlan')[0].data.id
  const task=await command('task',['--input','-','--key','task'],{projectId:draft.projectId,planId,taskId:'task-1'})
  expect(task.code).toBe(0);expect(task.value).toMatchObject({data:{state:{mode:'operational',status:'TODO'}}})
  expect(f.inputs).toHaveLength(3)
}),30_000)
async function execution(options:Parameters<typeof executionFixture>[0]={}, gate?:()=>Promise<void>){
  const creating=executionFixture(options);cleanup.push(creating.cleanup);const f=await creating
  if(gate){const factory=f.createHost;f.createHost=async request=>{const session=await factory(request);return {...session,async dispose(){await gate();await session.dispose()}}}}
  const index=openKnowledge({memory:true});cleanup.push(()=>index.close())
  const services=createDomainServices({store:f.store,index,catalogRoot:f.source,execution:new ExecutionService(f),executionContext:async()=>({policy:f.policy,workspace:f.workspace})})
  return {...f,services,...await connect(f.base,f.source,f.store,services)}
}
it('runs implement/check/review/commit/confirmed bare push and reports the same persisted API state',trackedBody(async()=>{
  const f=await execution()
  const result=await f.command('run',['--id','cli-run','--plan',f.plan.id,'--key','run','--wait'])
  expect(result.code).toBe(0);expect(result.value).toMatchObject({id:'cli-run',status:'completed'})
  expect(f.store.get('run','cli-run')?.data.status).toBe('completed');expect(f.counts()).toEqual({implementations:1,reviews:1,checks:1})
  const status=await f.command('status',['--id','cli-run']);expect(status.value).toEqual(result.value)
}),30_000)
it.each(['pause','cancel'] as const)('sends %s to the active owner, rejects stale control and never fabricates writer termination',trackedBody(async action=>{
  const runId='cli:run'
  const f=await execution({events:(events,phase)=>phase==='implement'?[events[0],events[1],{type:'approval.requested',request:{id:'a',runId,threadId:'execution-thread-1',turnId:'execution-turn-1',requestId:'req',kind:'command',summary:'Fixture',details:{},status:'pending'}}]:events})
  expect((await f.command('run',['--id',runId,'--plan',f.plan.id,'--key','run'])).code).toBe(0)
  await expect.poll(()=>f.store.get('run',runId)?.data.status,{timeout:7000}).toBe('awaiting_approval')
  expect((await f.command('status',['--id',runId])).value).toMatchObject({status:'awaiting_approval'})
  const record=await f.services.read('runs',runId,{}) as {version:number}
  expect((await f.command(action,['--id',runId,'--version',String(record.version-1),'--key','stale'])).code).toBe(4)
  const controlled=await f.command(action,['--id',runId,'--version',String(record.version),'--key','stop'])
  expect(controlled.code).toBe(0);expect(controlled.value).toMatchObject({status:action==='pause'?'paused':'cancelled'})
  if(action==='pause'){
    const current=await f.services.read('runs',runId,{}) as {version:number}
    expect((await f.command('resume',['--id',runId,'--version',String(current.version),'--key','resume'])).code).toBe(0)
    await expect.poll(()=>f.store.eventsAfter(0).filter(e=>e.type==='api.job.finished').length,{timeout:7000}).toBe(2)
    expect(await f.services.read('runStatus',runId,{})).toMatchObject({status:'paused',reason:'RECONCILIATION_REQUIRED'})
  }
  expect(f.counts().checks).toBe(0);expect(f.inputs).toHaveLength(1)
}),30_000)
it('answers one exact versioned approval through the owning service and refuses duplicates',trackedBody(async()=>{
  const f=await execution({events:(events,phase)=>phase==='implement'?[events[0],events[1],{type:'approval.requested',request:{id:'a',runId:'cli-run',threadId:'execution-thread-1',turnId:'execution-turn-1',requestId:'req',kind:'command',summary:'Fixture',details:{secret:'PRIVATE'},status:'pending'}},...events.slice(2)]:events})
  await f.command('run',['--id','cli-run','--plan',f.plan.id,'--key','run'])
  await expect.poll(()=>f.store.list('approval').length,{timeout:7000}).toBe(1)
  const approval=f.store.list('approval')[0], args=['--approval',approval.data.id,'--decision','decline','--version',String(approval.version)]
  const list=await f.command('status',['--resource','approvals']);expect(list.stdout).not.toContain('PRIVATE')
  expect((await f.command('approve',[...args,'--key','answer'])).code).toBe(0)
  expect((await f.command('approve',[...args,'--key','duplicate'])).code).toBe(4)
  expect(f.store.get('approval',approval.data.id)?.data.status).toBe('declined')
}),30_000)
it('SIGINT during --wait requests owner pause and waits for the real in-flight operation before exiting',trackedBody(async()=>{
  let entered=false,stopping=false,release!:()=>void
  const held=new Promise<void>(resolve=>release=resolve)
  const f=await execution({implement:async()=>{entered=true;await held}},async()=>{stopping=true;await held})
  let observed=false;const read=f.services.read.bind(f.services)
  f.services.read=async(...args)=>{if(args[0]==='runStatus')observed=true;return read(...args)}
  const pending=subprocess(['run','--home',f.home,'--json','--id','cli-run','--plan',f.plan.id,'--key','run','--wait'])
  try {
    await expect.poll(()=>entered,{timeout:7000}).toBe(true);await expect.poll(()=>observed,{timeout:7000}).toBe(true);pending.child.kill('SIGINT')
    await expect.poll(()=>stopping,{timeout:7000}).toBe(true)
    expect(pending.child.exitCode).toBe(null);await f.workspace.assertOwned()
    release();const result=await pending.done;expect(result.code).toBe(130);expect(result.stderr).toContain('INTERRUPTED')
    expect(f.store.get('run','cli-run')?.data.status).toBe('paused')
    expect(f.counts().checks).toBe(0)
  }finally{release();await pending.done}
}),30_000)
it('reconciles an uncertain completed push with explicit version/key without repeating a commit or native turn',trackedBody(async()=>{
  const f=await execution(),original=f.store.appendEvent.bind(f.store);let lost=false
  const spy=vi.spyOn(f.store,'appendEvent').mockImplementation(event=>{if(event.type==='execution.push.result'&&!lost){lost=true;throw new Error('lost durable result fixture')}return original(event)})
  try{
    const run=await f.command('run',['--id','reconcile:run','--plan',f.plan.id,'--key','run','--wait']);expect(run.code).not.toBe(0);expect(lost).toBe(true)
    const before=await git(f.workspaceRoot,'rev-parse','HEAD'),counts=f.counts()
    const current=await f.services.read('runs','reconcile:run',{}) as {version:number}
    const result=await f.command('reconcile',['--id','reconcile:run','--version',String(current.version),'--key','reconcile'])
    expect(result.code).toBe(0);expect(result.value).toMatchObject({status:'completed'})
    expect(await git(f.workspaceRoot,'rev-parse','HEAD')).toBe(before);expect(f.counts()).toEqual(counts)
  }finally{spy.mockRestore()}
}),30_000)
it('passes retryPush only when explicitly requested and preserves the API ownership fence',trackedBody(async()=>{
  const f=await execution({events:(events,phase)=>phase==='implement'?[events[0],events[1],{type:'approval.requested',request:{id:'a',runId:'ordinary',threadId:'execution-thread-1',turnId:'execution-turn-1',requestId:'req',kind:'command',summary:'Fixture',details:{},status:'pending'}}]:events}),original=f.services.execute.bind(f.services),seen:unknown[]=[]
  f.services.execute=async(command,signal)=>{if(command.action==='reconcile')seen.push(command.body);return original(command,signal)}
  await f.command('run',['--id','ordinary','--plan',f.plan.id,'--key','run'])
  await expect.poll(()=>f.store.get('run','ordinary')?.data.status,{timeout:7000}).toBe('awaiting_approval')
  let current=await f.services.read('runs','ordinary',{}) as {version:number}
  expect((await f.command('pause',['--id','ordinary','--version',String(current.version),'--key','pause'])).code).toBe(0)
  current=await f.services.read('runs','ordinary',{}) as {version:number}
  expect((await f.command('reconcile',['--id','ordinary','--version',String(current.version),'--key','inspect'])).code).toBe(0)
  current=await f.services.read('runs','ordinary',{}) as {version:number}
  expect((await f.command('reconcile',['--id','ordinary','--version',String(current.version),'--key','retry','--retry-push'])).code).toBe(0)
  expect(seen).toEqual([{expectedVersion:expect.any(Number),retryPush:false},{expectedVersion:expect.any(Number),retryPush:true}])
  expect(f.counts()).toEqual({implementations:1,reviews:0,checks:0})
}),30_000)
it('exposes needs_competency through the same planning status route without opening a host',trackedBody(async()=>{
  const f=await planningFixture();cleanup.push(()=>f.cleanup())
  const service=createDomainServices({...f.options,planning:new PlanningService(f.options),planningPolicy:async()=>f.policy})
  const {command}=await connect(f.base,f.corpus.root,f.store,service)
  const {teamId,requirements,...draft}=f.demand;requirements[0].competencies.stackIds=['swift']
  expect((await command('demand',['--input','-','--key','draft'],draft)).code).toBe(0)
  expect((await command('plan',['--demand',draft.id,'--input','-','--key','plan'],{expectedVersion:1,teamId,requirements})).code).toBe(0)
  await expect.poll(()=>f.store.eventsAfter(0).some(e=>e.type==='planning.competency_needed'),{timeout:7000}).toBe(true)
  const status=await command('status',['--resource','planning','--id',draft.id])
  expect(status.code).toBe(0);expect(status.value).toMatchObject({status:'needs_competency',gaps:[expect.objectContaining({competencyId:'swift'})]})
  expect(f.inputs).toEqual([])
}),30_000)
