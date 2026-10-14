import { expect,it } from 'vitest'
import {access,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {trackedBody,drainTestBodies} from '../../fixtures/runtime/test-lifetime.js'
import {repository} from '../../fixtures/runtime/repository.js'
it('registers early repository setup before cancellation and drains before removing its root',async()=>{
 let base:string|undefined,release!:()=>void
 const held=new Promise<void>(resolve=>release=resolve)
 const run=trackedBody(async()=>repository({afterRootCreated:async root=>{base=root;await held}}))
 const running=run();void running.catch(()=>{})
 let cleaned=false
 try{
  await expect.poll(()=>base).toBeDefined()
  const cleaning=drainTestBodies().then(()=>cleaned=true)
  await new Promise(resolve=>setImmediate(resolve));expect(cleaned).toBe(false);await access(base!)
  release();await expect(running).rejects.toMatchObject({name:'AbortError'});await cleaning
  await expect(access(base!)).rejects.toMatchObject({code:'ENOENT'})
 }finally{release();await running.catch(()=>{});await drainTestBodies()}
})
it('drains a whole late async body before resource deletion even after its signal is aborted',async()=>{
 let base:string|undefined,release!:()=>void
 const held=new Promise<void>(resolve=>release=resolve),writes:string[]=[]
 const run=trackedBody(async()=>{const f=await repository();base=f.base;await held;await writeFile(join(f.base,'late'),'owned');writes.push('finished')})
 const running=run();let cleaned=false
 try{
  await expect.poll(()=>base,{timeout:5000}).toBeDefined()
  const cleaning=drainTestBodies().then(()=>cleaned=true)
  await new Promise(resolve=>setImmediate(resolve));expect(cleaned).toBe(false);expect(writes).toEqual([])
  await access(base!);release();await running;await cleaning
  expect(writes).toEqual(['finished']);await expect(access(base!)).rejects.toMatchObject({code:'ENOENT'})
 }finally{release();await running.catch(()=>{});await drainTestBodies()}
})
it('drains a cancelled planning setup before closing resources acquired before the failure',async()=>{
 const {planningFixture}=await import('./planning.fixture.js')
 const controller=new AbortController();let release!:()=>void,entered=false,store:import('@ioteams/storage').Store|undefined,base:string|undefined
 const held=new Promise<void>(resolve=>release=resolve)
 const creating=planningFixture(undefined,undefined,{signal:controller.signal,afterResources:async state=>{store=state.store;base=state.base;entered=true;await held}})
 void creating.catch(()=>{});let cleaned=false
 try{
  await expect.poll(()=>entered,{timeout:5000}).toBe(true);controller.abort()
  const cleaning=creating.cleanup().then(()=>cleaned=true)
  await new Promise(resolve=>setImmediate(resolve));expect(cleaned).toBe(false);expect(store!.list('project')).toEqual([]);await access(base!)
  release();await expect(creating).rejects.toMatchObject({name:'AbortError'});await cleaning
  await expect(access(base!)).rejects.toMatchObject({code:'ENOENT'})
 }finally{release();await creating.catch(()=>{});await creating.cleanup()}
})
it('an independently triggered finished hook for a ready child waits for the late parent body',async()=>{
 const {planningFixture}=await import('./planning.fixture.js')
 const {finishFixtureLifetime}=await import('../../fixtures/runtime/test-lifetime.js')
 let release!:()=>void,child:Awaited<ReturnType<typeof planningFixture>>|undefined,finished=false,written=false
 const held=new Promise<void>(resolve=>release=resolve)
 const body=trackedBody(async()=>{child=await planningFixture();(await import('../../fixtures/runtime/repository.js')).currentFixtureLifetime()!.defer(()=>child!.cleanup());await held;await writeFile(join(child.base,'late-owner'),'owned');expect(child.store.list('project')).toHaveLength(1);written=true})
 const running=body();void running.catch(()=>{})
 try{
  await expect.poll(()=>child,{timeout:5000}).toBeDefined()
  const parentDrain=drainTestBodies()
  const childFinished=finishFixtureLifetime(child!.lifetime).then(()=>finished=true)
  await new Promise(resolve=>setImmediate(resolve));expect(finished).toBe(false)
  expect(child!.store.list('project')).toHaveLength(1);await access(child!.base)
  release();await running;await parentDrain;await childFinished;expect(written).toBe(true)
  await expect(access(child!.base)).rejects.toMatchObject({code:'ENOENT'})
 }finally{release();await running.catch(()=>{});await drainTestBodies();await child?.cleanup()}
})
it('cancels the exact owned subprocess and waits for close before removing its home',async()=>{
 const {fixtureSpawn}=await import('../../fixtures/runtime/repository.js')
 let base:string|undefined,owned:ReturnType<typeof fixtureSpawn>|undefined
 const body=trackedBody(async()=>{
  const f=await repository();base=f.base
  owned=fixtureSpawn(process.execPath,['-e',`const fs=require('node:fs');process.on('SIGTERM',()=>{fs.writeFileSync(process.argv[2],'ack');const t=setInterval(()=>{if(fs.existsSync(process.argv[3])){clearInterval(t);process.exit(0)}},5)});fs.writeFileSync(process.argv[1],'ready');setInterval(()=>{},1000)`,join(f.base,'ready'),join(f.base,'terminated'),join(f.base,'release')],{cwd:f.base,env:{PATH:process.env.PATH,HOME:f.base},stdio:'ignore'})
  await owned.closed
 })
 const running=body();let cleaned=false
 try{
  await expect.poll(()=>base?access(join(base,'ready')).then(()=>true).catch(()=>false):false,{timeout:5000}).toBe(true)
  const cleaning=drainTestBodies().then(()=>cleaned=true)
  await expect.poll(()=>access(join(base!,'terminated')).then(()=>true).catch(()=>false)).toBe(true)
  expect(cleaned).toBe(false);expect(()=>process.kill(owned!.child.pid!,0)).not.toThrow()
  await writeFile(join(base!,'release'),'release');await running;await cleaning
  expect(owned!.failure()?.name).toBe('AbortError');await expect(access(base!)).rejects.toMatchObject({code:'ENOENT'})
 }finally{const draining=drainTestBodies();if(base)await writeFile(join(base,'release'),'release').catch(()=>{});await running.catch(()=>{});await draining}
})
it('cancels setup after a readiness poll misses and never spawns a late child',async()=>{
 const {fixtureSpawn}=await import('../../fixtures/runtime/repository.js')
 let setupBase:string|undefined,release!:()=>void,spawned=false
 const held=new Promise<void>(resolve=>release=resolve)
 const running=trackedBody(async()=>{const f=await repository({afterRootCreated:async root=>{setupBase=root;await held}});fixtureSpawn(process.execPath,['-e','process.exit(0)'],{cwd:f.base});spawned=true})()
 void running.catch(()=>{})
 try{
  await expect.poll(()=>setupBase).toBeDefined()
  await expect(expect.poll(()=>spawned,{timeout:20,interval:5}).toBe(true)).rejects.toThrow()
 }finally{
  const draining=drainTestBodies();release();await running.catch(()=>{});await draining
 }
 expect(spawned).toBe(false);await expect(access(setupBase!)).rejects.toMatchObject({code:'ENOENT'})
})
it('refuses fixture spawn before any process effect if the owner is already aborted',async()=>{
 const {fixtureSpawn,currentFixtureLifetime}=await import('../../fixtures/runtime/repository.js')
 const running=trackedBody(async()=>{
  const f=await repository(),owner=currentFixtureLifetime()!;owner.controller.abort()
  expect(()=>fixtureSpawn(process.execPath,['-e','process.exit(0)'],{cwd:f.base})).toThrow()
 })()
 await running;await drainTestBodies()
})

it.each(['start','resume'] as const)('retains %s cancellation until every overlapping fixture operation settles',async method=>{
 const {fixtureExecFile,currentFixtureLifetime}=await import('../../fixtures/runtime/repository.js')
 const {mkdtemp,rm}=await import('node:fs/promises')
 const {tmpdir}=await import('node:os')
 const {dirname}=await import('node:path')
 const running=trackedBody(async()=>{
  const home=await mkdtemp(join(tmpdir(),'ioteams-signal-retention-'))
  currentFixtureLifetime()!.defer(()=>rm(home,{recursive:true,force:true}))
  const result=await fixtureExecFile(process.execPath,['--expose-gc','--import','tsx','tests/fixtures/runtime/signal-retention-probe.ts',method],{
   cwd:process.cwd(),encoding:'utf8',env:{PATH:dirname(process.execPath),HOME:home,NODE_NO_WARNINGS:'1'},timeout:5000,maxBuffer:65536,
  })
  expect(JSON.parse(result.stdout)).toEqual([
   {method,overlap:false,incomingCollected:false,propagated:true},
   {method,overlap:true,incomingCollected:false,propagated:true},
  ])
 })()
 try{await running}finally{await drainTestBodies()}
})
