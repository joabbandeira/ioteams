import { getCurrentTest,type Test } from '@vitest/runner'
import { FixtureLifetime,currentFixtureLifetime } from './repository.js'
let fixtureNumber=0
const bodies=new Map<string,Set<FixtureLifetime>>()
const parents=new WeakMap<FixtureLifetime,FixtureLifetime>()
export async function finishFixtureLifetime(lifetime:FixtureLifetime){
 const owners:FixtureLifetime[]=[]
 for(let parent=parents.get(lifetime);parent;parent=parents.get(parent))owners.unshift(parent)
 // Await bodies, never ancestor cleanup (which may itself dispose this child).
 for(const owner of owners)await owner.drain()
 await lifetime.cleanup()
}
export function testFixtureLifetime(signal?:AbortSignal){
 const test=getCurrentTest<Test|undefined>(),id=++fixtureNumber
 const observer=process.env.IOTEAMS_FIXTURE_TIMINGS==='1'?(phase:string,ms:number,outcome:string)=>{
  console.error('[fixture-timing]',JSON.stringify({pid:process.pid,id,test:test?.name,phase,ms:Math.round(ms),outcome}))
 }:undefined
 const signals=[signal,test?.context.signal,currentFixtureLifetime()?.signal].filter((s):s is AbortSignal=>!!s)
 const lifetime=new FixtureLifetime(signals.length?AbortSignal.any(signals):undefined,observer)
 const parent=currentFixtureLifetime();if(parent)parents.set(lifetime,parent)
 test?.context.onTestFinished(()=>finishFixtureLifetime(lifetime))
 return lifetime
}
/** Register before invoking the body, including the first await of setup. */
export function trackedBody<A extends unknown[],R>(body:(...args:A)=>Promise<R>):(...args:A)=>Promise<R>{
 return (...args)=>{
  const test=getCurrentTest<Test|undefined>()
  if(!test)throw new Error('Tracked bodies require a running test')
  const lifetime=testFixtureLifetime(),owners=bodies.get(test.id)??new Set<FixtureLifetime>()
  owners.add(lifetime);bodies.set(test.id,owners)
  return lifetime.run(()=>body(...args),'body')
 }
}
/** Call before legacy afterEach disposal. Cleanup waits for body + exact children to close. */
export async function drainTestBodies(){
 const test=getCurrentTest<Test|undefined>()
 if(!test)return
 const owners=bodies.get(test.id)
 if(!owners)return
 for(const owner of owners)await owner.cleanup()
 bodies.delete(test.id)
}
/** Framework cancellation releases only synthetic test barriers, never an OS writer or lease. */
export function fixtureRelease(release:()=>void):()=>void{
 const test=getCurrentTest<Test|undefined>(),signal=test?.context.signal
 if(signal?.aborted)release()
 else signal?.addEventListener('abort',release,{once:true})
 test?.context.onTestFinished(()=>signal?.removeEventListener('abort',release))
 return release
}
export async function testAwait<T>(work:Promise<T>):Promise<T>{
 const signal=getCurrentTest<Test|undefined>()?.context.signal
 if(!signal)return work
 signal.throwIfAborted()
 let abort!:()=>void
 const cancelled=new Promise<never>((_resolve,reject)=>{abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true})})
 try{return await Promise.race([work,cancelled])}finally{signal.removeEventListener('abort',abort)}
}
