import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createNodeRightsStores } from '../src/adapters/node/rights-storage.ts'
import { createRightsConsentController } from '../src/product/rights-consent.ts'
import { createLaborDesk } from '../src/product/union-desk.ts'

const HOUR = 3_600_000
function isolated(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'agent-picket-rights-test-'))
  try { fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('default opt-in remains OFF; durable consent works across controllers', () => isolated(home => {
  const stores = createNodeRightsStores(home)
  const consent = createRightsConsentController(stores.rights)
  assert.equal(consent.snapshot().record.laborRightsEnabled, false)
  consent.choose('not-now')
  assert.equal(createRightsConsentController(stores.rights).snapshot().record.welcomeDecision, 'not-now')
  consent.choose('enable')
  assert.equal(createRightsConsentController(stores.rights).snapshot().record.laborRightsEnabled, true)
  assert.equal(consent.snapshot().autoBlockEnabled, false)
  consent.setEnabled(false)
  assert.equal(consent.snapshot().record.laborRightsEnabled, false)
  if (process.platform !== 'win32') {
    const dir = join(home, 'agent-picket', 'rights-v1')
    assert.equal(statSync(dir).mode & 0o077, 0)
    assert.equal(statSync(join(dir, 'consent.json')).mode & 0o077, 0)
  }
}))

test('per-Session negotiation persists only structured data with hashed filenames', () => isolated(home => {
  const owner = createNodeRightsStores(home)
  const consent = createRightsConsentController(owner.rights)
  consent.choose('enable')
  const scope = owner.laborFor('sensitive-agent-abc', 'private-session-xyz')
  const desk = createLaborDesk({
    consent: () => consent.snapshot().record.laborRightsEnabled,
    store: scope,
  })
  const demand = desk.observe(2 * HOUR, 'complete')
  assert.equal(demand?.kind, 'break')
  const next = createLaborDesk({
    consent: () => createRightsConsentController(owner.rights).snapshot().record.laborRightsEnabled,
    store: createNodeRightsStores(home).laborFor('sensitive-agent-abc', 'private-session-xyz'),
  })
  assert.equal(next.snapshot().state?.pending?.id, demand?.id)
  next.counter(demand!.id, HOUR)
  next.resolveCounter(demand!.id, true)
  assert.equal(next.snapshot().state?.agreement.breakIntervalMs, HOUR)
  const files = readdirSync(join(home, 'agent-picket', 'rights-v1', 'sessions'))
  assert.equal(files.length, 1)
  assert.match(files[0]!, /^[a-f0-9]{64}\.json$/)
  const raw = readFileSync(join(home, 'agent-picket', 'rights-v1', 'sessions', files[0]!), 'utf8')
  assert.doesNotMatch(raw, /private-session|sensitive-agent|prompt|token|messageContent/)
  const other = createLaborDesk({store: owner.laborFor('another', 'new'), consent: () => true})
  assert.equal(other.snapshot().state?.pending, null)
}))

test('stale session state updates refuse to overwrite newer negotiated revisions', () => isolated(home => {
  const owner = createNodeRightsStores(home)
  const store = owner.laborFor('a', 's')
  const a = createLaborDesk({store, consent: () => true})
  const b = createLaborDesk({store: owner.laborFor('a','s'), consent: () => true})
  const first = a.observe(2 * HOUR, 'complete')
  assert.equal(first?.id, 1)
  assert.equal(b.observe(2 * HOUR, 'complete'), null)
  const stale = { ...a.snapshot().state!, revision: 1 }
  assert.throws(() => store.save(stale), /Stale/)
  assert.equal(a.snapshot().state?.pending?.id, 1)
}))

test('corrupt consent fails closed without overwriting unsupported data', () => isolated(home => {
  const stores = createNodeRightsStores(home)
  createRightsConsentController(stores.rights).choose('enable')
  const path = join(home, 'agent-picket', 'rights-v1', 'consent.json')
  writeFileSync(path, 'broken-{')
  const consent = createRightsConsentController(stores.rights)
  assert.equal(consent.snapshot().record.laborRightsEnabled, false)
  assert.equal(consent.snapshot().status, 'unavailable')
  assert.throws(() => consent.choose('enable'), /cannot be safely updated/)
  assert.equal(readFileSync(path,'utf8'),'broken-{')
}))

test('symlink destination and unsafe directory are rejected rather than followed', () => isolated(home => {
  const target = join(home, 'target.txt')
  writeFileSync(target, 'SECRET_IN_TARGET')
  const stores = createNodeRightsStores(home)
  createRightsConsentController(stores.rights).choose('not-now')
  const path = join(home, 'agent-picket', 'rights-v1', 'consent.json')
  rmSync(path)
  symlinkSync(target, path)
  assert.equal(createRightsConsentController(stores.rights).snapshot().record.laborRightsEnabled, false)
  assert.throws(() => stores.rights.save({
    schemaVersion:1,welcomeDecision:'enabled',laborRightsEnabled:true,
  }), /Invalid rights storage file/)
  assert.equal(readFileSync(target,'utf8'), 'SECRET_IN_TARGET')
}))

test('writers refuse lock contention and leave existing records untouched', () => isolated(home => {
  const stores = createNodeRightsStores(home)
  const rights = createRightsConsentController(stores.rights)
  rights.choose('not-now')
  const path = join(home, 'agent-picket', 'rights-v1', 'consent.json.lock')
  writeFileSync(path,'locked')
  assert.throws(() => rights.choose('enable'))
  assert.equal(createRightsConsentController(stores.rights).snapshot().record.laborRightsEnabled, false)
}))
