import assert from 'node:assert/strict'
import test from 'node:test'
import {planPreSubmitAdmission,type PreSubmitAdmissionInput} from '../src/core/pre-submit-admission.ts'
import type {HostCapabilities} from '../src/core/types.ts'
const unsafe:HostCapabilities={warn:true,block:true,commands:true,workEvents:true}
const qualified:HostCapabilities={...unsafe,blockingSafety:{
  verifiedHumanSource:true,clearRejectionNotice:true,
  losslessInputRecovery:true,userOptedIn:true,
}}
const base:PreSubmitAdmissionInput={mode:'enforce',boundary:'pre-submit',
  capabilities:unsafe,work:{coverage:'complete',completedTurnMs:8*3_600_000,
    resumeFloorMs:0,thresholdMs:8*3_600_000},abuse:null}
test('eight-hour threshold requests HOLD only with every proven Host guarantee',()=>{
 assert.deepEqual(planPreSubmitAdmission(base),{
   action:'warn',cause:'work-threshold',safety:'downgraded'})
 assert.deepEqual(planPreSubmitAdmission({...base,capabilities:qualified}),{
   action:'request-host-hold',cause:'work-threshold',safety:'qualified-host'})
 for(const k of Object.keys(qualified.blockingSafety!) as (keyof NonNullable<HostCapabilities['blockingSafety']>)[]){
   const caps={...qualified,blockingSafety:{...qualified.blockingSafety!,[k]:false}}
   assert.equal(planPreSubmitAdmission({...base,capabilities:caps}).action,'warn',k)
 }
})
test('missing or partial verified work, invalid thresholds and stale resume floor never hold',()=>{
 for(const work of [
   {...base.work!,coverage:'partial' as const},
   {...base.work!,completedTurnMs:null},
   {...base.work!,completedTurnMs:Infinity},
   {...base.work!,completedTurnMs:8*3_600_000-1},
   {...base.work!,resumeFloorMs:8*3_600_000,completedTurnMs:8*3_600_000},
   {...base.work!,resumeFloorMs:8*3_600_000+1},
   {...base.work!,thresholdMs:0},
 ]){
   assert.equal(planPreSubmitAdmission({...base,capabilities:qualified,work}).action,'allow')
 }
})
test('safe resume floor requires eight additional verified hours, not repeated duplicate input',()=>{
 const w={...base.work!,resumeFloorMs:8*3_600_000}
 assert.equal(planPreSubmitAdmission({...base,capabilities:qualified,work:w}).action,'allow')
 assert.equal(planPreSubmitAdmission({...base,capabilities:qualified,work:{
   ...w,completedTurnMs:16*3_600_000}}).action,'request-host-hold')
})
test('OFF, WARN or already-running tools are never interrupted even on qualifying Host',()=>{
 for(const changes of [
   {mode:'off' as const},
   {mode:'warn' as const},
   {boundary:'already-running' as const},
 ])assert.notEqual(planPreSubmitAdmission({...base,capabilities:qualified,...changes}).action,
   'request-host-hold')
})
test('persistent high-confidence abuse is eligible only after verified engine decision',()=>{
 const abuse={promptId:'1',requestedAction:'block' as const,
   reason:'repeated-targeted-abuse' as const,targetedStreak:3}
 const input={...base,work:null,abuse}
 assert.equal(planPreSubmitAdmission({...input,capabilities:unsafe}).action,'warn')
 assert.equal(planPreSubmitAdmission({...input,capabilities:qualified}).action,'request-host-hold')
 for(const override of [{targetedStreak:2},{reason:'suspected-abuse' as const},
   {requestedAction:'warn' as const}]){
   assert.equal(planPreSubmitAdmission({...input,capabilities:qualified,
     abuse:{...abuse,...override}}).action,'allow')
 }
})
