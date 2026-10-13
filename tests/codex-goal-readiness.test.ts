import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseCodexGoalReadback,readCodexOfficialGoal,
  inspectCodexGoalHoldSafety,CODEX_0146_NATIVE_GOAL_CAPABILITY,
} from '../src/adapters/codex/goal-readiness.ts'
const id='01a130a8-5533-7843-9fac-c79eb8f185af'
const sample={goal:{threadId:id,objective:'PRIVATE USER GOAL',status:'paused',
 tokenBudget:null,tokensUsed:0,timeUsedSeconds:0,createdAt:1791817700,updatedAt:1791817700}}
test('official Codex Goal readback exposes state, never raw objective',()=>{
 const p=parseCodexGoalReadback(sample,id)
 assert.equal(p.state,'present')
 assert.equal(p.state==='present'&&p.goal.status,'paused')
 assert.doesNotMatch(JSON.stringify(p),/PRIVATE USER GOAL|objective|tokenBudget/)
 assert.deepEqual(parseCodexGoalReadback({goal:null},id),{state:'absent'})
})
test('forged thread identity, corrupted values and absent owner response fail closed',()=>{
 for(const bad of [undefined,{},[],{goal:{...sample.goal,threadId:'other'}},
  {goal:{...sample.goal,status:'arbitrary'}},
  {goal:{...sample.goal,tokensUsed:-1}},
  {goal:{...sample.goal,updatedAt:-4}},
  {goal:{...sample.goal,objective:''}}]){
   assert.equal(parseCodexGoalReadback(bad,id).state,'unconfirmed')
 }
 assert.equal(parseCodexGoalReadback(sample,'invalid/thread').state,'unconfirmed')
})
test('Codex Goal getter cannot mutate Host state, errors are unconfirmed',async()=>{
 let calls=0
 const good=await readCodexOfficialGoal({async getGoal({threadId}){
  assert.equal(threadId,id);calls++;return sample
 }},id)
 assert.equal(good.state,'present')
 assert.equal(calls,1)
 assert.equal((await readCodexOfficialGoal({async getGoal(){throw Error('disconnected')}},id)).state,'unconfirmed')
 assert.equal((await readCodexOfficialGoal(undefined,id)).state,'unconfirmed')
})
test('Codex 0.146.1 does NOT qualify for autonomous work blocking from goal/set alone',()=>{
 const native=inspectCodexGoalHoldSafety(CODEX_0146_NATIVE_GOAL_CAPABILITY)
 assert.equal(native.ready,false)
 assert.equal(native.gaps.length,6)
 assert.equal(inspectCodexGoalHoldSafety({...CODEX_0146_NATIVE_GOAL_CAPABILITY,
  consentFromHost:true,activeOwnerVerified:true}).ready,false)
 assert.deepEqual(inspectCodexGoalHoldSafety({
  consentFromHost:true,activeOwnerVerified:true,
  exclusiveCrossProcessGoalOwnerVerified:true,safeIdleBoundaryVerified:true,
  conditionalCommitVerified:true,durableLosslessRecoveryVerified:true,
 }).gaps,[])
 assert.deepEqual(inspectCodexGoalHoldSafety({
  consentFromHost:true,activeOwnerVerified:true,
  exclusiveCrossProcessGoalOwnerVerified:false,safeIdleBoundaryVerified:true,
  conditionalCommitVerified:true,durableLosslessRecoveryVerified:true,
 }).gaps,['multi-owner-fencing-unverified'],
  'A single owner appears safe until another App-Server resumes the same active Goal')
})
