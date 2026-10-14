import {readdir} from 'node:fs/promises'
import {spawn as nativeSpawn,type SpawnOptions} from 'node:child_process'
import {EventEmitter} from 'node:events'
import {constants} from 'node:os'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
export const shardNames=['core','codex','runtime-execution','runtime-policy','server','cli'] as const
export type Shard=typeof shardNames[number]
export async function discoverTests(root:string,subsets:readonly string[]=['unit','integration']):Promise<string[]>{
 const files:string[]=[]
 async function visit(relative:string){
  for(const entry of await readdir(`${root}/${relative}`,{withFileTypes:true})){
   const path=`${relative}/${entry.name}`
   if(entry.isSymbolicLink())throw new Error('Test enumeration refuses symlinks')
   if(entry.isDirectory())await visit(path)
   else if(entry.isFile()&&/\.test\.ts$/.test(entry.name))files.push(path)
  }
 }
 for(const subset of subsets)await visit(`tests/${subset}`)
 return files.sort()
}
export function partitionTestFiles(files:readonly string[]):Record<Shard,string[]>{
 const result=Object.fromEntries(shardNames.map(name=>[name,[]])) as unknown as Record<Shard,string[]>
 for(const file of files){
  const name:Shard=/^tests\/(?:unit|integration)\/codex\//.test(file)?'codex':file.startsWith('tests/integration/cli/')?'cli':file.startsWith('tests/integration/server/')?'server':
   file.startsWith('tests/integration/runtime/')?/\/(?:execution|checks|check-ownership)[^/]*\.test\.ts$/.test(file)?'runtime-execution':'runtime-policy':'core'
  result[name].push(file)
 }
 return result
}
interface Child extends EventEmitter{exitCode:number|null;signalCode:string|null;kill(signal:string):boolean}
interface Dependencies{spawn?(executable:string,args:string[],options:SpawnOptions):Child;signals?:EventEmitter;cwd?:string}
export function runVitest(files:readonly string[],dependencies:Dependencies={}):Promise<number>{
 const spawn=dependencies.spawn??nativeSpawn,signals=dependencies.signals??process
 const child=spawn(process.execPath,[createRequire(import.meta.url).resolve('vitest/vitest.mjs'),'run',...files],{cwd:dependencies.cwd,stdio:'inherit'})
 return new Promise(resolve=>{
  let failed=false,exited=false
  const forward=(signal:'SIGINT'|'SIGTERM')=>{if(!exited&&child.exitCode===null&&child.signalCode===null)try{child.kill(signal)}catch{failed=true;console.error('Unable to signal owned test process')}}
  const interrupt=()=>forward('SIGINT'),terminate=()=>forward('SIGTERM')
  signals.on('SIGINT',interrupt);signals.on('SIGTERM',terminate)
  child.once('exit',()=>{exited=true})
  child.once('error',()=>{failed=true;console.error('Unable to start test process')})
  child.once('close',(code:number|null,signal:string|null)=>{
   signals.removeListener('SIGINT',interrupt);signals.removeListener('SIGTERM',terminate)
   resolve(failed?1:code??(signal?128+(constants.signals[signal as NodeJS.Signals]??1):1))
  })
 })
}
