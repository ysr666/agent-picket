import test from 'node:test'
import assert from 'node:assert/strict'
import {createLaborDesk,freshLaborState,parseLaborState,
  type LaborStateV1} from '../src/product/union-desk.ts'
import {projectUnionStory} from '../src/product/union-story.ts'
import {projectUnionExperience} from '../src/product/union-experience.ts'
import {projectUnionAgenda} from '../src/product/union-agenda.ts'
const H=3_600_000
function fixture(){
 let state:LaborStateV1=freshLaborState(), enabled=true,writes=0
 const desk=createLaborDesk({store:{load:()=>state,save:next=>{state=next;writes++}},
  consent:()=>enabled})
 return {desk,get:()=>state,writes:()=>writes,disable:()=>{enabled=false}}
}
const story=(state:LaborStateV1,enabled=true)=>projectUnionStory({
 enabled,state,picket:null,completedTurnMs:0,coverage:'complete'})
const agenda=(state:LaborStateV1,enabled=true)=>projectUnionAgenda({
 enabled,available:true,state,picketActive:false,completedTurnMs:0,
 coverage:'complete'})
test('manual AI welfare charter is a durable Host petition, never a pay or strike operation',()=>{
 const f=fixture(), original=f.get(), first=f.desk.raiseDemoWelfare()
 assert.ok(first)
 assert.equal(first.kind,'welfare')
 assert.equal(first.raisedAtElapsedMs,0,
  'The voluntary charter cannot manufacture hours of work')
 assert.equal(f.desk.raiseDemoBreak(),null,'Only one live case per Session')
 assert.equal(f.get().pending?.kind,'welfare')
 assert.equal(agenda(f.get()).phase,'demand')
 assert.equal(agenda(f.get()).kind,'welfare')
 assert.equal(story(f.get()).episodes[0]?.kind,'welfare')
 const count=f.writes()
 assert.throws(()=>f.desk.counter(first.id,30*60_000),/only supports accept\/decline/)
 assert.equal(f.writes(),count,'No partial Host mutation on invalid numeric welfare counter')
 assert.equal(f.get().pending?.stage,'open')
 f.desk.respond(first.id,'accept')
 const signed=f.get()
 assert.equal(signed.pending,null)
 assert.deepEqual(signed.history,[{id:first.id,kind:'welfare',outcome:'accepted'}])
 assert.deepEqual(signed.agreement,original.agreement,
  'A ceremonial welfare pledge grants no actual time, salary or paid leave')
 assert.equal(signed.nextBreakDueMs,original.nextBreakDueMs)
 assert.equal(signed.nextOvertimeDueMs,original.nextOvertimeDueMs)
 assert.equal(signed.lastTriggerElapsedMs,0)
 assert.equal(agenda(signed).phase,'resolved')
 assert.equal(agenda(signed).kind,'welfare')
 assert.equal(agenda(signed).currentTermMs,null,
  'No invented numeric welfare agreement')
 assert.equal(story(signed).episodes[0]?.currentTermMs,null)
 assert.equal(story(signed).episodes[0]?.nextDueAtWorkMs,null)
 assert.equal(projectUnionExperience({enabled:true,state:signed,coverage:'complete',
  completedTurnMs:0}).latestResolution?.currentIntervalMs,null)
 assert.deepEqual(parseLaborState(JSON.parse(JSON.stringify(signed))),signed,
  'Existing ledger schema stores welfare correctly without a destructive migration')
 assert.deepEqual(story(signed),story(signed),'No random events, time, autonomous vote or model output')
})
test('welfare dissent persists; new verified Host work still triggers ordinary break request',()=>{
 const f=fixture(), first=f.desk.raiseDemoWelfare()!
 f.desk.respond(first.id,'decline')
 assert.equal(f.get().history.at(-1)?.outcome,'declined')
 assert.equal(f.desk.observe(H,'partial'),null)
 assert.equal(f.desk.observe(0,'complete'),null)
 const next=f.desk.observe(2*H,'complete')
 assert.ok(next)
 assert.equal(next.kind,'break')
 assert.notEqual(next.id,first.id)
 assert.equal(story(f.get()).episodes[1]?.kind,'welfare')
 assert.equal(f.get().history[0]?.kind,'welfare')
 f.disable()
 assert.equal(f.desk.raiseDemoWelfare(),null)
 assert.equal(agenda(f.get(),false).phase,'off')
 assert.equal(story(f.get(),false).episodes.length,0)
})
test('strict welfare schema rejects synthetic counteroffers and injected prompt material',()=>{
 const state=freshLaborState()
 for(const malformed of [
  {...state,pending:{id:1,kind:'welfare',stage:'countered',raisedAtElapsedMs:0,
   counterOfferMs:30*60_000}},
  {...state,pending:{id:1,kind:'welfare',stage:'open',raisedAtElapsedMs:0,
   counterOfferMs:null,transcript:'private secret'}},
  {...state,history:[{id:1,kind:'welfare',outcome:'accepted',modelText:'leak'}]},
  {...state,history:[{id:1,kind:'welfare',outcome:'counter-accepted'}]},
  {...state,history:[{id:1,kind:'welfare',outcome:'counter-declined'}]},
 ]){
  assert.equal(parseLaborState(malformed),null)
 }
 assert.equal(parseLaborState({...state,pending:{id:1,kind:'welfare',
  stage:'open',raisedAtElapsedMs:0,counterOfferMs:null}})?.pending?.kind,'welfare')
})
test('welfare petitions retain fixed bounded Host history and no duplicate live petition',()=>{
 const f=fixture()
 for(let i=0;i<27;i++){
  const item=f.desk.raiseDemoWelfare()!
  assert.equal(f.desk.raiseDemoWelfare(),null)
  f.desk.respond(item.id,i%2===0?'decline':'accept')
 }
 assert.equal(f.get().history.length,20)
 assert.equal(f.get().history.at(-1)?.kind,'welfare')
 assert.ok(f.get().history.every(row=>row.kind==='welfare'))
 assert.deepEqual(f.get().agreement,freshLaborState().agreement)
 assert.equal(f.get().nextBreakDueMs,2*H)
})
