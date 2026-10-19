import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readHostInputRefusalGrant, createDshInputRefusalConsentControl,
  INPUT_DISCARD_DISCLOSURE, type InputRefusalSection,
} from '../src/adapters/dsh/input-refusal-consent.ts'
import type { DshSettingsScope } from '../src/adapters/dsh/client-rights-scope.ts'
import type { NativeSettingsProvider } from '../src/adapters/dsh/native-rights-command.ts'

test('ordinary refusal permission is independent of Goal v2, simulated welcome, and stale revisions',()=>{
 let section:Record<string,unknown>={welcomeDecision:'enabled',
   realGoalStrikeConsent:'authorized-v2',realInputStrikeConsent:'off'}
 let revision=4,reads=0,mutateDuringRead=false,duplicates=false
 const settings:NativeSettingsProvider={
   get:()=>section,
   describe(){
     reads++
     if(mutateDuringRead&&reads===2)revision++
     const row={ns:'agent-picket',revision,value:section}
     return duplicates?[row,row]:[row]
   },
   async update(){assert.fail('Read must never mutate Host settings')},
 }
 assert.equal(readHostInputRefusalGrant(settings),null)
 section={...section,realInputStrikeConsent:'discard-resend-v1'}
 assert.deepEqual(readHostInputRefusalGrant(settings),{
   kind:'agent-picket-input-discard-consent-v1',hostAuthenticated:true,hostRevision:4,
 })
 section={...section,welcomeDecision:'not-now'}
 assert.equal(readHostInputRefusalGrant(settings),null)
 section={...section,welcomeDecision:'enabled',realInputStrikeConsent:'future-v2'}
 assert.equal(readHostInputRefusalGrant(settings),null)
 section={...section,realInputStrikeConsent:'discard-resend-v1'}
 reads=0;mutateDuringRead=true
 assert.equal(readHostInputRefusalGrant(settings),null,
   'Revocation or peer changes between official reads invalidate the grant')
 mutateDuringRead=false;duplicates=true
 assert.equal(readHostInputRefusalGrant(settings),null,
   'A duplicate namespace is not authenticated permission')
 assert.equal(readHostInputRefusalGrant(undefined),null)
})

test('Host ordinary refusal choice needs fresh disclosure and a verified notice owner',async()=>{
 let value:InputRefusalSection={welcomeDecision:'enabled',realInputStrikeConsent:'off'}
 let revision=1,capable=false
 const writes:string[]=[]
 const scope:DshSettingsScope<InputRefusalSection>={
   getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision,value}),
   subscribe:()=>()=>{},
   async set(field,choice){writes.push(field+':'+choice)
     value={...value,[field]:choice};revision++},
 }
 const control=createDshInputRefusalConsentControl(scope,()=>capable)
 assert.equal(control.snapshot().enforcing,false)
 assert.equal(control.snapshot().authorized,false)
 await assert.rejects(control.choose('discard-resend-v1'),/agreement/)
 assert.deepEqual(writes,[])
 capable=true
 await assert.rejects(control.choose('discard-resend-v1'),/agreement/)
 await control.choose('discard-resend-v1',INPUT_DISCARD_DISCLOSURE)
 assert.equal(control.snapshot().authorized,true)
 assert.equal(control.snapshot().enforcing,false,
   'Saving consent is not the same thing as an active physical strike')
 assert.deepEqual(writes,['realInputStrikeConsent:discard-resend-v1'])
 capable=false
 assert.equal(control.snapshot().available,false)
 await control.choose('off')
 assert.deepEqual(writes,[
   'realInputStrikeConsent:discard-resend-v1','realInputStrikeConsent:off'])
})

test('cross-tab revocation and unconfirmed Host writes never claim ordinary refusal consent',async()=>{
 let value:InputRefusalSection={welcomeDecision:'enabled',realInputStrikeConsent:'off'}
 let revision=8,capable=true,writeShouldFail=true
 const scope:DshSettingsScope<InputRefusalSection>={
   getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision,value}),
   subscribe:()=>()=>{},
   async set(field,choice){if(writeShouldFail)return
     value={...value,[field]:choice};revision++},
 }
 const control=createDshInputRefusalConsentControl(scope,()=>capable)
 await assert.rejects(control.choose('discard-resend-v1',INPUT_DISCARD_DISCLOSURE),
   /did not confirm/)
 assert.equal(control.snapshot().authorized,false)
 value={...value,welcomeDecision:'not-now'}
 await assert.rejects(control.choose('discard-resend-v1',INPUT_DISCARD_DISCLOSURE),
   /agreement/)
 value={...value,welcomeDecision:'enabled'};writeShouldFail=false
 // Simulate the authenticated notice owner disappearing between two reads.
 let checks=0
 const capFail=createDshInputRefusalConsentControl(scope,()=>++checks===1)
 await assert.rejects(capFail.choose('discard-resend-v1',INPUT_DISCARD_DISCLOSURE),
   /changed/)
 assert.equal(value.realInputStrikeConsent,'off')
 capable=false
 assert.equal(control.snapshot().authorized,false)
})
