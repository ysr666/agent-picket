import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(resolve(root,path),'utf8')

test('production DSH Browser factory contains exactly one union state machine', () => {
  const built = read('dist/adapters/dsh/client.js')
  const count = (needle: RegExp) => [...built.matchAll(needle)].length
  assert.equal(count(/function createLaborDesk\(/g),1,
    'Do not merge an additional independent union bargaining engine')
  assert.equal(count(/function createDshBrowserUnionDesk\(/g),1,
    'Only one Host-authorized bargaining adapter may be bundled')
  assert.equal(count(/function parseUnionLedger\(/g),1,
    'Host and Client must share the same union ledger interpretation')
  assert.equal(count(/function registerDshNativeRightsSlots\(/g),1,
    'A second welcome/onboarding Slot must not be registered')
  assert.equal(count(/_require\("react"\)/g),1)
  assert.equal(count(/_require\("react-dom"\)/g),1)
})

test('release DSH native Host must have a single authoritative consent owner', () => {
  const plugin = read('src/adapters/dsh/plugin.ts')
  const registry = read('src/adapters/dsh/rights-settings.ts')
  assert.match(plugin,/registerHostRightsNamespace/)
  assert.match(registry,/RIGHTS_SETTINGS_NAMESPACE = 'agent-picket'/)
  assert.doesNotMatch(plugin,/createNodeRightsStores|createDshRightsOwner/,
    'Do not activate the #41 experimental Node store beside native DSH settings')
  assert.doesNotMatch(registry,/autoBlockEnabled|blockUserMessage|denyPrompt/)
  assert.match(registry,/parseUnionLedger/)
})

test('Browser union is a nonblocking client-only simulation, not a new Host RPC', () => {
  const code = read('src/adapters/dsh/client-bargaining.ts')
  const source = read('src/adapters/dsh/client.ts')
  const launcher = read('scripts/build-dsh-client.mjs')
  assert.match(code,/scope\.set\('unionLedger'/)
  assert.match(code,/writeToken/)
  assert.doesNotMatch(code,/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/)
  assert.doesNotMatch(code,/node:fs|node:net|require\('http'\)/)
  assert.match(source,/settingsScope!\.bind/)
  assert.match(source,/configForms!\.describe/)
  assert.match(launcher,/allow|allowedImports/)
  assert.doesNotMatch(source,/createNodeRightsStores|requestBlockingPermission/)
})
