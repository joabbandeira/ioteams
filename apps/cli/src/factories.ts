import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { bindNativeApprovalAuthority, createCodexHost, initializeRuntimeHome, verifyCodexExecutable } from '@ioteams/codex'
import { buildPermissionConfig, createNativeCheckSandbox, type ApprovedPolicy, type ExecutionHostRequest, type PlanningHostRequest } from '@ioteams/runtime'
import { canonical, fail, loadProduct, privateDirectory, reserve } from './state.js'
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
async function installConfig(home: string, config: string) {
  const path = join(home,'config.toml'), stamp = join(home,'.ioteams-cli-config.json')
  let previous: string | undefined
  try {
    const info=await lstat(path)
    if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.uid!==process.getuid?.()||info.mode&0o077)fail('UNOWNED_CONFIG',4)
    previous=await readFile(path,'utf8')
    if(previous!==config){
      const marker=await lstat(stamp)
      if(!marker.isFile()||marker.isSymbolicLink()||marker.nlink!==1||marker.uid!==process.getuid?.()||marker.mode&0o077||await readFile(stamp,'utf8')!==hash(previous))fail('UNOWNED_CONFIG',4)
    }
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'||previous!==undefined)throw error}
  for(const [target,text] of [[path,config],[stamp,hash(config)]]){
    let exists=false
    try{const info=await lstat(target);exists=true;if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.uid!==process.getuid?.()||info.mode&0o077)fail('UNOWNED_CONFIG',4)}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
    const file=await open(target,constants.O_WRONLY|constants.O_NOFOLLOW|(exists?0:constants.O_CREAT|constants.O_EXCL),0o600)
    try{await file.truncate(0);await file.writeFile(text);await file.sync()}finally{await file.close()}
  }
}
/** Trusted native composition, with no injectable module/command/fake hook in the CLI configuration. */
export async function createOperationalFactories(home: string, searchPath: string[], model?: string) {
  const config=await loadProduct(home)
  if(!config.codexExecutable)fail('CODEX_EXECUTABLE_REQUIRED',2)
  const executable=await verifyCodexExecutable(config.codexExecutable,config.checkoutRoots),runtimeHome=join(home,'runtime')
  let busy=false
  return {
    async createHost(request:PlanningHostRequest|ExecutionHostRequest,signal?:AbortSignal){
      if(busy)fail('OWNER_BUSY',4);busy=true
      let release:(()=>Promise<void>)|undefined,host:Awaited<ReturnType<typeof createCodexHost>>|undefined
      try{
        signal?.throwIfAborted();await executable.assertUnchanged()
        const policy=request.policy,roots=[...config.checkoutRoots,policy.snapshot.repository.root,policy.snapshot.workspaceRoot]
        await verifyCodexExecutable(executable.path,roots)
        await initializeRuntimeHome({runtimeHome,checkoutRoots:roots,nativeExecutable:executable})
        release=await reserve(join(runtimeHome,'.ioteams-server.lock'))
        try{await lstat(join(runtimeHome,'.ioteams-adapter.lock'));fail('OWNER_BUSY',4)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
        const profile=await buildPermissionConfig(policy,{taskId:request.taskId,phase:request.phase,runtimeHome})
        await installConfig(runtimeHome,profile.config)
        const authority=await bindNativeApprovalAuthority({plan:policy.snapshot.plan,taskId:request.taskId,phase:request.phase,
          cwd:policy.snapshot.workspaceRoot,runtimeHome,readRoots:policy.snapshot.toolReadRoots,
          protectedRoots:[policy.snapshot.repository.root,dirname(policy.file),...policy.snapshot.corpusRoots]})
        signal?.throwIfAborted();await executable.assertUnchanged()
        host=await createCodexHost({executable:executable.path,runtimeHome,cwd:policy.snapshot.workspaceRoot,runId:'runId' in request?request.runId:randomUUID(),
          permissionProfile:profile.name,trustedInstructionSources:profile.trustedInstructionSources,approvalAuthority:authority})
        const status=await host.status();if(status.requiresOpenaiAuth&&!status.authenticated)fail('AUTH_REQUIRED',3)
        const models=await host.models(),chosen=model??models.find(item=>!item.hidden)?.model
        if(!chosen)fail('MODEL_UNAVAILABLE',4);await host.selectModel(chosen);signal?.throwIfAborted()
        const native=host,unlock=release;let disposal:Promise<void>|undefined
        return {host:native,dispose(){return disposal??=(async()=>{await native.dispose();await unlock();busy=false})()}}
      }catch(error){await host?.dispose();await release?.();busy=false;throw error}
    },
    async createCheckSandbox(request:{policy:ApprovedPolicy;taskId:string},signal?:AbortSignal){
      signal?.throwIfAborted();await executable.assertUnchanged()
      await verifyCodexExecutable(executable.path,[...config.checkoutRoots,request.policy.snapshot.repository.root,request.policy.snapshot.workspaceRoot])
      await privateDirectory(join(home,'checks'));await canonical(join(home,'checks'))
      const runtimeHome=join(home,'checks',randomUUID());await mkdir(runtimeHome,{mode:0o700})
      await initializeRuntimeHome({runtimeHome,checkoutRoots:[...config.checkoutRoots,request.policy.snapshot.repository.root,request.policy.snapshot.workspaceRoot],protectedHomes:[join(home,'runtime')],nativeExecutable:executable})
      signal?.throwIfAborted()
      return createNativeCheckSandbox({...request,runtimeHome,codexExecutable:executable.path,searchPath})
    },
  }
}
