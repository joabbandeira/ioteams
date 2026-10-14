import {expect,it} from 'vitest'
import {mkdtemp,readFile,realpath,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {initializeProduct} from '../../../apps/cli/src/index.js'
import {createOperationalFactories} from '../../../apps/cli/src/factories.js'
import {executionFixture} from '../runtime/execution.fixture.js'
it('composes native phase profiles, reuses only its own config and releases failed initialization without authentication',async()=>{
 const creating=executionFixture(),f=await creating,root=await realpath(await mkdtemp(join(tmpdir(),'ioteams-t15-factory-'))),home=join(root,'product')
 try{
  await initializeProduct({home,catalogRoot:f.source,checkoutRoots:[f.source,f.workspaceRoot],codexExecutable:await realpath(process.execPath)})
  const factories=await createOperationalFactories(home,[])
  for(const phase of ['implement','review'] as const){
   await expect(factories.createHost({runId:'r',attemptId:'a',policy:f.policy,taskId:f.plan.tasks[0].id,identity:{professionalId:f.plan.tasks[0].professionalId,role:'Developer'},phase})).rejects.toMatchObject({code:'UNSUPPORTED_VERSION'})
   const config=await readFile(join(home,'runtime','config.toml'),'utf8')
   expect(config).toContain('enabled = false');expect(config).toContain('approval_policy = "on-request"');expect(config).toContain('cli_auth_credentials_store = "file"')
   expect(config.includes('"src" = "write"')).toBe(phase==='implement')
   await expect(readFile(join(home,'runtime','.ioteams-server.lock'))).rejects.toMatchObject({code:'ENOENT'})
   await expect(readFile(join(home,'runtime','.ioteams-adapter.lock'))).rejects.toMatchObject({code:'ENOENT'})
   await expect(readFile(join(home,'runtime','auth.json'))).rejects.toMatchObject({code:'ENOENT'})
  }
 }finally{await f.cleanup();await rm(root,{recursive:true,force:true})}
},20_000)
it('rejects a native binary inside a served policy repository even when init did not list that repository',async()=>{
 const creating=executionFixture(),f=await creating,root=await realpath(await mkdtemp(join(tmpdir(),'ioteams-t15-factory-scope-'))),home=join(root,'product')
 const {copyFile,chmod,mkdir}=await import('node:fs/promises')
 try{
  const corpus=join(root,'corpus');await mkdir(corpus)
  const binary=join(f.source,'src','native');await copyFile(await realpath('/usr/bin/true'),binary);await chmod(binary,0o700)
  await initializeProduct({home,catalogRoot:corpus,checkoutRoots:[corpus],codexExecutable:binary})
  const factories=await createOperationalFactories(home,[])
  await expect(factories.createHost({runId:'r',attemptId:'a',policy:f.policy,taskId:f.plan.tasks[0].id,identity:{professionalId:f.plan.tasks[0].professionalId,role:'Developer'},phase:'implement'})).rejects.toMatchObject({code:'UNSAFE_EXECUTABLE'})
  await expect(factories.createCheckSandbox({policy:f.policy,taskId:f.plan.tasks[0].id})).rejects.toMatchObject({code:'UNSAFE_EXECUTABLE'})
  await expect(readFile(join(home,'runtime','config.toml'))).rejects.toMatchObject({code:'ENOENT'})
 }finally{await f.cleanup();await rm(root,{recursive:true,force:true})}
},20_000)
