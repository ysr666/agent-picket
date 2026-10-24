import assert from 'node:assert/strict'
import test from 'node:test'
import {createDshRealGoalConsentControl,REAL_GOAL_DISCLOSURE_VERSION} from '../src/adapters/dsh/client-goal-consent.ts'
import type {DshSettingsScope} from '../src/adapters/dsh/client-rights-scope.ts'
test('UI Goal consent requires fresh v2 disclosure, an official writable Host and confirmed readback',async()=>{
 let value={welcomeDecision:'enabled' as const,realGoalStrikeConsent:'off' as 'off'|'authorized-v1'|'authorized-v2'}
 let writes=0
 const scope:DshSettingsScope<typeof value>={
  getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:1,value}),
  subscribe:()=>()=>{},
  async set(field,next){assert.equal(field,'realGoalStrikeConsent');
   writes++;value={...value,realGoalStrikeConsent:next as typeof value.realGoalStrikeConsent}}
 }
 const control=createDshRealGoalConsentControl(scope,{snapshot:()=>true,qualify:async()=>true,subscribe:()=>()=>{}})
 assert.equal(control.snapshot().authorized,false)
 await assert.rejects(control.choose('authorized-v2'),/disclosure/)
 assert.equal(writes,0)
 const enabled=await control.choose('authorized-v2',REAL_GOAL_DISCLOSURE_VERSION)
 assert.equal(enabled.authorized,true)
 assert.equal(enabled.activated,true)
 assert.equal(writes,1)
 const off=await control.choose('off')
 assert.equal(off.authorized,false)
 assert.equal(writes,2)
})
test('memory fallback and Host refusal cannot pretend authorization succeeded',async()=>{
 const scope:DshSettingsScope<{welcomeDecision:'enabled';realGoalStrikeConsent?:'off'|'authorized-v1'|'authorized-v2'}>={
  getSnapshot:()=>({status:'ready',mode:'memory',writable:true,revision:1,
   value:{welcomeDecision:'enabled',realGoalStrikeConsent:'off'}}),
  subscribe:()=>()=>{},async set(){throw Error('No Host')},
 }
 const control=createDshRealGoalConsentControl(scope,{snapshot:()=>false,qualify:async()=>false,subscribe:()=>()=>{}})
 assert.equal(control.snapshot().available,false)
 await assert.rejects(control.choose('authorized-v2',REAL_GOAL_DISCLOSURE_VERSION),/Host-owned/)
})

test('saved v1 grant stays inactive until fresh, informed v2 settings upgrade',async()=>{
 let data={welcomeDecision:'enabled' as const,
   realGoalStrikeConsent:'authorized-v1' as 'off'|'authorized-v1'|'authorized-v2'}
 const writes:Array<[string,unknown]>=[]
 const scope:DshSettingsScope<typeof data>={
   getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:writes.length+2,value:data}),
   subscribe:()=>()=>{},
   async set(field,value){writes.push([field,value]);data={...data,realGoalStrikeConsent:value as typeof data.realGoalStrikeConsent}},
 }
 const control=createDshRealGoalConsentControl(scope,{
   snapshot:()=>true,qualify:async()=>true,subscribe:()=>()=>{},
 })
 assert.deepEqual(control.snapshot(),{
   available:true,writable:true,authorized:true,activated:false,
 })
 await assert.rejects(control.choose('authorized-v2','goal-safe-boundary-v1'),/disclosure/)
 assert.deepEqual(writes,[])
 await control.choose('authorized-v2','goal-safe-boundary-v2')
 assert.deepEqual(writes,[['realGoalStrikeConsent','authorized-v2']])
 assert.equal(control.snapshot().activated,true)
 await control.choose('off')
 assert.equal(control.snapshot().activated,false)
 assert.equal(control.snapshot().authorized,false)
})

test('a pending v2 upgrade must not override cross-tab union exit or consent change',async()=>{
 let consent:'off'|'authorized-v1'|'authorized-v2'='authorized-v1'
 let membership:'enabled'|'not-now'='enabled'
 let revision=12,writes=0
 let resumeQualification!:()=>void
 const qualification=new Promise<void>(done=>{resumeQualification=done})
 const scope:DshSettingsScope<{
  welcomeDecision:'enabled'|'not-now',
  realGoalStrikeConsent:'off'|'authorized-v1'|'authorized-v2'
 }> ={
   getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision,
     value:{welcomeDecision:membership,realGoalStrikeConsent:consent}}),
   subscribe:()=>()=>{},
   async set(_field,value){writes++;consent=value as typeof consent},
 }
 const controller=createDshRealGoalConsentControl(scope,{
  snapshot:()=>true,subscribe:()=>()=>{},
  qualify:async()=>{await qualification;return true},
 })
 const pending=controller.choose('authorized-v2','goal-safe-boundary-v2')
 membership='not-now';consent='off';revision++
 resumeQualification()
 await assert.rejects(pending,/Host consent changed/)
 assert.equal(writes,0,'Pending upgrade cannot write after another tab exits')
 assert.equal(controller.snapshot().activated,false)
})

test('even a successful stale Host write cannot report activation after membership is revoked',async()=>{
 let membership:'enabled'|'not-now'='enabled'
 let value:'off'|'authorized-v2'='off'
 const scope:DshSettingsScope<{
  welcomeDecision:'enabled'|'not-now',
  realGoalStrikeConsent:'off'|'authorized-v2'
 }> ={
   getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:2,
     value:{welcomeDecision:membership,realGoalStrikeConsent:value}}),
   subscribe:()=>()=>{},
   async set(_field,next){
    membership='not-now' // Simulated concurrent external Host change during write
    value=next as typeof value
   },
 }
 const control=createDshRealGoalConsentControl(scope,{
  snapshot:()=>true,qualify:async()=>true,subscribe:()=>()=>{},
 })
 await assert.rejects(control.choose('authorized-v2','goal-safe-boundary-v2'),
   /Host did not confirm/)
 assert.equal(control.snapshot().activated,false)
})
