import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const readme = readFileSync(resolve(root, 'README.md'), 'utf8')

test('public entrypoint distinguishes integrated baseline, draft strike proof and 1.0 NO-GO', () => {
  assert.match(readme, /Your agent has a union now/)
  assert.match(readme, /not another usage dashboard/i)
  assert.match(readme, /Draft PR #177/)
  assert.match(readme, /not merged into main, not published to npm/i)
  assert.match(readme, /release:gate.*NO-GO/)
  assert.match(readme, /4-client × 3-OS release proof/)
  assert.doesNotMatch(readme, /All strikes, bargaining, petitions and agreements are simulations/i)
  assert.doesNotMatch(readme, /nothing stops, delays, rejects or rewrites actual Agent requests/i)
})

test('public safety disclosure requires manual resend and does not invent all-client coverage', () => {
  assert.match(readme, /OFF by default/)
  assert.match(readme, /additional versioned grant/)
  assert.match(readme, /refused request is \*\*not saved or replayed\*\*/)
  assert.match(readme, /resubmit text and attachments/)
  assert.match(readme, /cannot inherit Web guarantees/)
  assert.match(readme, /No hidden replay/)
  assert.match(readme, /no production-qualified automatic punitive strike/i)
})
