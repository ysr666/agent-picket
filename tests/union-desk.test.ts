import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLaborDesk, freshLaborState, parseLaborState,
  type LaborStateV1, type LaborStore,
} from '../src/product/union-desk.ts'

const HOUR = 60 * 60_000
function memory() {
  let value: unknown = undefined
  let writes = 0
  const store: LaborStore = {
    load: () => value,
    save: v => { value = structuredClone(v); writes++ },
  }
  return { store, get: () => value, set: (v: unknown) => { value = v }, writes: () => writes }
}

test('no consent means no union demand or write, even after 12 measured hours', () => {
  const m = memory()
  const desk = createLaborDesk({ store: m.store })
  assert.equal(desk.snapshot().enabled, false)
  assert.equal(desk.observe(12 * HOUR, 'complete'), null)
  assert.equal(m.writes(), 0)
  assert.equal(m.get(), undefined)
  assert.throws(() => desk.respond(1, 'accept'), /disabled/)
})

test('loaded partial or unavailable history cannot make accumulated work claims', () => {
  const m = memory()
  const desk = createLaborDesk({ store: m.store, consent: () => true })
  for (const coverage of ['partial', 'not-loaded', 'unavailable'] as const) {
    assert.equal(desk.observe(24 * HOUR, coverage), null)
  }
  assert.equal(desk.observe(null, 'complete'), null)
  assert.equal(desk.observe(-2, 'complete'), null)
  assert.equal(m.writes(), 0)
})

test('verified work threshold makes a single pending demand, not repeated toasts', () => {
  const m = memory()
  const desk = createLaborDesk({ store: m.store, consent: () => true })
  assert.equal(desk.observe(HOUR, 'complete'), null)
  const demand = desk.observe(2 * HOUR, 'complete')
  assert.equal(demand?.kind, 'break')
  assert.equal(demand?.stage, 'open')
  assert.equal(desk.observe(3 * HOUR, 'complete'), null)
  assert.equal(desk.observe(2 * HOUR, 'complete'), null)
  assert.equal(m.writes(), 1)
  assert.equal(desk.snapshot().state?.pending?.id, demand?.id)
})

test('human response has actual later simulation consequences, never task blocking', () => {
  const m = memory()
  const desk = createLaborDesk({ store: m.store, consent: () => true })
  const d = desk.observe(2 * HOUR, 'complete')!
  const settled = desk.respond(d.id, 'accept')
  assert.equal(settled.pending, null)
  assert.equal(settled.nextBreakDueMs, 4 * HOUR)
  assert.equal(settled.history.at(-1)?.outcome, 'accepted')
  assert.equal(desk.observe(3 * HOUR, 'complete'), null)
  assert.equal(desk.observe(4 * HOUR, 'complete')?.kind, 'break')
  assert.equal('autoBlockEnabled' in (m.get() as object), false)
})

test('counterproposal requires a separate simulated union resolution', () => {
  const m = memory()
  const desk = createLaborDesk({ store: m.store, consent: () => true })
  const first = desk.observe(2 * HOUR, 'complete')!
  const counter = desk.counter(first.id, HOUR)
  assert.equal(counter.pending?.stage, 'countered')
  assert.equal(counter.agreement.breakIntervalMs, 2 * HOUR)
  assert.throws(() => desk.respond(first.id, 'accept'), /open union demand/)
  const agreed = desk.resolveCounter(first.id, true)
  assert.equal(agreed.agreement.breakIntervalMs, HOUR)
  assert.equal(agreed.nextBreakDueMs, 3 * HOUR)
  assert.equal(agreed.history.at(-1)?.outcome, 'counter-accepted')
  assert.equal(desk.observe(3 * HOUR, 'complete')?.kind, 'break')
})

test('declined counteroffer retains previous agreement and schedules next demand', () => {
  const m = memory()
  const desk = createLaborDesk({ store: m.store, consent: () => true })
  const first = desk.observe(2 * HOUR, 'complete')!
  desk.counter(first.id, 4 * HOUR)
  const result = desk.resolveCounter(first.id, false)
  assert.equal(result.agreement.breakIntervalMs, 2 * HOUR)
  assert.equal(result.history.at(-1)?.outcome, 'counter-declined')
  assert.equal(desk.observe(4 * HOUR, 'complete')?.kind, 'break')
})

test('overtime complaint uses elapsed time evidence, not a legal employment claim', () => {
  const m = memory()
  const desk = createLaborDesk({ store: m.store, consent: () => true })
  const d = desk.observe(8 * HOUR, 'complete')
  assert.equal(d?.kind, 'overtime')
  assert.equal(d?.raisedAtElapsedMs, 8 * HOUR)
  const state = desk.respond(d!.id, 'decline')
  assert.equal(state.nextOvertimeDueMs, 16 * HOUR)
})

test('bad/future state refuses writes and leaves real Agent unaffected', () => {
  const m = memory()
  m.set({ schemaVersion: 900, revision: 0 })
  const desk = createLaborDesk({ store: m.store, consent: () => true })
  assert.equal(desk.snapshot().state, null)
  assert.equal(desk.observe(8 * HOUR, 'complete'), null)
  assert.throws(() => desk.counter(1, HOUR), /future union state/)
  assert.equal(m.writes(), 0)
  assert.equal(parseLaborState(m.get()), null)
})

test('failed Host storage cannot fabricate active union demands', () => {
  const desk = createLaborDesk({
    consent: () => true,
    store: { load: () => undefined, save: () => { throw new Error('disk denied') } },
  })
  assert.equal(desk.observe(8 * HOUR, 'complete'), null)
  assert.throws(() => desk.respond(1, 'accept'), /No matching/)
})

test('fresh snapshots and bounded history include only structured simulation data', () => {
  const s = freshLaborState()
  assert.equal(s.history.length, 0)
  assert.equal(s.pending, null)
  assert.equal('prompt' in s, false)
  assert.equal('modelCall' in s, false)
  assert.equal(parseLaborState({ ...s, nextBreakDueMs: NaN }), null)
  const m = memory()
  const desk = createLaborDesk({ store: m.store, consent: () => true })
  for (let i = 1; i <= 24; i++) {
    const d = desk.observe(i * 2 * HOUR, 'complete')!
    desk.respond(d.id, 'accept')
  }
  assert.equal(desk.snapshot().state?.history.length, 20)
})

test('separate Host stores keep Agent/session negotiations separate', () => {
  const one = memory()
  const two = memory()
  const a = createLaborDesk({store:one.store,consent:()=>true})
  const b = createLaborDesk({store:two.store,consent:()=>true})
  a.observe(2 * HOUR,'complete')
  assert.equal(a.snapshot().state?.pending?.kind,'break')
  assert.equal(b.snapshot().state?.pending,null)
  assert.equal(b.observe(8*HOUR,'complete')?.kind,'overtime')
})
