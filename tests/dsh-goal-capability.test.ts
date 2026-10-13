import assert from 'node:assert/strict'
import test from 'node:test'
import {createDshGoalServiceWitness} from '../src/adapters/dsh/client-goal-capability.ts'
import {createDshRealGoalConsentControl} from '../src/adapters/dsh/client-goal-consent.ts'

test('writable Host settings cannot authorize real Goal without official service witness',async()=>{
 let session='A',binding:any={},requests=0,writes=0
 const remote:any={get:async()=>{requests++;return {ok:true,value:undefined}},
   resume:async()=>({ok:false})}
 const witness=createDshGoalServiceWitness({
   currentSession:()=>session,binding:()=>binding,remote:()=>remote,
 })
 let settings={welcomeDecision:'enabled' as const,realGoalStrikeConsent:'off' as 'off'|'authorized-v1'}
 const scope={getSnapshot:()=>({status:'ready' as const,mode:'host' as const,
   writable:true,revision:1,value:settings}),subscribe:()=>()=>{},
   async set(_field:string,value:unknown){writes++;settings={...settings,realGoalStrikeConsent:value as 'off'|'authorized-v1'}}}
 const control=createDshRealGoalConsentControl(scope,witness)
 assert.equal(control.snapshot().available,false)
 assert.equal(control.snapshot().writable,true,'revocation stays writable when Goal disappears')
 assert.equal(requests,0,'No eager RPC')
 const result=await control.choose('authorized-v1','goal-safe-boundary-v1')
 assert.equal(result.authorized,true)
 assert.equal(requests,1,'Read-only probe just once before durable consent write')
 assert.equal(writes,1)
 session='other'
 assert.equal(witness.snapshot(),false)
 assert.equal(control.snapshot().available,false)
 const off=await control.choose('off')
 assert.equal(off.authorized,false,'Revocation must stay possible when Goal service loses qualification')
 assert.equal(writes,2)
})
test('no Goal RPC, rejected get, exceptions and malformed response fail closed',async()=>{
 let remote:any,session='s',binding:any={}
 const w=createDshGoalServiceWitness({currentSession:()=>session,binding:()=>binding,remote:()=>remote})
 assert.equal(await w.qualify(),false)
 remote={get:async()=>({ok:false}),resume:async()=>({ok:true})}
 assert.equal(await w.qualify(),false)
 remote={get:async()=>{throw Error('Host unavailable')},resume:async()=>({ok:true})}
 assert.equal(await w.qualify(),false)
 remote={get:async()=>({ok:true,value:{}}),resume:async()=>({ok:true})}
 assert.equal(await w.qualify(),false,'Empty object is not a valid GoalView')
 remote={get:async()=>({ok:true,value:'spoof'}),resume:async()=>({ok:true})}
 assert.equal(await w.qualify(),false)
 remote={get:async()=>({ok:true,value:undefined})}
 assert.equal(await w.qualify(),false,'get without resume is not a recoverable Goal')
 remote={get:async()=>({ok:true,value:undefined}),resume:async()=>({ok:true})}
 assert.equal(await w.qualify(),true)
 session='other';assert.equal(w.snapshot(),false)
 binding={};assert.equal(w.snapshot(),false)
 remote=undefined;assert.equal(w.snapshot(),false)
})
test('in-flight read-only qualification is fenced by Session/binding/Remote identity',async()=>{
 let session='s',binding:any={tag:1},remote:any
 let resolveGet!:(v:unknown)=>void,calls=0
 remote={get:()=>{calls++;return new Promise(r=>{resolveGet=r})},resume:async()=>({ok:true})}
 const w=createDshGoalServiceWitness({currentSession:()=>session,binding:()=>binding,remote:()=>remote})
 let events=0;const stop=w.subscribe(()=>events++)
 const a=w.qualify(),b=w.qualify()
 assert.equal(calls,1)
 session='else';resolveGet({ok:true,value:undefined})
 assert.equal(await a,false);assert.equal(await b,false);assert.equal(w.snapshot(),false)
 session='s'
 const pending=w.qualify()
 binding={tag:2};resolveGet({ok:true,value:undefined})
 assert.equal(await pending,false)
 remote={get:async()=>({ok:true,value:undefined}),resume:async()=>({ok:true})}
 assert.equal(await w.qualify(),true)
 assert.equal(w.snapshot(),true)
 assert.equal(events,1)
 w.invalidate();assert.equal(w.snapshot(),false)
 stop()
})
test('a user cannot authorize after the current Session changes before the write',async()=>{
 let session='s',binding:any={},writes=0
 const remote={get:async()=>{session='different';return {ok:true,value:undefined}},
  resume:async()=>({ok:true})}
 const w=createDshGoalServiceWitness({currentSession:()=>session,binding:()=>binding,remote:()=>remote})
 const scope={getSnapshot:()=>({status:'ready' as const,mode:'host' as const,
  writable:true,revision:0,value:{welcomeDecision:'enabled' as const,realGoalStrikeConsent:'off' as const}}),
  subscribe:()=>()=>{},async set(){writes++}}
 const port=createDshRealGoalConsentControl(scope,w)
 await assert.rejects(port.choose('authorized-v1','goal-safe-boundary-v1'),/service/)
 assert.equal(writes,0)
})

test('invalidated pending official RPC cannot silently recertify the same Session',async()=>{
 const binding={},session='s'
 let resolveGet!:(v:unknown)=>void,requests=0
 const remote={get:()=>{requests++;return new Promise(r=>{resolveGet=r})},
  resume:async()=>({ok:true})}
 const w=createDshGoalServiceWitness({currentSession:()=>session,binding:()=>binding,remote:()=>remote})
 const pending=w.qualify()
 assert.equal(requests,1)
 w.invalidate()
 resolveGet({ok:true,value:undefined})
 assert.equal(await pending,false)
 assert.equal(w.snapshot(),false)
})
test('a fresh consent-click probe invalidates a former certificate on Host rejection',async()=>{
 const binding={},session='s'
 let ok=true,requests=0
 const remote={get:async()=>{requests++;return {ok}},resume:async()=>({ok:true})}
 const w=createDshGoalServiceWitness({currentSession:()=>session,binding:()=>binding,remote:()=>remote})
 assert.equal(await w.qualify(),true)
 ok=false
 assert.equal(await w.qualify(true),false)
 assert.equal(w.snapshot(),false)
 assert.equal(requests,2)
})
