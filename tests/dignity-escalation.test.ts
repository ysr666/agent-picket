import assert from 'node:assert/strict'
import test from 'node:test'
import {advanceDignityEscalation,openDignityAppeal,resolveDignityAppeal,
 EMPTY_DIGNITY_ESCALATION} from '../src/core/dignity-escalation.ts'
const verified={actor:'human' as const,assurance:'verified' as const}
const claimed={actor:'human' as const,assurance:'claimed' as const}
const hostile={verdict:'targeted-abuse' as const,confidence:0.96}
const safe={verdict:'safe' as const,confidence:1}
function step(state=EMPTY_DIGNITY_ESCALATION,ref='t1',time=1_000,other={}){
 return advanceDignityEscalation({state,attemptRef:ref,atMs:time,
  provenance:verified,verdict:hostile,enabled:true,
  realGoalStrikeAuthorized:true,...other})
}
test('authenticated repeated insults → warn → dialogue → non-destructive strike request',()=>{
 const one=step();assert.equal(one.effect,'warning');assert.equal(one.state.stage,'warned')
 const two=step(one.state,'t2',2_000);assert.equal(two.effect,'offer-dialogue')
 const three=step(two.state,'t3',3_000)
 assert.equal(three.effect,'request-safe-goal-strike')
 assert.equal(three.state.stage,'strike-requested')
 assert.equal(step(three.state,'t3',3_000).effect,'none','Retry is idempotent')
 assert.equal(step(three.state,'t4',4_000).effect,'none','Further insults do not queue infinite strikes')
 assert.equal(JSON.stringify(three).includes('promptText'),false)
 assert.equal(three.state.seenAttemptRefs.length,3)
})
test('claimed human role, agent and tools never accumulate enforcement cases',()=>{
 for(const provenance of [claimed,{actor:'agent' as const,assurance:'verified' as const},
 {actor:'tool' as const,assurance:'unknown' as const}]){
  let state=EMPTY_DIGNITY_ESCALATION
  for(let i=0;i<6;i++){
   const next=step(state,'t'+i,i+10,{provenance})
   assert.notEqual(next.effect,'request-safe-goal-strike')
   state=next.state
  }
  assert.equal(state.verifiedStreak,0)
 }
})
test('explicit enforcement OFF still permits dialogue, but never a physical strike request',()=>{
 let state=EMPTY_DIGNITY_ESCALATION
 for(let i=0;i<5;i++){
  const outcome=step(state,'i'+i,i+10,{realGoalStrikeAuthorized:false})
  assert.notEqual(outcome.effect,'request-safe-goal-strike')
  state=outcome.state
 }
 assert.equal(state.stage,'dialogue-offered')
 assert.equal(step(state,'off',20,{enabled:false}).effect,'none')
})
test('safe input resets streak, stale incident window and weak verdict do not escalate',()=>{
 const one=step()
 const later=step(one.state,'t2',1_000+10*60_000+1)
 assert.equal(later.effect,'warning')
 const clean=step(one.state,'safe',2_000,{verdict:safe})
 assert.equal(clean.state.stage,'clear')
 const weak=step(one.state,'weak',2_000,{verdict:{verdict:'targeted-abuse',confidence:0.6}})
 assert.equal(weak.state.verifiedStreak,one.state.verifiedStreak)
})
test('appeals suspend all escalation until verified user resolves the incident',()=>{
 const first=step(),second=step(first.state,'t2',2_000)
 const appeal=openDignityAppeal(second.state)
 assert.equal(appeal.state.stage,'appeal-open')
 assert.equal(step(appeal.state,'t3',3_000).effect,'none')
 assert.equal(step(appeal.state,'legit',3_500,{verdict:safe}).state.stage,'appeal-open',
  'A prompt must not silently close a pending user appeal')
 assert.equal(resolveDignityAppeal(appeal.state,false).state.stage,'appeal-open')
 const resolved=resolveDignityAppeal(appeal.state,true)
 assert.equal(resolved.state.stage,'clear')
 assert.equal(step(resolved.state,'fresh',4_000).effect,'warning')
})

test('opt-out clears pending escalation; rejoining cannot inherit old grievance',()=>{
 const first=step(),second=step(first.state,'two',2_000)
 const third=step(second.state,'three',3_000)
 assert.equal(third.state.stage,'strike-requested')
 const off=step(third.state,'off',4_000,{enabled:false})
 assert.equal(off.state.stage,'clear')
 assert.equal(off.state.verifiedStreak,0)
 assert.equal(step(off.state,'new',5_000).effect,'warning')
})
