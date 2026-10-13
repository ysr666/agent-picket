import assert from 'node:assert/strict'
import test from 'node:test'
import {blockAutonomousGoalAtTurnStopping,
 type DshGoalBoundaryPort,type HostGoalSnapshot,type GoalStrikeConsentV1,
} from '../src/adapters/dsh/goal-boundary-strike.ts'
const agent={session:{id:'s1'}}
const consent:GoalStrikeConsentV1={kind:'agent-picket-real-goal-strike-v1',hostAuthenticated:true,enabled:true}
const boundary={type:'agent/turn-stopping' as const,reason:'settling' as const,sessionId:'s1'}
const work={coverage:'complete' as const,completedTurnMs:8*3_600_000,
 resumeFloorMs:0,thresholdMs:8*3_600_000}
function harness(){
 let state:HostGoalSnapshot={id:'g1',revision:4,phase:'active',activation:'armed',roundsStarted:2}
 let commits=0
 const goals:DshGoalBoundaryPort<typeof agent>={
   get:a=>{assert.equal(a,agent);return state},
   block(a,ref,reason){
     assert.equal(a,agent)
     assert.deepEqual(ref,{id:state.id,revision:state.revision})
     assert.equal(reason.code,'picket-work-limit')
     assert.ok(!JSON.stringify(reason).includes('user prompt'))
     commits++
     state={...state,phase:'blocked',activation:'disarmed',revision:state.revision+1}
     return state
   },
 }
 const run=(overrides:Record<string,unknown>={})=>
   blockAutonomousGoalAtTurnStopping({consent,event:boundary,agent,
     agentSessionId:agent.session.id,work,goals,...overrides})
 return {run,get state(){return state},set state(s){state=s},get commits(){return commits},goals}
}
test('only explicit new Host consent can block the next Goal at its safe boundary',()=>{
 const h=harness()
 for(const value of [null,{...consent,hostAuthenticated:false},
  {kind:'old-simulation-only',enabled:true,hostAuthenticated:true}]){
   assert.deepEqual(h.run({consent:value}),{state:'allow',reason:'no-new-consent'})
 }
 assert.equal(h.commits,0)
 assert.deepEqual(h.run(),{state:'blocked',goalId:'g1',goalRevision:5})
 assert.equal(h.state.phase,'blocked')
 assert.equal(h.state.activation,'disarmed')
 assert.deepEqual(h.run(),{state:'allow',reason:'goal-not-active'})
 assert.equal(h.commits,1,'Repeated boundary replay cannot reissue Goal block')
})
test('never blocks before completed turn, on unrelated session, or during insufficient work',()=>{
 const h=harness()
 for(const event of [
  {...boundary,reason:'aborted'},
  {...boundary,reason:'blocked'},
  {...boundary,type:'turn/start'},
 ])assert.deepEqual(h.run({event}),{state:'allow',reason:'not-safe-boundary'})
 assert.deepEqual(h.run({event:{...boundary,sessionId:'other'}}),
   {state:'allow',reason:'invalid-session'})
 for(const w of [
  {...work,coverage:'partial'},
  {...work,completedTurnMs:null},
  {...work,completedTurnMs:Infinity},
  {...work,resumeFloorMs:work.completedTurnMs},
  {...work,thresholdMs:0},
 ])assert.notEqual(h.run({work:w}).state,'blocked')
 assert.equal(h.commits,0)
})
test('does not interrupt a completed/non-armed Goal or prematurely claim first round',()=>{
 const h=harness()
 for(const phase of ['paused','blocked','complete'] as const){
   h.state={...h.state,phase}
   assert.deepEqual(h.run(),{state:'allow',reason:'goal-not-active'})
 }
 h.state={...h.state,phase:'active',activation:'disarmed'}
 assert.deepEqual(h.run(),{state:'allow',reason:'goal-not-active'})
 h.state={...h.state,activation:'armed',roundsStarted:0}
 assert.deepEqual(h.run(),{state:'allow',reason:'goal-not-active'})
 assert.equal(h.commits,0)
})
test('an ambiguous Host commit is never retried or claimed as confirmed',()=>{
 const h=harness()
 const goals:DshGoalBoundaryPort<typeof agent>={
  get:h.goals.get,
  block(a,r,reason){h.goals.block(a,r,reason);throw Error('connection lost after committed change')},
 }
 assert.deepEqual(h.run({goals}),{state:'unconfirmed',reason:'host-commit-uncertain'})
 assert.equal(h.commits,1)
 assert.deepEqual(h.run(),{state:'allow',reason:'goal-not-active'})
})
