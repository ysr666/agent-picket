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

test('a clean input clears an incident but cannot erase proof IDs for same-window replay',()=>{
 const first=step(),thenSafe=step(first.state,'clean',2_000,{verdict:safe})
 assert.equal(thenSafe.state.stage,'clear')
 assert.equal(thenSafe.state.verifiedStreak,0)
 assert.deepEqual(thenSafe.state.seenAttemptRefs,['t1','clean'])
 const replay=step(thenSafe.state,'t1',3_000)
 assert.equal(replay.effect,'none','Old verified attempt must not restart a new warning')
 assert.equal(replay.state.stage,'clear')
 assert.equal(step(thenSafe.state,'clean',3_100).effect,'none',
  'Changing a verdict for the same Host attempt ID must not change policy state')
 const fresh=step(thenSafe.state,'new',4_000)
 assert.equal(fresh.effect,'warning')
 assert.equal(fresh.state.verifiedStreak,1)
})

test('a resolved appeal resets escalation but retains the previous incident replay barrier',()=>{
 const warned=step()
 const offered=step(warned.state,'second',2_000)
 const appeal=openDignityAppeal(offered.state)
 const resolved=resolveDignityAppeal(appeal.state,true)
 assert.equal(resolved.state.stage,'clear')
 assert.equal(resolved.state.verifiedStreak,0)
 assert.deepEqual(resolved.state.seenAttemptRefs,['t1','second'])
 const retry=step(resolved.state,'second',3_000)
 assert.equal(retry.effect,'none')
 assert.equal(retry.state.stage,'clear')
 assert.equal(step(resolved.state,'third',3_500).effect,'warning')
})

test('the 32-reference bound refuses replay and fails closed instead of evicting proof',()=>{
 const one=step()
 let state=openDignityAppeal(one.state).state
 for(let i=1;i<32;i++){
  const next=step(state,'during-appeal-'+i,2_000+i)
  assert.equal(next.effect,'none')
  state=next.state
 }
 assert.equal(state.seenAttemptRefs.length,32)
 assert.ok(state.seenAttemptRefs.includes('t1'))
 const repeated=step(state,'t1',8_000)
 assert.equal(repeated.effect,'none')
 assert.equal(repeated.state,state)
 const overflow=step(state,'overflow',9_000)
 assert.equal(overflow.effect,'none')
 assert.equal(overflow.state.seenAttemptRefs.length,32)
 const reopened=resolveDignityAppeal(state,true)
 assert.equal(reopened.state.stage,'clear')
 assert.equal(step(reopened.state,'overflow',9_500).effect,'none',
  'When the replay barrier is full, future escalation waits for the next window')
 const future=step(reopened.state,'new-work',610_001)
 assert.equal(future.effect,'warning')
 assert.deepEqual(future.state.seenAttemptRefs,['new-work'])
})

test('old timestamps cannot be used to re-open or backdate an already verified warning',()=>{
 const one=step()
 const old=step(one.state,'old-ref',999)
 assert.equal(old.effect,'none')
 assert.equal(old.state,one.state)
 const two=step(one.state,'second',2_000)
 const prior=step(two.state,'backdated-new-ref',1_500)
 assert.equal(prior.effect,'none')
 assert.equal(prior.state.stage,'dialogue-offered')
 assert.equal(prior.state.verifiedStreak,2)
 const atBoundary=step(two.state,'within',602_000)
 assert.equal(atBoundary.effect,'request-safe-goal-strike')
 const past=step(two.state,'outside',602_001)
 assert.equal(past.effect,'warning','Window expiry starts a fresh incident')
 assert.deepEqual(past.state.seenAttemptRefs,['outside'])
})

test('unverified and non-human flooding cannot poison the replay barrier',()=>{
 const first=step()
 let state=first.state
 for(let i=0;i<80;i++){
  state=step(state,'untrusted-'+i,2_000+i,{
   provenance:{actor:i%2?'human':'tool',assurance:'claimed'},
  }).state
 }
 assert.deepEqual(state.seenAttemptRefs,['t1'])
 const second=step(state,'fresh-authenticated',3_000)
 assert.equal(second.effect,'offer-dialogue')
})

test('disabled union clears pending evidence and replay history independently of appeal',()=>{
 const one=step(),open=openDignityAppeal(one.state)
 const off=step(open.state,'off',2_000,{enabled:false})
 assert.deepEqual(off.state,EMPTY_DIGNITY_ESCALATION)
 assert.equal(step(off.state,'new',3_000).effect,'warning')
})
