import { join } from 'node:path'
import { z } from 'zod'
import { ContentHashSchema,IdentifierSchema } from '@ioteams/core'
import { openStore } from '@ioteams/storage'
import { openKnowledge } from '@ioteams/knowledge'
import { createDomainServices } from '@ioteams/server'
import { ExecutionService,PlanningService,createWorkspace,loadPolicy,verifyWorkspace,verifyRepository,type Workspace,type ApprovedPolicy } from '@ioteams/runtime'
import { createOperationalFactories } from './factories.js'
import { startCliServer } from './launcher.js'
import { canonical,CliError,fail,loadProduct,readPrivateJson } from './state.js'
const ServeSchema=z.strictObject({version:z.literal(1),bindings:z.array(z.strictObject({demandId:IdentifierSchema,policyFile:z.string(),approvedHash:ContentHashSchema})).max(100),
  searchPath:z.array(z.string()).max(30),model:z.string().min(1).optional(),port:z.number().int().min(0).max(65535).optional()})
export async function serve(home:string,file:string,signal:AbortSignal|undefined,onListening:(origin:string)=>void){
  const config=await loadProduct(home),input=ServeSchema.parse(await readPrivateJson(file))
  const policies=new Map<string,ApprovedPolicy>()
  for(const binding of input.bindings){
    if(policies.has(binding.demandId))fail('DUPLICATE_BINDING',2)
    const policy=await loadPolicy(binding.policyFile,binding.approvedHash)
    if(!policy.snapshot.corpusRoots.includes(config.catalogRoot))fail('UNDECLARED_CORPUS',2)
    policies.set(binding.demandId,policy)
  }
  for(const path of input.searchPath)await canonical(path)
  signal?.throwIfAborted()
  const server=await startCliServer(home,async()=>{
    const factories=await createOperationalFactories(home,input.searchPath,input.model)
    const store=openStore({directory:join(home,'operations'),checkoutRoots:config.checkoutRoots})
    let index:ReturnType<typeof openKnowledge>
    try{index=openKnowledge({directory:join(home,'knowledge'),checkoutRoots:config.checkoutRoots})}catch(error){store.close();throw error}
    const workspaces=new Map<string,{pending:Promise<Workspace>;phase:'preflight'|'creating'|'owned'}>()
    async function workspaceFor(policy:ApprovedPolicy){
      const root=policy.snapshot.workspaceRoot
      let entry=workspaces.get(root)
      if(!entry){
        const owned:{pending:Promise<Workspace>;phase:'preflight'|'creating'|'owned'}={pending:Promise.resolve(undefined as unknown as Workspace),phase:'preflight'}
        owned.pending=(async()=>{
          // A failure here is proven to precede any createWorkspace/lease effect.
          await verifyRepository(policy.snapshot.repository,{clean:true})
          owned.phase='creating'
          const workspace=await createWorkspace(policy);owned.phase='owned';return workspace
        })()
        entry=owned;workspaces.set(root,entry)
      }
      const workspace=await entry.pending;await workspace.assertOwned();return workspace
    }
    const planning=new PlanningService({store,index,catalogRoot:config.catalogRoot,createHost:factories.createHost})
    const execution=new ExecutionService({store,createHost:factories.createHost,createCheckSandbox:factories.createCheckSandbox})
    const services=createDomainServices({store,index,catalogRoot:config.catalogRoot,planning,execution,policyDirectory:join(home,'policies'),
      async planningPolicy(id){const policy=policies.get(id);if(!policy)fail('POLICY_BINDING_REQUIRED',4);await workspaceFor(policy);return policy},
      async executionContext(planId){
        const record=store.get('approvedPlan',planId);if(!record)fail('APPROVED_PLAN_REQUIRED',4)
        const policy=await loadPolicy(join(home,'policies',`${record.data.plan.policyHash}.policy.json`),record.data.plan.policyHash)
        // Only a workspace owned in THIS process may be reused. Existing directories/locks after restart are uncertainty.
        const workspace=await workspaceFor(policy)
        await verifyWorkspace(policy,workspace,{expectedSha:workspace.repository.head})
        return {policy,workspace}
      },
    })
    return {options:{store,services,port:input.port},async dispose(){
      const errors:unknown[]=[]
      for(const entry of workspaces.values()){
        const result=await Promise.allSettled([entry.pending])
        if(result[0].status==='fulfilled'){try{await result[0].value.release()}catch(error){errors.push(error)}}
        else if(entry.phase!=='preflight')errors.push(result[0].reason)
      }
      try{index.close()}catch(error){errors.push(error)}
      try{store.close()}catch(error){errors.push(error)}
      if(errors.length)throw Object.assign(new CliError('SHUTDOWN_UNCERTAIN',4),{cause:new AggregateError(errors)})
    }}
  })
  try{
    onListening(server.origin)
    if(!signal)await new Promise<void>(()=>{})
    else if(!signal.aborted)await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}))
  }finally{await server.close()}
  return {status:'stopped'}
}
