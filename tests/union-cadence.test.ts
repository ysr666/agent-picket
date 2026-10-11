import assert from 'node:assert/strict'
import test from 'node:test'
import { freshLaborState } from '../src/product/union-desk.ts'
import { projectUnionCadence } from '../src/product/union-cadence.ts'

const H=3_600_000
const baseline=()=>({enabled:true,state:freshLaborState(),
  completedTurnMs:0,coverage:'complete' as const})

test('cadence is passive, deterministic and separate for rest and overtime',()=>{
 const input=baseline(),before=JSON.stringify(input)
 const a=projectUnionCadence(input)
 assert.equal(a.status,'working')
 assert.deepEqual(a.rows.map(row=>[row.kind,row.remainingWorkMs,row.thresholdReached]),[
  ['break',2*H,false],['overtime',8*H,false],
 ])
 assert.deepEqual(projectUnionCadence(input),a)
 assert.equal(JSON.stringify(input),before)
 assert.doesNotMatch(JSON.stringify(a),/timer|timestamp|prompt|vote|message/)
})
test('verified completed work alone crosses policy milestones, without a clock or automatic action',()=>{
 const rest=projectUnionCadence({...baseline(),completedTurnMs:2*H})
 assert.equal(rest.status,'ready')
 assert.deepEqual(rest.rows.map(row=>row.remainingWorkMs),[0,6*H])
 assert.deepEqual(rest.rows.map(row=>row.thresholdReached),[true,false])
 const overtime=projectUnionCadence({...baseline(),completedTurnMs:8*H})
 assert.deepEqual(overtime.rows.map(row=>row.thresholdReached),[true,true])
 assert.equal(overtime.pendingId,null,'Projection never manufactures Host grievances')
})
test('consent OFF, corrupt, partial and missing work evidence fail closed',()=>{
 const input={...baseline(),completedTurnMs:9*H}
 const off=projectUnionCadence({...input,enabled:false})
 assert.equal(off.status,'off')
 assert.deepEqual(off.rows,[])
 const unknown=projectUnionCadence({...input,state:null})
 assert.equal(unknown.status,'unavailable')
 assert.deepEqual(unknown.rows,[])
 for(const coverage of ['partial','not-loaded','unavailable'] as const){
  const data=projectUnionCadence({...input,coverage})
  assert.equal(data.status,'unverified')
  assert.ok(data.rows.every(row=>row.remainingWorkMs===null&&!row.thresholdReached))
 }
 for(const bad of [NaN,-1,1.5,Infinity]){
  assert.equal(projectUnionCadence({...input,completedTurnMs:bad}).status,'unverified')
 }
})
test('existing open grievance freezes new demands even when both thresholds reached',()=>{
 const state={...freshLaborState(),pending:{
  id:4,kind:'overtime' as const,raisedAtElapsedMs:8*H,
  stage:'countered' as const,counterOfferMs:4*H}}
 const out=projectUnionCadence({...baseline(),completedTurnMs:10*H,state})
 assert.equal(out.status,'pending')
 assert.equal(out.pendingId,4)
 assert.deepEqual(out.rows.map(row=>row.thresholdReached),[true,true])
})
test('negotiated interval cannot retroactively override original due floor',()=>{
 const state={...freshLaborState(),agreement:{
  breakIntervalMs:H/2,overtimeIntervalMs:4*H,
 },nextBreakDueMs:2*H,nextOvertimeDueMs:8*H}
 const out=projectUnionCadence({...baseline(),state,completedTurnMs:H})
 assert.deepEqual(out.rows.map(row=>row.agreedIntervalMs),[H/2,4*H])
 assert.deepEqual(out.rows.map(row=>row.remainingWorkMs),[H,7*H])
})
test('read-only per-Session projection is isolated and has no shared dedupe state',()=>{
 const a=projectUnionCadence({...baseline(),completedTurnMs:3*H})
 const stateB={...freshLaborState(),nextBreakDueMs:5*H}
 const b=projectUnionCadence({...baseline(),state:stateB,completedTurnMs:3*H})
 assert.equal(a.status,'ready')
 assert.equal(b.status,'working')
 assert.equal(projectUnionCadence({...baseline(),completedTurnMs:3*H}).status,'ready')
})


test('stale completed work behind Host last-trigger cursor cannot claim eligibility',()=>{
 const state={...freshLaborState(),lastTriggerElapsedMs:10*H,
  nextBreakDueMs:12*H,nextOvertimeDueMs:16*H}
 const r=projectUnionCadence({...baseline(),state,completedTurnMs:8*H})
 assert.equal(r.status,'unverified')
 assert.ok(r.rows.every(row=>row.remainingWorkMs===null&&!row.thresholdReached))
 assert.equal(projectUnionCadence({...baseline(),state,completedTurnMs:12*H}).status,'ready')
})
test('real pending petition remains visible even when work evidence is partial',()=>{
 const state={...freshLaborState(),pending:{id:14,kind:'break' as const,
  stage:'open' as const,counterOfferMs:null,raisedAtElapsedMs:0}}
 const r=projectUnionCadence({...baseline(),state,coverage:'partial',completedTurnMs:null})
 assert.equal(r.status,'pending')
 assert.equal(r.pendingId,14)
 assert.ok(r.rows.every(row=>row.remainingWorkMs===null))
})
