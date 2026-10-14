import { HostEventSchema, HostTurnInputSchema, ApprovalDecisionSchema, type HostAdapter, type HostEvent, type HostTurnInput, type ApprovalDecision } from '@ioteams/core'
import { CodexHostError } from './errors.js'
/** Deterministic HostAdapter for service/CI tests; never starts a process or performs inference. */
export class FakeHostAdapter implements HostAdapter {
  private script: HostEvent[]
  private active?: { turnId?: string; interrupted:boolean; requestId?:string; wake?:()=>void }
  constructor(events:HostEvent[]) {this.script=events.map(event=>HostEventSchema.parse(structuredClone(event)))}
  async *start(input:HostTurnInput,signal?:AbortSignal):AsyncIterable<HostEvent> {
    HostTurnInputSchema.parse(input)
    if(this.active){yield {type:'error',code:'BUSY',message:'Um turno já está em execução.',retryable:false};return}
    if(signal?.aborted){yield {type:'error',code:'CANCELLED',message:'Execução cancelada antes do início.',retryable:false};return}
    const active:{turnId?:string;interrupted:boolean;requestId?:string;wake?:()=>void}={interrupted:false};this.active=active
    const abort=()=>{active.interrupted=true;active.wake?.()}
    signal?.addEventListener('abort',abort,{once:true})
    try {
      for(const event of this.script){
        if(active.interrupted)break
        if(event.type==='turn.started')active.turnId=event.turnId
        if(event.type==='approval.requested')active.requestId=event.request.requestId
        yield structuredClone(event)
        if(active.requestId&&!active.interrupted)await new Promise<void>(resolve=>{active.wake=resolve;if(!active.requestId||active.interrupted)resolve()})
      }
      if(active.interrupted&&active.turnId)yield {type:'turn.completed',turnId:active.turnId,status:'interrupted'}
    } finally {signal?.removeEventListener('abort',abort);this.active=undefined}
  }
  async respondToApproval(requestId:string,decision:ApprovalDecision):Promise<void> {
    ApprovalDecisionSchema.parse(decision)
    if(!this.active||this.active.interrupted||this.active.requestId!==requestId)throw new CodexHostError('STALE_APPROVAL','Aprovação ausente ou encerrada.')
    this.active.requestId=undefined;this.active.wake?.()
  }
  async interrupt(turnId:string):Promise<void> {
    if(!this.active||this.active.interrupted||this.active.turnId!==turnId)throw new CodexHostError('STALE_TURN','Somente o turno ativo pode ser interrompido.')
    this.active.interrupted=true;this.active.wake?.()
  }
}
