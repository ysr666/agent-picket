import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createRightsConsentController, parseRightsConsent,
  type RightsConsentV1, type RightsConsentStore,
} from '../src/product/rights-consent.ts'

function memory() {
  let value: unknown = undefined
  const store: RightsConsentStore = {
    load: () => value,
    save: next => { value = structuredClone(next) },
  }
  return { store, get: () => value, set: (v: unknown) => { value = v } }
}

test('fresh install and missing Host owner are OFF without automatic blocking', () => {
  assert.deepEqual(createRightsConsentController().snapshot(), {
    record: { schemaVersion: 1, welcomeDecision: 'unseen', laborRightsEnabled: false },
    status: 'missing-owner', autoBlockEnabled: false,
  })
  assert.throws(() => createRightsConsentController().choose('enable'), /not available/)
  const s = createRightsConsentController(memory().store).snapshot()
  assert.equal(s.status, 'ready')
  assert.equal(s.record.laborRightsEnabled, false)
})

test('both welcome choices persist across controller restarts', () => {
  const m = memory()
  const a = createRightsConsentController(m.store)
  assert.equal(a.choose('not-now').record.laborRightsEnabled, false)
  assert.equal(a.snapshot().record.welcomeDecision, 'not-now')
  const b = createRightsConsentController(m.store)
  assert.equal(b.choose('enable').record.laborRightsEnabled, true)
  assert.equal(b.snapshot().autoBlockEnabled, false)
  const c = createRightsConsentController(m.store)
  assert.equal(c.snapshot().record.welcomeDecision, 'enabled')
  assert.equal(c.setEnabled(false).record.laborRightsEnabled, false)
  assert.equal(createRightsConsentController(m.store).snapshot().record.welcomeDecision, 'not-now')
})

test('no write on merely reading/dismissing the welcome page', () => {
  let writes = 0
  const c = createRightsConsentController({
    load: () => undefined, save: () => { writes++ },
  })
  assert.equal(c.snapshot().record.welcomeDecision, 'unseen')
  assert.equal(writes, 0)
})

test('invalid or future-version preferences fail closed without overwriting state', () => {
  const m = memory()
  for (const bad of [
    { schemaVersion: 2, welcomeDecision: 'enabled', laborRightsEnabled: true },
    { schemaVersion: 1, welcomeDecision: 'not-now', laborRightsEnabled: true },
    { schemaVersion: 1, welcomeDecision: 'enabled', laborRightsEnabled: 'yes' },
    { schemaVersion: 1, welcomeDecision: 'unseen', laborRightsEnabled: true },
    'enable', true, [], { autoBlockEnabled: true },
  ]) {
    m.set(bad)
    const c = createRightsConsentController(m.store)
    assert.equal(c.snapshot().record.laborRightsEnabled, false)
    assert.equal(c.snapshot().autoBlockEnabled, false)
    assert.equal(c.snapshot().status, 'invalid')
    assert.throws(() => c.choose('enable'), /cannot be safely updated/)
    assert.strictEqual(m.get(), bad)
  }
})

test('persistence errors cannot be advertised as successful opt-in', () => {
  const bad = createRightsConsentController({ load: () => undefined, save: () => {} })
  assert.throws(() => bad.choose('enable'), /did not persist/)
  const unavailable = createRightsConsentController({
    load: () => { throw new Error('read denied') },
    save: () => { throw new Error('write denied') },
  })
  assert.equal(unavailable.snapshot().status, 'unavailable')
  assert.equal(unavailable.snapshot().record.laborRightsEnabled, false)
  assert.throws(() => unavailable.choose('enable'), /cannot be safely updated/)
})

test('permission to run actual model tasks is entirely outside this contract', () => {
  const m = memory()
  const c = createRightsConsentController(m.store)
  const on = c.choose('enable')
  assert.equal(on.autoBlockEnabled, false)
  assert.equal('autoBlockEnabled' in (m.get() as object), false)
  assert.deepEqual(Object.keys(on.record).sort(),
    ['laborRightsEnabled', 'schemaVersion', 'welcomeDecision'])
  assert.equal(parseRightsConsent({ ...on.record, autoBlockEnabled: true })?.laborRightsEnabled, true)
  assert.equal(c.snapshot().autoBlockEnabled, false)
})

test('bad runtime values never enable modes via implicit coercion', () => {
  const c = createRightsConsentController(memory().store)
  assert.throws(() => c.choose('yes' as any), TypeError)
  assert.throws(() => c.setEnabled('true' as any), TypeError)
  assert.equal(c.snapshot().record.laborRightsEnabled, false)
})
