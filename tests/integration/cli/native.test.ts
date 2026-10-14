import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { initializeProduct, runCli, type NativeRunner } from '../../../apps/cli/src/index.js'
const roots: string[]=[]
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
async function setup(){
  const root=await realpath(await mkdtemp(join(tmpdir(),'ioteams-t15-login-')));roots.push(root)
  const corpus=join(root,'corpus');await mkdir(corpus)
  const home=join(root,'product'),binary=await realpath(process.execPath)
  await initializeProduct({home,catalogRoot:corpus,checkoutRoots:[corpus],codexExecutable:binary})
  return {root,home,binary}
}
it('diagnoses and logs in only the dedicated native runtime without inference or secret output',async()=>{
  const f=await setup(),calls:{file:string;args:string[];env:NodeJS.ProcessEnv;cwd:string;interactive?:boolean}[]=[]
  const runner:NativeRunner=async(file,args,options)=>{
    calls.push({file,args,...options})
    if(args.includes('--version'))return {code:0,stdout:file==='/usr/bin/git'?'git version 2':'codex-cli 0.162.1'}
    if(args.includes('--help'))return {code:0,stdout:'app-server login'}
    return {code:0,stdout:'PRIVATE_NATIVE_AUTH_DIAGNOSTIC'}
  }
  let out='',err='';const io={stdout:(s:string)=>out+=s,stderr:(s:string)=>err+=s,stdin:async()=>'',nativeRunner:runner}
  expect(await runCli(['doctor','--home',f.home,'--json'],io)).toBe(0)
  expect(JSON.parse(out)).toMatchObject({status:'ready',checks:{authenticated:true,capabilities:true}})
  out='';expect(await runCli(['login','--home',f.home],io)).toBe(0);expect(JSON.parse(out)).toEqual({status:'authenticated'})
  expect(out+err).not.toContain('PRIVATE_NATIVE_AUTH_DIAGNOSTIC')
  for(const call of calls.filter(c=>c.file===f.binary)){
    expect(call.env.CODEX_HOME).toBe(join(f.home,'runtime'));expect(call.env.HOME).toBe(join(f.home,'runtime','home'))
    expect(call.env).not.toHaveProperty('OPENAI_API_KEY');expect(call.env).not.toHaveProperty('CODEX_THREAD_ID')
    expect(call.cwd).toBe(join(f.home,'runtime'));expect(call.args).not.toContain('exec');expect(call.args).not.toContain('turn/start')
  }
  expect(calls.find(c=>c.interactive)?.args).toEqual(['-c','cli_auth_credentials_store="file"','login'])
  expect(await runCli(['login','--home',f.home,'--device-auth'],io)).toBe(0)
  expect(calls.filter(c=>c.interactive).at(-1)?.args).toEqual(['-c','cli_auth_credentials_store="file"','login','--device-auth'])
})
it('preserves owner locks and prevents login over an active server or adapter',async()=>{
  const f=await setup();let called=false
  const runner:NativeRunner=async()=>{called=true;return {code:0,stdout:'codex-cli 0.162.1'}}
  const lock=join(f.home,'runtime','.ioteams-adapter.lock');await writeFile(lock,'foreign-lock',{mode:0o600})
  let err='';const io={stdout:()=>{},stderr:(s:string)=>err+=s,stdin:async()=>'',nativeRunner:runner}
  expect(await runCli(['login','--home',f.home],io)).toBe(4);expect(called).toBe(false)
  expect(await readFile(lock,'utf8')).toBe('foreign-lock')
})
it('retains login reservations until its exact native operation settles after interruption',async()=>{
  const f=await setup(),controller=new AbortController();let entered!:()=>void,release!:()=>void
  const active=new Promise<void>(resolve=>entered=resolve),held=new Promise<void>(resolve=>release=resolve)
  const runner:NativeRunner=async(_file,args,options)=>{
    if(options.interactive){entered();await held;throw new Error('fixture abort')}
    return {code:0,stdout:'codex-cli 0.162.1'}
  }
  const promise=runCli(['login','--home',f.home],{stdout:()=>{},stderr:()=>{},stdin:async()=>'',signal:controller.signal,nativeRunner:runner})
  await active;controller.abort()
  expect(await readFile(join(f.home,'runtime','.ioteams-server.lock'),'utf8')).toContain('ioteams-cli')
  release();expect(await promise).toBe(130)
  await expect(readFile(join(f.home,'runtime','.ioteams-server.lock'))).rejects.toMatchObject({code:'ENOENT'})
})
