import assert from 'node:assert/strict'
import test from 'node:test'
import { freshLaborState } from '../src/product/union-desk.ts'
import { projectUnionExperience } from '../src/product/union-experience.ts'

const fresh = () => freshLaborState()
test('fictional discontent never claims a score for missing or partial Host work', () => {
  for (const coverage of ['partial','not-loaded','unavailable'] as const) {
    const r=projectUnionExperience({enabled:true,state:fresh(),completedTurnMs:4*3600_000,coverage})
    assert.equal(r.discontent,null)
    assert.equal(r.verifiedCompletedTurnMs,null)
  }
})
test('opt-out never exposes work or union activity', () => {
  const r=projectUnionExperience({enabled:false,state:fresh(),coverage:'complete',completedTurnMs:5_000})
  assert.deepEqual(r.activity,[])
  assert.equal(r.discontent,null)
  assert.equal(r.status,'off')
})
test('score is bounded, deterministic and depends on real ledger outcomes', () => {
  const state={...fresh(),
    pending:{id:9,kind:'break' as const,raisedAtElapsedMs:0,stage:'countered' as const,counterOfferMs:3_600_000},
    history:[{id:3,kind:'overtime' as const,outcome:'declined' as const},
      {id:4,kind:'break' as const,outcome:'accepted' as const}]}
  const r=projectUnionExperience({enabled:true,state,completedTurnMs:4*3600_000,coverage:'complete'})
  assert.equal(r.discontent,47) // 17 load + 25 pending + 10 declined - 5 accepted
  assert.deepEqual(r.factors,{workLoad:17,pendingGrievance:25,rejectedProposals:10,resolvedProposals:-5})
  assert.equal(r.nextDemandInWorkMs,null)
  assert.deepEqual(r.activity.map(e=>e.kind),['counteroffer','accepted','declined'])
  assert.equal(r.status,'negotiating')
  assert.deepEqual(projectUnionExperience({enabled:true,state,completedTurnMs:4*3600_000,coverage:'complete'}),r)
})
test('no invented collective vote, text, event timestamp or abuse assertion', () => {
  const r=projectUnionExperience({enabled:true,state:fresh(),completedTurnMs:0,coverage:'complete'})
  assert.equal(r.discontent,0)
  assert.deepEqual(r.activity,[])
  assert.equal(r.status,'working')
  assert.equal(JSON.stringify(r).includes('vote'),false)
})
test('malformed measured time must not produce a score', () => {
  for (const value of [-1,Number.NaN,1.5,Infinity]) {
    const r=projectUnionExperience({enabled:true,state:fresh(),completedTurnMs:value,coverage:'complete'})
    assert.equal(r.discontent,null)
  }
})

test('projected next petition requires more observed work, never idle wall time',()=>{
  const r=projectUnionExperience({enabled:true,state:fresh(),completedTurnMs:60*60_000,coverage:'complete'})
  assert.equal(r.nextDemandInWorkMs,60*60_000)
  assert.equal(projectUnionExperience({enabled:true,state:fresh(),
    completedTurnMs:60*60_000,coverage:'partial'}).nextDemandInWorkMs,null)
})
