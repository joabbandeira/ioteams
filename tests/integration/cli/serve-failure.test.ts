import {afterEach,expect,it,vi} from 'vitest'
import {mkdir,readFile,writeFile,access} from 'node:fs/promises'
import {join} from 'node:path'
import {openStore} from '@ioteams/storage'
import {preparePolicy,approvePolicy,inspectRepository} from '@ioteams/runtime'
import {initializeProduct,runCli} from '../../../apps/cli/src/index.js'
import {repository} from '../../fixtures/runtime/repository.js'
import {trackedBody,drainTestBodies} from '../../fixtures/runtime/test-lifetime.js'
import * as knowledge from '@ioteams/knowledge'
import {Store} from '../../../packages/storage/src/store.js'
afterEach(async()=>{await drainTestBodies();vi.restoreAllMocks()})
it('closes banks/channel/product reservation after a verified pre-lease workspace setup failure without adopting a writer',trackedBody(async()=>{
 const f=await repository(),home=join(f.base,'product'),corpus=join(f.base,'corpus');await mkdir(corpus)
 await initializeProduct({home,catalogRoot:corpus,checkoutRoots:[f.source],codexExecutable:await import('node:fs/promises').then(fs=>fs.realpath(process.execPath))})
 const snapshot=await preparePolicy({plan:f.plan,repository:await inspectRepository(f.source,'origin'),workspaceRoot:f.workspaceRoot,trustedInstructions:[],corpusRoots:[corpus]})
 const policy=await approvePolicy(snapshot,snapshot.plan.policyHash,join(home,'policies'))
 const config=join(f.base,'serve.json');await writeFile(config,JSON.stringify({version:1,bindings:[{demandId:'d',policyFile:policy.file,approvedHash:policy.snapshot.plan.policyHash}],searchPath:[]}),{mode:0o600})
 await writeFile(join(f.source,'src/main.ts'),'dirty source')
 const opened:knowledge.KnowledgeIndex[]=[],openIndex=knowledge.openKnowledge
 vi.spyOn(knowledge,'openKnowledge').mockImplementation(options=>{const index=openIndex(options);opened.push(index);return index})
 const closeStore=vi.spyOn(Store.prototype,'close')
 let output='',errors='';const controller=new AbortController(),io={stdout:(s:string)=>output+=s,stderr:(s:string)=>errors+=s,stdin:async()=>'',signal:controller.signal}
 const serving=runCli(['serve','--home',home,'--input',config,'--json'],io)
 try{
  await expect.poll(()=>output,{timeout:5000}).toContain('listening')
  const {createCliClient}=await import('../../../apps/cli/src/index.js');const client=await createCliClient(home)
  await client.request('POST','/api/v1/projects',{id:f.plan.projectId,name:'Fixture',repositoryPath:f.source},'project')
  await client.request('POST','/api/v1/demands',{id:'d',projectId:f.plan.projectId,goal:'Fixture'},'demand')
  await client.request('POST','/api/v1/demands/d/plan',{expectedVersion:1,teamId:'lisa',requirements:[{taskId:'task-1',competencies:{professionIds:['development'],stackIds:['git']}}]},'plan')
  await expect.poll(()=>client.request('GET','/api/v1/demands/d/planning'),{timeout:5000}).toMatchObject({status:'blocked'})
  controller.abort();expect(await serving).toBe(0)
  await expect(access(join(home,'connection.json'))).rejects.toMatchObject({code:'ENOENT'})
  await expect(access(join(home,'.ioteams-product-owner.lock'))).rejects.toMatchObject({code:'ENOENT'})
  await expect(access(join(f.source,'.git','ioteams-writer.lock'))).rejects.toMatchObject({code:'ENOENT'})
  expect(closeStore).toHaveBeenCalledTimes(1);expect(opened).toHaveLength(1)
  await expect(knowledge.searchKnowledge(opened[0],{query:'fixture'})).rejects.toThrow('fechado')
  const store=openStore({directory:join(home,'operations'),checkoutRoots:[f.source]});store.close()
 }finally{controller.abort();await serving}
}))
