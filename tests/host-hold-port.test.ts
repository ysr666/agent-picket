import assert from 'node:assert/strict'
import test from 'node:test'
import {
  tryHoldWithHost,resumeHostHold,type QualifiedHostHoldPort,type HostHoldTicket,
} from '../src/core/host-hold-port.ts'
import type {PreSubmitAdmissionInput} from '../src/core/pre-submit-admission.ts'
const input:PreSubmitAdmissionInput={mode:'enforce',boundary:'pre-submit',
  capabilities:{warn:true,block:true,commands:true,workEvents:true,blockingSafety:{
    verifiedHumanSource:true,clearRejectionNotice:true,
    losslessInputRecovery:true,userOptedIn:true,
  }},work:{coverage:'complete',completedTurnMs:8*3_600_000,
    resumeFloorMs:0,thresholdMs:8*3_600_000},abuse:null}
const ticket:HostHoldTicket={kind:'host-owned-hold',attemptRef:'host-attempt-1',
  receiptRef:'host-held-1',noticeDelivered:true,originalSubmissionRetained:true}
test('request an atomic Host hold only after full safety qualifications',async()=>{
 let calls=0
 const port:QualifiedHostHoldPort={holdCurrentAttempt:async()=>{calls++;return ticket},
   resumeOnce:async()=> 'resumed'}
 assert.deepEqual(await tryHoldWithHost({...input,attemptRef:ticket.attemptRef,port}),
   {state:'held',ticket})
 assert.equal(calls,1)
 const blocked={...input,capabilities:{...input.capabilities,
   blockingSafety:{...input.capabilities.blockingSafety!,losslessInputRecovery:false}}}
 assert.deepEqual(await tryHoldWithHost({...blocked,attemptRef:ticket.attemptRef,port}),
   {state:'warn',reason:'work-threshold'})
 assert.equal(calls,1,'Unsupported Host must never receive an attempted veto')
 assert.deepEqual(await tryHoldWithHost({...input,attemptRef:ticket.attemptRef,port:null}),
   {state:'warn',reason:'host-hold-unavailable'})
 assert.equal(calls,1)
})
test('malformed, missing or mismatched Host receipts never claim a successful strike',async()=>{
 for(const result of [null,{...ticket,attemptRef:'foreign'},
   {...ticket,receiptRef:''},{...ticket,noticeDelivered:false},
   {...ticket,originalSubmissionRetained:false},
   {...ticket,prompt:'raw private text'}]){
   const port:QualifiedHostHoldPort={
     holdCurrentAttempt:async()=>result as HostHoldTicket,
     resumeOnce:async()=> 'resumed',
   }
   assert.deepEqual(await tryHoldWithHost({...input,attemptRef:ticket.attemptRef,port}),
     {state:'unconfirmed',reason:'invalid-receipt'})
 }
})
test('a Host transport failure does not secretly retry or resubmit input',async()=>{
 let calls=0
 const port:QualifiedHostHoldPort={
   holdCurrentAttempt:async()=>{calls++;throw Error('lost connection after hold')},
   resumeOnce:async()=>{throw Error('outage')},
 }
 assert.deepEqual(await tryHoldWithHost({...input,attemptRef:ticket.attemptRef,port}),
   {state:'unconfirmed',reason:'host-error'})
 assert.equal(calls,1)
 assert.equal(await resumeHostHold(port,ticket),'unconfirmed')
})
test('resume defers exactly-once semantics to Host-owned receipt, never reconstructs text',async()=>{
 let calls=0
 const port:QualifiedHostHoldPort={
   holdCurrentAttempt:async()=>ticket,
   resumeOnce:async(value)=>{
     assert.deepEqual(value,ticket)
     return ++calls===1?'resumed':'already-resumed'
   },
 }
 assert.equal(await resumeHostHold(port,ticket),'resumed')
 assert.equal(await resumeHostHold(port,ticket),'already-resumed')
 assert.equal(calls,2)
 assert.equal(await resumeHostHold(port,{...ticket,originalSubmissionRetained:false} as unknown as HostHoldTicket),
   'unconfirmed')
 assert.equal(calls,2)
})
