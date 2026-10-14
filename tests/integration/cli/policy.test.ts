import {afterEach,expect,it} from 'vitest'
import {mkdir,readFile,readdir,writeFile,chmod} from 'node:fs/promises'
import {join} from 'node:path'
import {initializeProduct,runCli} from '../../../apps/cli/src/index.js'
import {repository,git} from '../../fixtures/runtime/repository.js'
import {trackedBody,drainTestBodies} from '../../fixtures/runtime/test-lifetime.js'
const cleanup:(()=>Promise<void>)[]=[]
afterEach(async()=>{await drainTestBodies();for(const close of cleanup.splice(0).reverse())await close()})
async function setup(){
 const f=await repository(),home=join(f.base,'product');await initializeProduct({home,catalogRoot:f.source,checkoutRoots:[f.source]})
 let stdout='',stderr='';const io={stdout:(s:string)=>stdout+=s,stderr:(s:string)=>stderr+=s,stdin:async()=>''}
 const invoke=async(command:string,args:string[])=>{stdout='';stderr='';const code=await runCli([command,'--home',home,'--json',...args],io);return {code,stdout,stderr,value:stdout?JSON.parse(stdout):undefined}}
 const input=join(f.base,'envelope.json');await writeFile(input,JSON.stringify({plan:f.plan,repositoryPath:f.source,workspaceRoot:f.workspaceRoot,trustedInstructions:[],corpusRoots:[f.source]}),{mode:0o600})
 return {...f,home,input,invoke}
}
it('proposes/reviews and explicitly approves the exact initial policy hash without launching a writer or authentication',trackedBody(async()=>{
 const f=await setup(),proposal=await f.invoke('policy-propose',['--input',f.input]);expect(proposal.code).toBe(0)
 const hash=proposal.value.hash;expect(hash).toMatch(/^[a-f0-9]{64}$/);expect(proposal.value.snapshot.repository.head).toBe(f.plan.baseSha)
 expect((await f.invoke('policy-review',['--hash',hash])).value).toEqual(proposal.value)
 expect((await f.invoke('policy-approve',['--hash','f'.repeat(64)])).code).toBe(4)
 const approved=await f.invoke('policy-approve',['--hash',hash]);expect(approved.code).toBe(0)
 const {loadPolicy}=await import('@ioteams/runtime');expect((await loadPolicy(approved.value.policyFile,hash)).snapshot.plan.policyHash).toBe(hash)
 expect(await readdir(join(f.home,'operations'))).toEqual([])
 await expect(readFile(join(f.source,'.git','ioteams-writer.lock'))).rejects.toMatchObject({code:'ENOENT'})
}))
it.each(['tamper','branch','sha'] as const)('refuses %s after policy review without authorizing changed state',trackedBody(async fault=>{
 const f=await setup(),proposal=await f.invoke('policy-propose',['--input',f.input]);expect(proposal.code).toBe(0);const hash=proposal.value.hash
 if(fault==='tamper'){const file=join(f.home,'policies','proposals',hash+'.json');await chmod(file,0o600);const data=JSON.parse(await readFile(file,'utf8'));data.plan.goal='changed';await writeFile(file,JSON.stringify(data))}
 if(fault==='branch')await git(f.source,'checkout','-b','changed')
 if(fault==='sha'){await writeFile(join(f.source,'src/main.ts'),'changed');await git(f.source,'add','src');await git(f.source,'commit','-m','changed')}
 expect((await f.invoke('policy-approve',['--hash',hash])).code).toBe(4)
 await expect(readFile(join(f.home,'policies',hash+'.policy.json'))).rejects.toMatchObject({code:'ENOENT'})
}))
it('rejects mismatched source identity and respects an existing offline owner without removing its lock',trackedBody(async()=>{
 const f=await setup();const payload=JSON.parse(await readFile(f.input,'utf8'));payload.plan.baseSha='f'.repeat(40);await writeFile(f.input,JSON.stringify(payload))
 expect((await f.invoke('policy-propose',['--input',f.input])).code).not.toBe(0)
 const lock=join(f.home,'.ioteams-product-owner.lock');await writeFile(lock,'foreign',{mode:0o600})
 expect((await f.invoke('policy-propose',['--input',f.input])).code).toBe(4);expect(await readFile(lock,'utf8')).toBe('foreign')
}))
it('confirms a persisted exact approval after stdout loss without another write and refuses a divergent approved file',trackedBody(async()=>{
 const f=await setup(),proposal=await f.invoke('policy-propose',['--input',f.input]);expect(proposal.code).toBe(0);const hash=proposal.value.hash
 expect(await runCli(['policy-approve','--home',f.home,'--hash',hash],{stdout:()=>{throw new Error('fixture stdout lost')},stderr:()=>{},stdin:async()=>''})).toBe(1)
 const file=join(f.home,'policies',hash+'.policy.json'),{stat}=await import('node:fs/promises'),before=await stat(file)
 const confirmed=await f.invoke('policy-approve',['--hash',hash]);expect(confirmed.code).toBe(0);expect(confirmed.value).toMatchObject({status:'approved',hash,policyFile:file})
 const after=await stat(file);expect(after.ino).toBe(before.ino);expect(after.mtimeMs).toBe(before.mtimeMs)
 expect((await readdir(join(f.home,'policies'))).filter(name=>name.endsWith('.policy.json'))).toHaveLength(1)
 await chmod(file,0o600);const bad=JSON.parse(await readFile(file,'utf8'));bad.plan.goal='divergent';await writeFile(file,JSON.stringify(bad))
 expect((await f.invoke('policy-approve',['--hash',hash])).code).toBe(4);expect(JSON.parse(await readFile(file,'utf8')).plan.goal).toBe('divergent')
}))
