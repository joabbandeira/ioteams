import {expect,it} from 'vitest'
import {EventEmitter} from 'node:events'
import {partitionTestFiles,runVitest} from '../../../scripts/test-runner.js'
it('partitions every discovered test file exactly once, including new files, without dropping coverage',()=>{
 const files=['tests/unit/new.test.ts','tests/integration/runtime/execution.test.ts','tests/integration/runtime/new.test.ts','tests/integration/server/new.test.ts','tests/integration/cli/new.test.ts','tests/integration/knowledge/new.test.ts']
 const groups=partitionTestFiles(files),all=Object.values(groups).flat()
 expect(all.sort()).toEqual(files.sort());expect(new Set(all).size).toBe(files.length)
 expect(groups['runtime-execution']).toContain('tests/integration/runtime/execution.test.ts')
})
it('waits for close after exit, propagates failures and forwards a signal only to its exact live child',async()=>{
 const child=Object.assign(new EventEmitter(),{exitCode:null as number|null,signalCode:null as string|null,kill:(signal:string)=>{kills.push(signal);return true}})
 const signals=new EventEmitter(),kills:string[]=[];let done=false
 const run=runVitest(['test'],{spawn:()=>child,signals}).then(result=>{done=true;return result})
 signals.emit('SIGINT');expect(kills).toEqual(['SIGINT'])
 child.exitCode=2;child.emit('exit',2,null);await Promise.resolve();expect(done).toBe(false)
 signals.emit('SIGTERM');expect(kills).toEqual(['SIGINT'])
 child.emit('close',2,null);expect(await run).toBe(2);expect(signals.listenerCount('SIGINT')).toBe(0)
})
it('preserves native signal termination instead of reporting success',async()=>{
 const child=Object.assign(new EventEmitter(),{exitCode:null,signalCode:null,kill:()=>true}),signals=new EventEmitter()
 const run=runVitest(['test'],{spawn:()=>child,signals});child.emit('close',null,'SIGTERM')
 expect(await run).toBe(143)
})
