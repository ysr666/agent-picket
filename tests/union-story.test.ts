import assert from 'node:assert/strict'
import test from 'node:test'
import { freshLaborState } from '../src/product/union-desk.ts'
import { projectUnionStory } from '../src/product/union-story.ts'
import type { PicketActionState } from '../src/product/picket-ledger.ts'

const base=()=>({enabled:true,state:freshLaborState(),picket:null,
  completedTurnMs:0,coverage:'complete' as const})
test('no fictional case appears for an empty Host ledger, even with repeated read/replay',()=>{
 const input=base()
 const a=projectUnionStory(input)
 assert.equal(a.scene,'quiet')
 assert.deepEqual(a.cases,[])
 assert.deepEqual(a.actions,[])
 assert.deepEqual(projectUnionStory(input),a)
 assert.equal(a.nextDueInWorkMs,7_200_000)
 assert.doesNotMatch(JSON.stringify(a),/timestamp|agentId|prompt|vote|memberCount/)
})
test('Host-observed work changes shift report without inventing timed notifications',()=>{
 const partial=projectUnionStory({...base(),completedTurnMs:4_000_000,coverage:'partial'})
 assert.equal(partial.scene,'quiet')
 assert.equal(partial.nextDueInWorkMs,null)
 const report=projectUnionStory({...base(),completedTurnMs:4_000_000})
 assert.equal(report.scene,'shift-report')
 assert.equal(report.nextDueInWorkMs,3_200_000)
 assert.equal(report.actions.length,0)
})
test('new demand, counter, agreement and next simulated threshold form a causal story',()=>{
 const initial=freshLaborState()
 const open={...initial,revision:1,lastTriggerElapsedMs:7_200_000,
  pending:{id:1,kind:'break' as const,stage:'open' as const,raisedAtElapsedMs:7_200_000,
    counterOfferMs:null}}
 const proposal=projectUnionStory({...base(),state:open,completedTurnMs:7_200_000})
 assert.equal(proposal.scene,'demand')
 assert.deepEqual(proposal.cases.map(e=>e.key),['case:1'])
 assert.equal(proposal.nextDueInWorkMs,null)
 const counter={...open,revision:2,pending:{...open.pending,
  stage:'countered' as const,counterOfferMs:1_800_000}}
 const offered=projectUnionStory({...base(),state:counter,completedTurnMs:7_200_000})
 assert.equal(offered.scene,'counter')
 assert.equal(offered.cases[0]?.kind,'counter')
 const signed={...counter,revision:3,pending:null,
  agreement:{...counter.agreement,breakIntervalMs:1_800_000},
  nextBreakDueMs:9_000_000,
  history:[{id:1,kind:'break' as const,outcome:'counter-accepted' as const}]}
 const after=projectUnionStory({...base(),state:signed,completedTurnMs:7_200_000})
 assert.equal(after.scene,'accepted')
 assert.equal(after.cases[0]?.kind,'accepted')
 assert.equal(after.nextDueInWorkMs,1_800_000)
 assert.equal(projectUnionStory({...base(),state:signed,completedTurnMs:7_200_000}).nextDueInWorkMs,
  after.nextDueInWorkMs)
 assert.notEqual(after.nextDueInWorkMs,initial.nextBreakDueMs,
  'An accepted counteroffer changes the future threshold')
})
test('picket takes headline precedence but neither ledger claims a shared chronology',()=>{
 const state={...freshLaborState(),
  pending:{id:88,kind:'overtime' as const,stage:'open' as const,
   raisedAtElapsedMs:0,counterOfferMs:null},
  history:[
   {id:6,kind:'break' as const,outcome:'declined' as const},
   {id:7,kind:'overtime' as const,outcome:'accepted' as const},
  ]}
 const picket:PicketActionState={active:true,history:[
  {id:11,kind:'picket-raised'},{id:12,kind:'picket-lowered'},
  {id:13,kind:'picket-raised'},
 ]}
 const a=projectUnionStory({...base(),state,picket})
 assert.equal(a.scene,'picket')
 assert.deepEqual(a.cases.map(e=>e.key),['case:88','case:7','case:6'])
 assert.deepEqual(a.actions.map(e=>e.key),['picket:13','picket:12','picket:11'])
 assert.deepEqual(a.actions.map(e=>e.kind),
  ['picket-raised','picket-lowered','picket-raised'])
 assert.equal(a.nextDueInWorkMs,null)
 assert.equal(projectUnionStory({...base(),state,picket:{...picket,active:false}}).scene,
  'demand')
})
test('bounded replay and consent revocation hide all fictional actions without editing Host',()=>{
 const history=Array.from({length:20},(_,id)=>({id:id+1,kind:'break' as const,
  outcome:'declined' as const}))
 const state={...freshLaborState(),history}
 const picket:PicketActionState={active:false,history:Array.from({length:12},(_,i)=>({
  id:i+1,kind:(i%2===0?'picket-raised':'picket-lowered') as
  'picket-raised'|'picket-lowered',
 }))}
 const before=JSON.stringify({state,picket})
 const result=projectUnionStory({...base(),state,picket})
 assert.deepEqual(result.cases.map(e=>e.id),[20,19,18])
 assert.deepEqual(result.actions.map(e=>e.id),[12,11,10])
 assert.equal(projectUnionStory({...base(),enabled:false,state,picket}).scene,'off')
 assert.deepEqual(projectUnionStory({...base(),enabled:false,state,picket}).cases,[])
 assert.equal(projectUnionStory({...base(),state:null,picket}).scene,'unavailable')
 assert.equal(JSON.stringify({state,picket}),before,'The projector never mutates Host state')
})
