import type { Model } from '../../../packages/codex/protocol/generated/v2/Model.js'
import type { Turn } from '../../../packages/codex/protocol/generated/v2/Turn.js'
import type { ThreadStartResponse } from '../../../packages/codex/protocol/generated/v2/ThreadStartResponse.js'
import type { ThreadStartParams } from '../../../packages/codex/protocol/generated/v2/ThreadStartParams.js'
export const fixtureModel:Model={id:'catalog-id',model:'fixture-model',upgrade:null,upgradeInfo:null,availabilityNux:null,displayName:'Fixture',description:'No inference',modelSpecialty:null,hidden:false,supportedReasoningEfforts:[],defaultReasoningEffort:'medium',inputModalities:['text'],supportsPersonality:false,multiAgentVersion:null,additionalSpeedTiers:[],serviceTiers:[],defaultServiceTier:null,availableAccessPrograms:null,isDefault:true}
export function fixtureTurn(status:Turn['status']):Turn {
 return {id:'turn-1',rootTurnId:null,items:[],itemsView:'full',status,error:status==='failed'?{message:'fixture failure',codexErrorInfo:null,additionalDetails:null,misalignment:null}:null,startedAt:null,completedAt:null,durationMs:null}
}
export function fixtureThread(params:ThreadStartParams,mode:string):ThreadStartResponse {
 const cwd=params.cwd!
 return {
  thread:{id:'thread-1',turns:[],createdAt:1,updatedAt:1,preview:'',ephemeral:false,modelProvider:'fixture',path:null,cwd,cliVersion:'0.162.1',source:'appServer',status:{type:'idle'},gitInfo:null,name:null,agentNickname:null,agentRole:null,projectId:null,sessionId:'session-1',environments:[],extra:null,forkedFromId:null,parentThreadId:null,section:null,sectionEnteredAt:null,historyMode:'legacy',model:params.model??null,reasoningEffort:null,recencyAt:null,originator:'ioteams',canAcceptDirectInput:true,threadSource:null,daybreakEnabled:null},
  model:mode==='changed-model'?'other':params.model!,modelProvider:'fixture',serviceTier:null,disabledPluginIds:[],cwd,runtimeWorkspaceRoots:[cwd],instructionSources:mode==='instructions'?['/untrusted/AGENTS.md']:[],approvalPolicy:mode==='changed-policy'?'never':'on-request',approvalsReviewer:'user',sandbox:{type:'workspaceWrite',writableRoots:[cwd],networkAccess:false,excludeTmpdirEnvVar:true,excludeSlashTmp:true},activePermissionProfile:{id:mode==='changed-profile'?'other':params.permissions!,extends:null},reasoningEffort:'medium',multiAgentMode:'explicitRequestOnly',
 }
}
