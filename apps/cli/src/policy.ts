import {mkdir,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {z} from 'zod'
import {ContentHashSchema,ExecutionPlanSchema} from '@ioteams/core'
import {approvePolicy,inspectRepository,loadPolicy,preparePolicy,verifyRepository,RuntimePolicyError,type PolicySnapshot} from '@ioteams/runtime'
import {CliError,fail,offline,privateDirectory,readPrivateJson} from './state.js'
const EnvelopeSchema=z.strictObject({plan:ExecutionPlanSchema,repositoryPath:z.string(),workspaceRoot:z.string(),
 trustedInstructions:z.array(z.strictObject({path:z.string(),kind:z.enum(['instructions','configuration']),contentHash:ContentHashSchema})),
 toolReadRoots:z.array(z.string()).default([]),corpusRoots:z.array(z.string()).default([])})
async function proposalDirectory(home:string){
 const directory=join(home,'policies','proposals')
 try{await mkdir(directory,{mode:0o700})}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error}
 await privateDirectory(directory);return directory
}
async function checkedProposal(home:string,hash:string):Promise<PolicySnapshot>{
 ContentHashSchema.parse(hash)
 let raw:unknown
 try{raw=await readPrivateJson(join(home,'policies','proposals',`${hash}.json`))}catch(error){if(error instanceof CliError)throw error;return fail('POLICY_PROPOSAL_UNAVAILABLE',4)}
 const value=z.object({version:z.literal(1)}).passthrough().parse(raw),{version:_,...input}=value
 const prepared=await preparePolicy(input)
 if(prepared.plan.policyHash!==hash)fail('POLICY_CHANGED',4)
 await verifyRepository(prepared.repository,{clean:true})
 return prepared
}
function policyError(error:unknown):never{
 if(error instanceof CliError||error instanceof z.ZodError)throw error
 return fail('POLICY_CONFLICT',4)
}
/** Pure proposal plus private immutable persistence; no writer/model/process creation. */
export async function proposeInitialPolicy(home:string,raw:unknown){
 return offline(home,async()=>{
  try{
   const input=EnvelopeSchema.parse(raw),repository=await inspectRepository(input.repositoryPath,input.plan.remote)
   await verifyRepository(repository,{clean:true})
   const snapshot=await preparePolicy({plan:input.plan,repository,workspaceRoot:input.workspaceRoot,trustedInstructions:input.trustedInstructions,toolReadRoots:input.toolReadRoots,corpusRoots:input.corpusRoots})
   const directory=await proposalDirectory(home),hash=snapshot.plan.policyHash
   try{await writeFile(join(directory,`${hash}.json`),JSON.stringify(snapshot),{flag:'wx',mode:0o400})}
   catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;await checkedProposal(home,hash)}
   return {status:'proposed',hash,snapshot}
  }catch(error){return policyError(error)}
 })
}
export async function reviewInitialPolicy(home:string,hash:string){
 return offline(home,async()=>{try{const snapshot=await checkedProposal(home,hash);return {status:'proposed',hash,snapshot}}catch(error){return policyError(error)}})
}
/** Only this explicit operator command authorizes the exact reviewed hash. JSON existence is never approval. */
export async function approveInitialPolicy(home:string,hash:string){
 return offline(home,async()=>{
  try{
   const snapshot=await checkedProposal(home,hash)
   let policy
   try{policy=await approvePolicy(snapshot,hash,join(home,'policies'))}
   catch(error){
    if(!(error instanceof RuntimePolicyError)||error.code!=='POLICY_EXISTS')throw error
    policy=await loadPolicy(join(home,'policies',`${hash}.policy.json`),hash)
   }
   await loadPolicy(policy.file,hash)
   return {status:'approved',hash,policyFile:policy.file}
  }catch(error){return policyError(error)}
 })
}
