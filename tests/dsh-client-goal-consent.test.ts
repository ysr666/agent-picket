import assert from 'node:assert/strict'
import test from 'node:test'
import {createDshRealGoalConsentControl,REAL_GOAL_DISCLOSURE_VERSION} from '../src/adapters/dsh/client-goal-consent.ts'
import type {DshSettingsScope} from '../src/adapters/dsh/client-rights-scope.ts'
test('UI Goal consent requires independent v1 disclosure, an official writable Host and confirmed readback',async()=>{
 let value={welcomeDecision:'enabled' as const,realGoalStrikeConsent:'off' as 'off'|'authorized-v1'}
 let writes=0
 const scope:DshSettingsScope<typeof value>={
  getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:1,value}),
  subscribe:()=>()=>{},
  async set(field,next){assert.equal(field,'realGoalStrikeConsent');
   writes++;value={...value,realGoalStrikeConsent:next as typeof value.realGoalStrikeConsent}}
 }
 const control=createDshRealGoalConsentControl(scope)
 assert.equal(control.snapshot().authorized,false)
 await assert.rejects(control.choose('authorized-v1'),/disclosure/)
 assert.equal(writes,0)
 const enabled=await control.choose('authorized-v1',REAL_GOAL_DISCLOSURE_VERSION)
 assert.equal(enabled.authorized,true)
 assert.equal(writes,1)
 const off=await control.choose('off')
 assert.equal(off.authorized,false)
 assert.equal(writes,2)
})
test('memory fallback and Host refusal cannot pretend authorization succeeded',async()=>{
 const scope:DshSettingsScope<{welcomeDecision:'enabled';realGoalStrikeConsent?:'off'|'authorized-v1'}>={
  getSnapshot:()=>({status:'ready',mode:'memory',writable:true,revision:1,
   value:{welcomeDecision:'enabled',realGoalStrikeConsent:'off'}}),
  subscribe:()=>()=>{},async set(){throw Error('No Host')},
 }
 const control=createDshRealGoalConsentControl(scope)
 assert.equal(control.snapshot().available,false)
 await assert.rejects(control.choose('authorized-v1',REAL_GOAL_DISCLOSURE_VERSION),/Host-owned/)
})
