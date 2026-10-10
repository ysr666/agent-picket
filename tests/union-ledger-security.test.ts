import assert from 'node:assert/strict'
import test from 'node:test'
import { freshLaborState, parseLaborState } from '../src/product/union-desk.ts'
import { parseUnionLedger } from '../src/product/union-ledger.ts'
import { registerHostRightsNamespace } from '../src/adapters/dsh/rights-settings.ts'

const id = 'd'.repeat(64)
function validator() {
  let validate: ((value: unknown) => void) | undefined
  registerHostRightsNamespace({
    inject(_services, callback) {
      callback({ settings: { register(_namespace, _schema, opts) {
        validate = (opts as {validate(value: unknown): void}).validate
      } } })
    },
  })
  assert.ok(validate)
  return validate
}
const encoded = (state: unknown): string =>
  JSON.stringify({schemaVersion:1,sessions:{[id]:state}})

test('valid legacy state and legacy ledger still parse without a write receipt', () => {
  const state = freshLaborState()
  const parsed = parseLaborState(state)
  assert.deepEqual(parsed,state)
  const ledger = encoded(state)
  assert.deepEqual(parseUnionLedger(ledger)?.sessions[id],state)
  assert.doesNotThrow(() => validator()({welcomeDecision:'enabled',unionLedger:ledger}))
})

test('nested message, tool args, profile or transcript fields fail closed at Host boundary', () => {
  const original = freshLaborState()
  const pending = {
    id:1,kind:'break',raisedAtElapsedMs:0,stage:'open',counterOfferMs:null,
  }
  const history = [{id:1,kind:'break',outcome:'accepted'}]
  const variants: unknown[] = [
    {...original, rawPrompt:'USER_SECRET'},
    {...original, agreement:{...original.agreement, chatText:'USER_SECRET'}},
    {...original, pending:{...pending, toolArguments:'USER_SECRET'}},
    {...original, history:[{...history[0], chatMessage:'USER_SECRET'}]},
    {...original, history, hidden:{accessToken:'USER_SECRET'}},
  ]
  const validate = validator()
  for (const [n, state] of variants.entries()) {
    assert.equal(parseLaborState(state),null,'invalid core state '+n)
    assert.equal(parseUnionLedger(encoded(state)),null,'invalid ledger '+n)
    assert.throws(()=>validate({welcomeDecision:'enabled',unionLedger:encoded(state)}),
      /Unsafe or malformed/, 'Host must reject variant '+n)
  }
})

test('legacy countered requests and legitimate agreement history remain valid',()=>{
  const state = {
    ...freshLaborState(),
    revision:4,
    pending:{
      id:4,kind:'break',raisedAtElapsedMs:7_200_000,
      stage:'countered',counterOfferMs:1_800_000,
    },
    history:[
      {id:1,kind:'break',outcome:'accepted'},
      {id:2,kind:'break',outcome:'counter-accepted'},
    ],
  } as const
  assert.deepEqual(parseLaborState(state),state)
  const ledger=encoded(state)
  assert.doesNotThrow(()=>validator()({welcomeDecision:'enabled',unionLedger:ledger}))
})

test('unknown future or malformed nested bargain fails without silent sanitization',()=>{
  const state = freshLaborState()
  for(const candidate of [
    {...state,agreement:{breakIntervalMs:0,overtimeIntervalMs:28_800_000}},
    {...state,history:[{id:1,kind:'break',outcome:'maybe'}]},
    {...state,pending:{id:2,kind:'break',raisedAtElapsedMs:0,stage:'open',counterOfferMs:1800000}},
    {...state,schemaVersion:2},
  ])assert.equal(parseUnionLedger(encoded(candidate)),null)
})
