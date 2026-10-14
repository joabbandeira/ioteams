import {expect,it} from 'vitest'
import {spawn} from 'node:child_process'
import {mkdtemp,mkdir,readFile,lstat,realpath,rm,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {initializeProduct} from '../../../apps/cli/src/index.js'
function command(args:string[]){const child=spawn(process.execPath,['--import','tsx','apps/cli/src/main.ts',...args],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const done=new Promise<{code:number;stdout:string;stderr:string}>(resolve=>child.on('close',code=>resolve({code:code??1,stdout,stderr})));return {child,done,output:()=>stdout}}
it('starts an executable loopback launcher, publishes a private channel and drains/removes only its owned resources on SIGINT',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ioteams-t15-serve-'))),home=join(root,'product'),corpus=join(root,'corpus'),config=join(root,'serve.json')
 await mkdir(corpus);await initializeProduct({home,catalogRoot:corpus,checkoutRoots:[corpus],codexExecutable:await realpath(process.execPath)})
 await writeFile(config,JSON.stringify({version:1,bindings:[],searchPath:[]}),{mode:0o600})
 const server=command(['serve','--home',home,'--input',config,'--json'])
 try{
  await expect.poll(()=>server.output(),{timeout:7000}).toContain('listening')
  const channel=JSON.parse(await readFile(join(home,'connection.json'),'utf8'))
  expect(server.output()).not.toContain(channel.cookie);expect(server.output()).not.toContain(channel.csrfToken)
  const handoff=await readFile(join(home,'browser-access.html'),'utf8')
  expect((await lstat(join(home,'browser-access.html'))).mode&0o077).toBe(0)
  const secret=/value="([A-Za-z0-9_-]{43})"/.exec(handoff)![1]
  expect(server.output()).not.toContain(secret)
  const browser=await fetch(channel.origin+'/api/v1/session/browser',{method:'POST',headers:{origin:channel.origin,'content-type':'application/json'},body:JSON.stringify({secret})})
  expect(browser.status).toBe(200)
  const browserCookie=browser.headers.get('set-cookie')!.split(';')[0]
  expect((await fetch(channel.origin+'/api/v1/bindings',{headers:{cookie:browserCookie}})).status).toBe(200)
  const list=await command(['status','--home',home,'--resource','projects','--json']).done;expect(list.code).toBe(0);expect(JSON.parse(list.stdout)).toEqual([])
  expect((await command(['serve','--home',home,'--input',config,'--json']).done).code).toBe(4)
  server.child.kill('SIGINT');expect((await server.done).code).toBe(0)
  await expect(readFile(join(home,'browser-access.html'))).rejects.toMatchObject({code:'ENOENT'})
  await expect(readFile(join(home,'connection.json'))).rejects.toMatchObject({code:'ENOENT'})
  await expect(readFile(join(home,'.ioteams-product-owner.lock'))).rejects.toMatchObject({code:'ENOENT'})
 }finally{if(server.child.exitCode===null)server.child.kill('SIGTERM');await server.done;await rm(root,{recursive:true,force:true})}
},20_000)
