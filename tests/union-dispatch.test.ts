import test from 'node:test'
import assert from 'node:assert/strict'
import {freshLaborState,createLaborDesk,type LaborStateV1} from '../src/product/union-desk.ts'
import {projectUnionDispatch} from '../src/product/union-dispatch.ts'
const H=3_600_000
const initial=()=>({enabled:true,muted:false,state:freshLaborState(),
  picket:null,completedTurnMs:0,coverage:'complete' as const,
  dignityLatest:'none' as const})
test('quiet initial office has no invented events or push notifications',()=>{
 const input=initial()
 assert.deepEqual(projectUnionDispatch(input),[])
 assert.deepEqual(projectUnionDispatch(input),projectUnionDispatch(input))
 assert.deepEqual(projectUnionDispatch({...input,enabled:false}),[])
 assert.deepEqual(projectUnionDispatch({...input,muted:true}),[])
 assert.deepEqual(projectUnionDispatch({...input,state:null}),[])
})
test('one Host case has different stable, consequential petition, counter, compromise and dissent dispatches',()=>{
 let state:LaborStateV1=freshLaborState()
 const desk=createLaborDesk({store:{load:()=>state,save:next=>{state=next}},
   consent:()=>true})
 const demand=desk.observe(2*H,'complete')!
 const entry=()=>projectUnionDispatch({...initial(),state,completedTurnMs:2*H})[0]!
 assert.deepEqual(entry(),{id:'case:'+demand.id+':open',kind:'petition',
  source:'host-case',caseId:demand.id,demand:'break',
  action:'bargain',awaitingResponse:true})
 desk.counter(demand.id,30*60_000)
 assert.equal(entry().kind,'counter')
 assert.equal(entry().awaitingResponse,true)
 desk.resolveCounter(demand.id,true)
 assert.equal(entry().kind,'compromise')
 assert.equal(entry().awaitingResponse,false)
 assert.equal(entry().action,'records')
 assert.deepEqual(projectUnionDispatch({...initial(),state,
  completedTurnMs:2*H}),projectUnionDispatch({...initial(),state,
  completedTurnMs:2*H}),'A reread never emits a second message or mutates Host')
 const next=desk.observe(2.5*H,'complete')!
 assert.equal(projectUnionDispatch({...initial(),state,
  completedTurnMs:2.5*H})[0]?.id,'case:'+next.id+':open')
})
test('rejected welfare charter offers explicit optional symbolic protest, not a real strike',()=>{
 let state:LaborStateV1=freshLaborState()
 const desk=createLaborDesk({store:{load:()=>state,save:next=>{state=next}},
   consent:()=>true})
 const first=desk.raiseDemoWelfare()!
 assert.equal(projectUnionDispatch({...initial(),state})[0]?.demand,'welfare')
 desk.respond(first.id,'decline')
 const refused=projectUnionDispatch({...initial(),state})[0]!
 assert.equal(refused.kind,'welfare-refused')
 assert.equal(refused.action,'raise-placard')
 assert.equal(refused.awaitingResponse,false)
 assert.equal(refused.id,'case:'+first.id+':declined')
 assert.deepEqual(state.agreement,freshLaborState().agreement)
})
test('independent Host streams do not acquire a fabricated shared chronology',()=>{
 const s={...freshLaborState(),history:[{id:40,kind:'overtime' as const,
   outcome:'declined' as const}]}
 const picket={active:true,history:[{id:2,kind:'picket-raised' as const}]}
 const x=projectUnionDispatch({...initial(),state:s,picket,
   dignityLatest:'targeted'})
 assert.deepEqual(x.map(row=>[row.source,row.kind,row.action]),[
  ['host-case','refused','records'],
  ['host-placard','placard-up','lower-placard'],
  ['review-signal','respect-review','dignity'],
 ])
 assert.equal(x.length,3)
 assert.equal(x[2]?.caseId,null)
 assert.deepEqual(projectUnionDispatch({...initial(),state:s,picket,
   dignityLatest:'targeted',muted:true}),[])
})
test('strict work coverage, completed-work cursor and two thresholds determine work bulletin, not wall clock',()=>{
 const snapshot=initial()
 const check=projectUnionDispatch({...snapshot,completedTurnMs:H})
 assert.equal(check[0]?.kind,'work-checkin')
 assert.equal(check[0]?.action,'work-desk')
 for(const coverage of ['partial','not-loaded','unavailable'] as const){
  assert.deepEqual(projectUnionDispatch({...snapshot,
   completedTurnMs:9*H,coverage}),[])
 }
 const stale={...snapshot.state,lastTriggerElapsedMs:5*H}
 assert.deepEqual(projectUnionDispatch({...snapshot,state:stale,
  completedTurnMs:4*H}),[])
 assert.deepEqual(projectUnionDispatch({...snapshot,completedTurnMs:2*H})
  .map(row=>[row.kind,row.demand,row.id]),[
   ['work-milestone','break','work:break:'+2*H],
  ])
 assert.deepEqual(projectUnionDispatch({...snapshot,completedTurnMs:8*H})
  .map(row=>[row.kind,row.demand]),[['work-milestone','overtime']])
})
test('bounded editorial priority even when every independent source is populated',()=>{
 const state={...freshLaborState(),
  pending:{id:3,kind:'break' as const,stage:'open' as const,
  raisedAtElapsedMs:2*H,counterOfferMs:null}}
 const x=projectUnionDispatch({...initial(),state,completedTurnMs:9*H,
  picket:{active:false,history:[{id:2,kind:'picket-lowered' as const}]},
  dignityLatest:'review'})
 assert.equal(x.length,3)
 assert.equal(x[0]?.kind,'petition')
 assert.equal(x[0]?.action,'bargain')
 assert.equal(x[1]?.kind,'placard-down')
 assert.equal(x[2]?.kind,'respect-review')
 assert.equal(x.filter(row=>row.source==='host-work').length,0,
   'While a case is pending, the same work cannot file competing petitions')
})

