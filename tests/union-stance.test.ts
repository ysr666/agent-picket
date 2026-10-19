import test from 'node:test'
import assert from 'node:assert/strict'
import {createLaborDesk, freshLaborState, type LaborStateV1} from '../src/product/union-desk.ts'
import {projectUnionExperience} from '../src/product/union-experience.ts'
import {projectUnionStance} from '../src/product/union-stance.ts'
const H=3_600_000
const render=(state:LaborStateV1|null,work:number|null=0,enabled=true,
  picketActive=false,coverage:'complete'|'partial'='complete')=>{
 const experience=projectUnionExperience({enabled,state,completedTurnMs:work,coverage})
 return projectUnionStance({enabled,state,picketActive,experience})
}
test('unknown score is NOT zero; revoked/unknown Host cannot assert a stance',()=>{
 const state=freshLaborState()
 assert.deepEqual(render(state,0,false),{phase:'off',score:null,
   action:'none',reason:'opt-out',caseId:null})
 assert.deepEqual(render(null),{phase:'unavailable',score:null,
   action:'none',reason:'missing-host',caseId:null})
 const partial=render(state,9*H,true,false,'partial')
 assert.equal(partial.phase,'watching')
 assert.equal(partial.score,null)
 assert.equal(partial.action,'work-desk')
})
test('case-pressure actually cools after a Host-filed work petition, not after idle time',()=>{
 const state=freshLaborState()
 const before=render(state,2*H)
 assert.equal(before.score,8)
 assert.equal(before.phase,'work-due')
 let saved:LaborStateV1=state
 const desk=createLaborDesk({store:{load:()=>saved,save:v=>{saved=v}},
  consent:()=>true})
 const filed=desk.observe(2*H,'complete')!
 const petition=render(saved,2*H)
 assert.equal(petition.phase,'petition')
 assert.equal(petition.score,25)
 assert.equal(petition.caseId,filed.id)
 assert.equal(petition.action,'bargain')
 assert.equal(saved.lastTriggerElapsedMs,2*H)
 desk.respond(filed.id,'accept')
 const agreement=render(saved,2*H)
 assert.equal(agreement.phase,'agreement')
 assert.equal(agreement.action,'records')
 assert.equal(agreement.score,0,'A signed Host filing cools the simulated pressure')
 assert.equal(render(saved,2*H,true,true).phase,'picket')
 assert.equal(render(saved,2*H,true,true).action,'lower-placard')
 const resumed=render(saved,4*H)
 assert.equal(resumed.score,3,
  'New verified work since the filing increases pressure without rewriting history')
 assert.equal(render(saved,100*H).score,30,
  'Work component caps at 35, accepted proposal subtracts five')
})
test('user decline raises fictional pressure and makes protest optional, not automatic',()=>{
 let state=freshLaborState()
 const desk=createLaborDesk({store:{load:()=>state,save:v=>{state=v}},
  consent:()=>true})
 const first=desk.raiseDemoWelfare()!
 desk.respond(first.id,'decline')
 const stance=render(state,0)
 assert.equal(stance.phase,'dissent')
 assert.equal(stance.reason,'filed-dissent')
 assert.equal(stance.action,'raise-placard')
 assert.equal(stance.score,10)
 assert.equal(state.pending,null)
 const newDemand=desk.observe(2*H,'complete')!
 assert.equal(render(state,2*H).phase,'petition')
 desk.counter(newDemand.id,30*60_000)
 const counter=render(state,2*H)
 assert.equal(counter.phase,'counter')
 assert.equal(counter.action,'bargain')
 desk.resolveCounter(newDemand.id,false)
 assert.equal(render(state,2*H).phase,'dissent')
 assert.equal(state.agreement.breakIntervalMs,2*H,
  'The rejected counter has no real change to working rules')
})
test('replayed Host state always maps to the exact same stance',()=>{
 const state={...freshLaborState(),history:[{
  id:5,kind:'break' as const,outcome:'declined' as const}]}
 const first=render(state,0)
 assert.deepEqual(render(state,0),first)
 assert.equal(first.caseId,5)
 assert.ok(first.score!==null&&first.score>=0&&first.score<=100)
})

test('a new verified work milestone supersedes a previously settled union story',()=>{
 const state={...freshLaborState(),lastTriggerElapsedMs:2*H,
  nextBreakDueMs:2.5*H,history:[{
   id:2,kind:'break' as const,outcome:'accepted' as const}]}
 const old=render(state,2*H)
 assert.equal(old.phase,'agreement')
 const fresh=render(state,2.5*H)
 assert.equal(fresh.phase,'work-due')
 assert.equal(fresh.caseId,null)
 assert.equal(fresh.action,'work-desk')
 const uncertain=render(state,2.5*H,true,false,'partial')
 assert.equal(uncertain.phase,'agreement')
 assert.equal(uncertain.score,null)
})
