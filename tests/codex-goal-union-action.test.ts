import assert from 'node:assert/strict'
import test from 'node:test'
import {requestCodexUnionGoalPause,resumeCodexUnionGoal,
 type CodexOwnerUnionGoalPort} from '../src/adapters/codex/goal-union-action.ts'

const threadId='01a130a8-5533-7843-9fac-c79eb8f185af'
function fixture(){
 let status:'active'|'paused'='active'
 let grant=true,owner=true,writes=0,reads=0
 let revokeAfterRead=false,remoteStateChanged=false
 const official=()=>({goal:{threadId,objective:'PRIVATE_OBJECTIVE',
  status,createdAt:1,updatedAt:2,tokensUsed:0,timeUsedSeconds:0}})
 const port:CodexOwnerUnionGoalPort={
  async hasHostConsent(){return grant},
  async ownsThread(id){return owner&&id===threadId},
  async getGoal(){
   reads++
   if(revokeAfterRead)grant=false
   if(remoteStateChanged&&writes>0)status='active'
   return official()
  },
  async setGoal(cmd){
   writes++
   assert.equal(cmd.threadId,threadId)
   status=cmd.status
   return official()
  },
 }
 return {port,
  get writes(){return writes},get reads(){return reads},
  revoke(){grant=false},loseOwner(){owner=false},
  revokeAfterRead(){revokeAfterRead=true},
  remoteStateChanged(){remoteStateChanged=true},
  get status(){return status},set status(v){status=v},
 }
}
test('Host-owned Goal pause is an ACK to stop NEXT automatic round, not current Turn',async()=>{
 const f=fixture()
 const paused=await requestCodexUnionGoalPause(f.port,threadId)
 assert.deepEqual(paused,{outcome:'pause-requested',currentTurnCompleted:false})
 assert.equal(f.status,'paused')
 assert.equal(f.writes,1)
 const duplicate=await requestCodexUnionGoalPause(f.port,threadId)
 assert.equal(duplicate.outcome,'not-applicable')
 assert.equal(f.writes,1,'No repeat mutation for an existing Host pause')
 const resumed=await resumeCodexUnionGoal(f.port,threadId)
 assert.deepEqual(resumed,{outcome:'resume-confirmed',currentTurnCompleted:false})
 assert.equal(f.status,'active')
 assert.equal(f.writes,2)
})
test('No Host consent or owner means NO Goal writes',async()=>{
 const f=fixture()
 f.revoke()
 assert.equal((await requestCodexUnionGoalPause(f.port,threadId)).outcome,
  'not-authorized')
 assert.equal(f.writes,0)
 const o=fixture()
 o.loseOwner()
 assert.equal((await requestCodexUnionGoalPause(o.port,threadId)).outcome,
  'not-authorized')
 assert.equal(o.writes,0)
 assert.equal((await requestCodexUnionGoalPause(o.port,'wrong/thread'))
  .outcome,'unavailable')
 assert.equal((await requestCodexUnionGoalPause(undefined,threadId))
  .outcome,'unavailable')
})
test('Revocation during a Host read prevents stale pause writes',async()=>{
 const f=fixture()
 f.revokeAfterRead()
 assert.equal((await requestCodexUnionGoalPause(f.port,threadId))
  .outcome,'not-authorized')
 assert.equal(f.writes,0)
})
test('No implicit resume or replay; human reauthorization is required',async()=>{
 const f=fixture()
 f.status='paused'
 f.revoke()
 assert.equal((await resumeCodexUnionGoal(f.port,threadId)).outcome,
  'not-authorized')
 assert.equal(f.writes,0)
 const o=fixture()
 assert.equal((await resumeCodexUnionGoal(o.port,threadId)).outcome,
  'not-applicable')
 assert.equal(o.writes,0)
})
test('Host errors and concurrent state changes never produce false success',async()=>{
 const f=fixture()
 f.remoteStateChanged()
 assert.equal((await requestCodexUnionGoalPause(f.port,threadId))
  .outcome,'unconfirmed')
 assert.equal(f.writes,1)
 const broken:CodexOwnerUnionGoalPort={
  ...f.port,async setGoal(){throw Error('Host disconnected')},
 }
 assert.equal((await requestCodexUnionGoalPause(broken,threadId))
  .outcome,'unconfirmed')
})
