import assert from 'node:assert/strict'
import test from 'node:test'
import {parseCodexGoalReadback} from '../src/adapters/codex/goal-readiness.ts'
import {projectCodexGoalUnionStatus} from '../src/adapters/codex/goal-union-status.ts'

const threadId='01a130a8-5533-7843-9fac-c79eb8f185af'
const goal=(status:string,thread=threadId)=>parseCodexGoalReadback({goal:{
 threadId:thread,objective:'DO_NOT_DISCLOSE_PRIVATE_GOAL',status,
 createdAt:1,updatedAt:2,tokensUsed:5,timeUsedSeconds:10,
}},threadId)
const evidence=(status='paused')=>({
 threadId,goal:goal(status),ownerVerified:true,
 consent:'authorized' as const,turn:'idle' as const,
 unionPauseAcknowledged:true,
})
test('only a verified official paused Goal AFTER its current Turn can claim union stop',()=>{
 const verified=projectCodexGoalUnionStatus(evidence())
 assert.equal(verified.phase,'paused')
 assert.equal(verified.canClaimUnionPause,true)
 assert.match(verified.title,/工会已暂停/)
 const active=projectCodexGoalUnionStatus({...evidence(),turn:'running'})
 assert.equal(active.phase,'finishing-turn')
 assert.equal(active.canClaimUnionPause,false)
 assert.match(active.detail,/不会强制中断/)
 const unknown=projectCodexGoalUnionStatus({...evidence(),turn:'unknown'})
 assert.equal(unknown.phase,'unconfirmed')
 assert.equal(unknown.canClaimUnionPause,false)
})
test('Goal ACK alone cannot claim union stop without Host consent or actual owner attribution',()=>{
 for(const variation of [
  {consent:'off' as const},
  {consent:'unconfirmed' as const},
  {unionPauseAcknowledged:false},
 ]){
  const view=projectCodexGoalUnionStatus({...evidence(),...variation})
  assert.equal(view.phase,'host-paused')
  assert.equal(view.canClaimUnionPause,false)
 }
 for(const variation of [
  {ownerVerified:false},
  {goal:{state:'unconfirmed'} as const},
  {goal:goal('paused','different-thread')},
  {threadId:'invalid/thread'},
 ]){
  const view=projectCodexGoalUnionStatus({...evidence(),...variation})
  assert.equal(view.phase,'unconfirmed')
 }
})
test('resume, Host budget stop, default OFF and private Goal objective are distinct',()=>{
 assert.equal(projectCodexGoalUnionStatus({...evidence('active'),
  humanResumeAcknowledged:true}).phase,'resumed')
 assert.equal(projectCodexGoalUnionStatus({...evidence('active'),
  consent:'off'}).phase,'off')
 assert.equal(projectCodexGoalUnionStatus({...evidence('usageLimited')})
  .phase,'other-host-limit')
 const en=projectCodexGoalUnionStatus(evidence(),'en')
 assert.equal(en.phase,'paused')
 assert.doesNotMatch(JSON.stringify([en,projectCodexGoalUnionStatus(evidence())]),
  /DO_NOT_DISCLOSE_PRIVATE_GOAL|objective|tokensUsed|timeUsedSeconds/)
})
