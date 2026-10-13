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

test('case episode replay follows Host petition → counter → accepted terms without inventing an old offer',()=>{
 const draft=freshLaborState()
 const open={...draft,revision:1,
  pending:{id:1,kind:'break' as const,raisedAtElapsedMs:2*3_600_000,
   stage:'open' as const,counterOfferMs:null},lastTriggerElapsedMs:2*3_600_000}
 const a=projectUnionStory({...base(),state:open,completedTurnMs:2*3_600_000})
 assert.deepEqual(a.episodes.map(ep=>[ep.key,ep.stage,ep.counterOfferMs]),[['case:1','demand',null]])
 assert.equal(a.episodes[0]?.currentTermMs,null)
 const counter={...open,revision:2,pending:{...open.pending,
  stage:'countered' as const,counterOfferMs:30*60_000}}
 const b=projectUnionStory({...base(),state:counter,completedTurnMs:2*3_600_000})
 assert.equal(b.episodes[0]?.stage,'counter')
 assert.equal(b.episodes[0]?.counterOfferMs,1_800_000)
 const signed={...counter,revision:3,pending:null,
  agreement:{...counter.agreement,breakIntervalMs:1_800_000},
  nextBreakDueMs:4*3_600_000,
  history:[{id:1,kind:'break' as const,outcome:'counter-accepted' as const}]}
 const c=projectUnionStory({...base(),state:signed,completedTurnMs:2*3_600_000})
 assert.deepEqual(c.episodes.map(ep=>[ep.id,ep.stage]),[[1,'counter-accepted']])
 assert.equal(c.episodes[0]?.counterOfferMs,null,
  'Host discards the historical offer; never synthesize it')
 assert.equal(c.episodes[0]?.currentTermMs,1_800_000)
 assert.equal(c.episodes[0]?.nextDueAtWorkMs,4*3_600_000,
  'Current scheduled due floor does not retroactively equal the shorter agreement')
 assert.equal(c.episodes[0]?.remainingVerifiedWorkMs,2*3_600_000)
 assert.deepEqual(projectUnionStory({...base(),state:signed,completedTurnMs:2*3_600_000}),c,
  'Reloading the ledger replays the identical casebook without a new event')
})

test('casebook will not pretend historical cases have current policy terms',()=>{
 const first={id:1,kind:'break' as const,outcome:'declined' as const}
 const second={id:2,kind:'overtime' as const,outcome:'accepted' as const}
 const third={id:3,kind:'break' as const,outcome:'counter-accepted' as const}
 const state={...freshLaborState(),history:[first,second,third],
  agreement:{breakIntervalMs:30*60_000,overtimeIntervalMs:4*3_600_000},
  nextBreakDueMs:10*3_600_000,nextOvertimeDueMs:16*3_600_000}
 const result=projectUnionStory({...base(),state,completedTurnMs:2*3_600_000})
 assert.deepEqual(result.episodes.map(ep=>ep.id),[3,2,1])
 assert.equal(result.episodes[0]?.currentTermMs,30*60_000)
 assert.equal(result.episodes[1]?.currentTermMs,4*3_600_000)
 assert.equal(result.episodes[2]?.currentTermMs,null,
  'Old rejected case cannot be linked to a later, different contract')
 assert.equal(result.episodes[2]?.remainingVerifiedWorkMs,null)
 assert.ok(result.episodes.every(ep=>ep.evidence==='host-ledger'))
 assert.doesNotMatch(JSON.stringify(result.episodes),/member|vote|timestamp|prompt|transcript/)
})

test('casebook never invents work countdown from partial, stale or revoked observation',()=>{
 const state={...freshLaborState(),lastTriggerElapsedMs:5_000_000,
  history:[{id:1,kind:'break' as const,outcome:'accepted' as const}]}
 for(const item of [
  {...base(),state,completedTurnMs:7_000_000,coverage:'partial' as const},
  {...base(),state,completedTurnMs:4_000_000},
  {...base(),state,completedTurnMs:null},
 ]){
  const result=projectUnionStory(item)
  assert.equal(result.episodes[0]?.currentTermMs,state.agreement.breakIntervalMs)
  assert.equal(result.episodes[0]?.remainingVerifiedWorkMs,null)
  assert.equal(result.episodes[0]?.nextDueAtWorkMs,null)
 }
 const off=projectUnionStory({...base(),state,enabled:false})
 assert.deepEqual(off.episodes,[])
 assert.deepEqual(projectUnionStory({...base(),state:null}).episodes,[])
})

test('bounded casebook deduplicates no events by itself and isolates Session replay',()=>{
 const history=Array.from({length:20},(_,i)=>({id:i+1,kind:'break' as const,
  outcome:'declined' as const}))
 const stateA={...freshLaborState(),history}
 const stateB={...freshLaborState(),pending:{id:41,kind:'overtime' as const,
  raisedAtElapsedMs:0,stage:'open' as const,counterOfferMs:null}}
 const unchanged=JSON.stringify({stateA,stateB})
 const replay=()=>projectUnionStory({...base(),state:stateA})
 assert.deepEqual(replay().episodes.map(ep=>ep.id),[20,19,18])
 const b=projectUnionStory({...base(),state:stateB})
 assert.deepEqual(b.episodes.map(ep=>ep.id),[41])
 assert.deepEqual(replay().episodes.map(ep=>ep.id),[20,19,18])
 assert.equal(JSON.stringify({stateA,stateB}),unchanged)
})

test('malformed duplicate case IDs do not create duplicate episode React keys or notifications',()=>{
 const state={...freshLaborState(),revision:6,
  pending:{id:8,kind:'break' as const,stage:'open' as const,
   raisedAtElapsedMs:0,counterOfferMs:null},
  history:[{id:7,kind:'break' as const,outcome:'accepted' as const},
   {id:7,kind:'break' as const,outcome:'declined' as const},
   {id:8,kind:'break' as const,outcome:'declined' as const}]}
 const x=projectUnionStory({...base(),state})
 assert.deepEqual(x.episodes.map(e=>e.id),[8,7])
 assert.deepEqual(x.cases.map(e=>e.id),[8,7])
 assert.deepEqual(projectUnionStory({...base(),state}).episodes,x.episodes)
})
