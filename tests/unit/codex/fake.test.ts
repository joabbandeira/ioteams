import { expect, it } from 'vitest'
import { FakeHostAdapter } from '../../../packages/codex/src/index.js'
import { turn, approval } from '../../fixtures/contracts.js'
import type { HostEvent, HostTurnInput } from '@ioteams/core'
const script:HostEvent[]=[{type:'thread.started',threadId:'thread-1'},{type:'turn.started',threadId:'thread-1',turnId:'turn-1'},{type:'approval.requested',request:approval as Extract<HostEvent,{type:'approval.requested'}>['request']},{type:'content.delta',turnId:'turn-1',text:'fixture'},{type:'turn.completed',turnId:'turn-1',status:'completed'}]
it('provides a credential-free HostAdapter whose approval gates progress and is single use',async()=>{
 const host=new FakeHostAdapter(script),events:HostEvent[]=[]
 for await(const event of host.start(turn as HostTurnInput)){
  events.push(event)
  if(event.type==='approval.requested'){
   await expect(host.respondToApproval('wrong','accept')).rejects.toThrow()
   await host.respondToApproval(event.request.requestId,'accept')
   await expect(host.respondToApproval(event.request.requestId,'accept')).rejects.toThrow()
  }
 }
 expect(events.map(e=>e.type)).toEqual(['thread.started','turn.started','approval.requested','content.delta','turn.completed'])
})
it('interrupts a gated fake turn without emitting later scripted success',async()=>{
 const host=new FakeHostAdapter(script),events:HostEvent[]=[]
 for await(const event of host.start(turn as HostTurnInput)){
  events.push(event);if(event.type==='approval.requested')await host.interrupt('turn-1')
 }
 expect(events.at(-1)).toEqual({type:'turn.completed',turnId:'turn-1',status:'interrupted'})
 expect(events.some(e=>e.type==='content.delta')).toBe(false)
})