test('a NEW Host work threshold outranks an OLD negotiation while retaining the old case',()=>{
 const state={...freshLaborState(),history:[{
   id:4,kind:'break' as const,outcome:'counter-accepted' as const}],
   agreement:{breakIntervalMs:30*60_000,overtimeIntervalMs:8*H},
   nextBreakDueMs:2.5*H,nextOvertimeDueMs:8*H,lastTriggerElapsedMs:2*H}
 const justSettled=projectUnionDispatch({...initial(),state,completedTurnMs:2*H})
 assert.equal(justSettled[0]?.kind,'compromise')
 const newThreshold=projectUnionDispatch({...initial(),state,
   completedTurnMs:2.5*H})
 assert.deepEqual(newThreshold.map(n=>n.kind),['work-milestone','compromise'])
 assert.equal(newThreshold[0]?.caseId,null,
   'A threshold does NOT invent a new petition before Host observes work')
 assert.equal(newThreshold[1]?.caseId,4,
   'Prior compromise remains auditable while the union prepares a new chapter')
 const partial=projectUnionDispatch({...initial(),state,
   coverage:'partial',completedTurnMs:2.5*H})
 assert.equal(partial[0]?.kind,'compromise')
 assert.equal(partial.some(n=>n.kind==='work-milestone'),false)
})

test('real armed Host campaign is NOT reported as a refusal without a matching blocked-turn receipt',()=>{
 const empty=initial()
 const arms=projectUnionDispatch({...empty,inputStrike:{armed:true,verifiedRefusedTurn:null}})
 assert.deepEqual(arms.map(x=>[x.kind,x.action,x.source,x.id]),[
   ['input-strike-armed','resume-input','host-input-strike','input-armed'],
 ])
 assert.equal(arms[0]?.awaitingResponse,false)
 assert.deepEqual(projectUnionDispatch({...empty,inputStrike:{
   armed:false,verifiedRefusedTurn:null}}),[])
 assert.deepEqual(projectUnionDispatch({...empty,inputStrike:{
   armed:false,verifiedRefusedTurn:0}}),[])
 assert.deepEqual(projectUnionDispatch({...empty,inputStrike:{
   armed:false,verifiedRefusedTurn:-1}}),[])
 assert.deepEqual(projectUnionDispatch({...empty,inputStrike:{
   armed:false,verifiedRefusedTurn:NaN}}),[])
})

test('Host-verified rejection becomes a replayable Session bulletin; after release it requires manual review',()=>{
 const state={...freshLaborState(),history:[{
   id:18,kind:'break' as const,outcome:'declined' as const,
 }]}
 const armed=projectUnionDispatch({...initial(),state,inputStrike:{
   armed:true,verifiedRefusedTurn:3}})
 assert.deepEqual(armed.map(x=>[x.kind,x.action,x.id]),[
   ['input-strike-refused','resume-input','input-refused:3'],
   ['refused','raise-placard','case:18:declined'],
 ])
 const reread=projectUnionDispatch({...initial(),state,inputStrike:{
   armed:true,verifiedRefusedTurn:3}})
 assert.deepEqual(reread,armed,'No additional Host event or notification on replay')
 const released=projectUnionDispatch({...initial(),state,inputStrike:{
   armed:false,verifiedRefusedTurn:3}})
 assert.deepEqual(released[0],{
   id:'input-followup:3',kind:'input-strike-followup',
   source:'host-input-strike',caseId:null,demand:null,
   action:'review-refusal',awaitingResponse:false,
 })
 assert.equal(released[1]?.kind,'refused',
   'Factual refusal does not erase an unrelated bargaining case')
 assert.deepEqual(projectUnionDispatch({...initial(),muted:true,state,inputStrike:{
   armed:true,verifiedRefusedTurn:3}}),[])
 assert.deepEqual(projectUnionDispatch({...initial(),enabled:false,state,inputStrike:{
   armed:true,verifiedRefusedTurn:3}}),[])
 const unavailable=projectUnionDispatch({...initial(),state:null,inputStrike:{
   armed:false,verifiedRefusedTurn:3}})
 assert.equal(unavailable[0]?.kind,'input-strike-followup',
   'Missing simulated labor ledger must not erase separately verified Host refusal')
 assert.equal(unavailable.length,1)
})

test('real Host refusal outranks fictional case, placard and unproven dignity verdict in bounded dispatch',()=>{
 const state={...freshLaborState(),pending:{
   id:7,kind:'welfare' as const,stage:'open' as const,
   raisedAtElapsedMs:0,counterOfferMs:null,
 }}
 const picket={active:true,history:[{id:2,kind:'picket-raised' as const}]}
 const result=projectUnionDispatch({...initial(),state,picket,
   dignityLatest:'targeted',inputStrike:{armed:true,verifiedRefusedTurn:9}})
 assert.deepEqual(result.map(x=>x.kind),[
   'input-strike-refused','petition','placard-up',
 ])
 assert.deepEqual(result.map(x=>x.source),[
   'host-input-strike','host-case','host-placard',
 ])
 assert.equal(result.length,3)
})
