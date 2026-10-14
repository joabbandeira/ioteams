import { afterEach, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore } from '@ioteams/storage'
import { openKnowledge } from '@ioteams/knowledge'
import { createDomainServices, createLocalServer } from '../../../apps/server/src/index.js'
import { initializeProduct, startCliServer } from '../../../apps/cli/src/index.js'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
const run = (args: string[], input?: string) => new Promise<{code:number;stdout:string;stderr:string}>(resolve => {
  const { spawn } = requireSpawn
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/cli/src/main.ts', ...args], { stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout='', stderr=''; child.stdout.on('data', b=>stdout+=b); child.stderr.on('data', b=>stderr+=b)
  child.on('close',code=>resolve({code:code??1,stdout,stderr})); child.stdin.end(input)
})
import * as requireSpawn from 'node:child_process'
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ioteams-t15-cli-'))); cleanup.push(()=>rm(root,{recursive:true,force:true}))
  const corpus = join(root,'corpus'); await mkdir(corpus)
  const home = join(root,'product'); await initializeProduct({ home, catalogRoot: corpus, checkoutRoots: [corpus] })
  const store = openStore({memory:true}), index = openKnowledge({memory:true})
  const services = createDomainServices({store,index,catalogRoot:corpus})
  const server = await startCliServer(home,{store,services}), origin=server.origin
  cleanup.push(async()=>{await server.close();store.close();index.close()})
  return {home,store,origin,root}
}
it('executes subprocess commands through the authenticated API with strict schemas, idempotency and safe errors', async()=>{
  const f=await setup(), args=['--home',f.home,'--json']
  const project={id:'p',name:'Fixture',repositoryPath:'/fixture'}
  const create=()=>run(['project',...args,'--key','create-p','--input','-'],JSON.stringify(project))
  const first=await create(); expect(first.code).toBe(0);expect(JSON.parse(first.stdout)).toMatchObject({version:1,data:project})
  expect((await create()).stdout).toBe(first.stdout);expect(f.store.list('project')).toHaveLength(1)
  const status=await run(['status',...args,'--resource','projects']);expect(status.code).toBe(0);expect(JSON.parse(status.stdout)).toHaveLength(1)
  const invalid=await run(['project',...args,'--key','bad','--input','-'],JSON.stringify({...project,id:'q',secret:'PRIVATE_MARKER'}))
  expect(invalid.code).toBe(2);expect(invalid.stdout+invalid.stderr).not.toContain('PRIVATE_MARKER')
  const session=await readFile(join(f.home,'connection.json'),'utf8')
  for(const value of Object.values(JSON.parse(session))) if(typeof value==='string'&&value.length>30) expect(first.stdout+status.stdout+invalid.stderr).not.toContain(value)
  const conflict=await run(['project',...args,'--key','create-p','--input','-'],JSON.stringify({...project,name:'Changed'}));expect(conflict.code).toBe(4)
  const offline=await run(['index',...args,'--sha','a'.repeat(40)]);expect(offline.code).toBe(4)
})
it('initializes only explicit product state and rejects aliases and existing unowned directories',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'ioteams-t15-init-')));cleanup.push(()=>rm(root,{recursive:true,force:true}))
  const corpus=join(root,'corpus');await mkdir(corpus)
  const home=join(root,'product')
  const created=await run(['init','--home',home,'--corpus',corpus,'--json']);expect(created.code).toBe(0)
  expect(JSON.parse(created.stdout)).toEqual({status:'initialized'})
  const {symlink}=await import('node:fs/promises');await symlink(home,join(root,'alias'))
  expect((await run(['init','--home',join(root,'alias'),'--corpus',corpus])).code).not.toBe(0)
  await mkdir(join(root,'unowned'));await writeFile(join(root,'unowned','marker'),'untouched')
  expect((await run(['init','--home',join(root,'unowned'),'--corpus',corpus])).code).not.toBe(0)
  expect(await readFile(join(root,'unowned','marker'),'utf8')).toBe('untouched')
})
it('rejects remote or publicly readable session files before sending credentials',async()=>{
  const f=await setup(),file=join(f.home,'connection.json'),session=JSON.parse(await readFile(file,'utf8'))
  await writeFile(file,JSON.stringify({...session,origin:'https://example.invalid'}))
  const remote=await run(['status','--home',f.home,'--json']);expect(remote.code).toBe(2)
  expect(remote.stdout+remote.stderr).not.toContain(session.csrfToken)
  await writeFile(file,JSON.stringify(session));const {chmod}=await import('node:fs/promises');await chmod(file,0o644)
  const exposed=await run(['status','--home',f.home,'--json']);expect(exposed.code).toBe(4)
  expect(exposed.stdout+exposed.stderr).not.toContain(session.cookie)
})
