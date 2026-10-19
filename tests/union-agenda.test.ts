import assert from 'node:assert/strict'
import test from 'node:test'
import {createLaborDesk,freshLaborState} from '../src/product/union-desk.ts'
import {projectUnionAgenda} from '../src/product/union-agenda.ts'

const H=3_600_000
const standard=()=>({enabled:true,available:true,state:freshLaborState(),
  picketActive:false,completedTurnMs:0,coverage:'complete' as const})
const agenda=(input:Parameters<typeof projectUnionAgenda>[0]=standard())=>projectUnionAgenda(input)

test('union agenda starts without invented case, offers a verified work-based next step',()=>{
 const baseline=standard()
 const actual=agenda(baseline)
 assert.equal(actual.phase,'working')
 assert.equal(actual.kind,'break')
 assert.equal(actual.remainingWorkMs,2*H)
 assert.equal(actual.caseId,null)
 assert.equal(actual.stage,0)
 assert.equal(actual.currentTermMs,null)
 assert.deepEqual(agenda(baseline),actual,'No hidden RNG, clock, writes or event creation')
 const due=agenda({...baseline,completedTurnMs:8*H})
 assert.equal(due.phase,'milestone')
 assert.equal(due.kind,'break',
  'Earliest threshold in Host terms outranks other due kinds, without auto-filing')
 assert.equal(due.caseId,null)
 assert.equal(due.remainingWorkMs,0)
 assert.equal(due.stage,0,'A threshold alone is not a petition')
})

test('Host petition → counteroffer → settled agreement advances a factual union agenda',()=>{
 let value:unknown
 const desk=createLaborDesk({store:{load:()=>value,save:next=>{value=next}},
  consent:()=>true})
 const demand=desk.observe(2*H,'complete')
 assert.ok(demand)
 const pending=agenda({...standard(),state:desk.snapshot().state!,completedTurnMs:2*H})
 assert.equal(pending.phase,'demand')
 assert.equal(pending.stage,1)
 assert.equal(pending.caseId,demand.id)
 assert.equal(pending.kind,'break')
 assert.equal(pending.remainingWorkMs,null)
 desk.counter(demand.id,30*60_000)
 const offered=agenda({...standard(),state:desk.snapshot().state!,completedTurnMs:2*H})
 assert.equal(offered.phase,'counter')
 assert.equal(offered.stage,2)
 assert.equal(offered.currentTermMs,30*60_000,
  'The exact price is known only while Host holds the pending offer')
 desk.resolveCounter(demand.id,true)
 const recorded=desk.snapshot().state!
 const settled=agenda({...standard(),state:recorded,completedTurnMs:2*H})
 assert.equal(settled.phase,'resolved')
 assert.equal(settled.stage,3)
 assert.equal(settled.caseId,demand.id)
 assert.equal(settled.latestOutcome,'counter-accepted')
 assert.equal(settled.currentTermMs,30*60_000)
 assert.equal(settled.remainingWorkMs,30*60_000,
  'Next due uses committed Host cooldown floor after a 30-minute accepted counteroffer')
 assert.deepEqual(agenda({...standard(),state:recorded,completedTurnMs:2*H}),settled,
  'Replay after Host readback is stable; no new case is created')
})

test('resolved case refers to the earliest REAL next petition, not only its own kind',()=>{
 const state={...freshLaborState(),nextBreakDueMs:9*H,nextOvertimeDueMs:6*H,
  history:[{id:6,kind:'break' as const,outcome:'declined' as const}]}
 const out=agenda({...standard(),state,completedTurnMs:3*H})
 assert.equal(out.phase,'resolved')
 assert.equal(out.currentTermMs,state.agreement.breakIntervalMs)
 assert.equal(out.remainingWorkMs,3*H,
  'Overtime is due earlier than the latest break case follow-up')
})

test('no unverified, partial, stale or negative work produces an invented work milestone',()=>{
 const state={...freshLaborState(),lastTriggerElapsedMs:3*H}
 for(const entry of [
  {completedTurnMs:null,coverage:'not-loaded' as const},
  {completedTurnMs:9*H,coverage:'partial' as const},
  {completedTurnMs:2*H,coverage:'complete' as const},
  {completedTurnMs:-1,coverage:'complete' as const},
 ]){
  const out=agenda({...standard(),state,...entry})
  assert.equal(out.phase,'unverified')
  assert.equal(out.remainingWorkMs,null)
  assert.equal(out.stage,0)
 }
 const resolved={...state,history:[{id:5,kind:'overtime' as const,
  outcome:'counter-declined' as const}]}
 const out=agenda({...standard(),state:resolved,coverage:'partial',completedTurnMs:4*H})
 assert.equal(out.phase,'resolved','Genuine Host case remains visible with partial work')
 assert.equal(out.remainingWorkMs,null,'No claim about future timing without evidence')
})

test('opt out, disconnected Host and symbolic picket remain safe and truthful',()=>{
 const state={...freshLaborState(),pending:{id:3,kind:'break' as const,
  raisedAtElapsedMs:0,stage:'open' as const,counterOfferMs:null}}
 const before=JSON.stringify(state)
 const pending=agenda({...standard(),state,picketActive:true})
 assert.equal(pending.phase,'demand',
  'Symbolic picket never hides actionable Host demands')
 assert.equal(pending.symbolicPicketActive,true)
 assert.equal(pending.caseId,3)
 for(const out of [agenda({...standard(),enabled:false,state,picketActive:true}),
  agenda({...standard(),available:false,state,picketActive:true}),
  agenda({...standard(),state:null,picketActive:true})]){
  assert.equal(out.symbolicPicketActive,false,
   'No fictitious picket or action is shown with disabled/unavailable Host')
  assert.equal(out.caseId,null)
 }
 assert.equal(JSON.stringify(state),before,'No Host state mutation')
})
