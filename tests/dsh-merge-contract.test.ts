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


test('production DSH bundle cannot ship the destructive pre-step reject probe', () => {
  const integration = read('dist/adapters/dsh/integration.js')
  const api = read('dist/adapters/dsh/integration.d.ts')
  // Structural distribution gate: actual generated JS and declarations are
  // checked after the build, not simply the TypeScript source tree.
  assert.doesNotMatch(integration, /createDshPreStepProbe/)
  assert.doesNotMatch(api, /createDshPreStepProbe/)
  assert.match(integration,/getExplicitDiscardRefusal/,
    'Refusal must be behind the existing adapter and an explicit Host witness')
  assert.match(integration,/visibleResendNotice/,
    'Never drop an input without a confirmed user-visible resend instruction')
  assert.match(integration,/return next\(\)/,
    'The actual Host pre-step middleware must delegate without Host proof')
  assert.match(integration, /block: false/,
    'The shipped DSH adapter must not advertise safe Host enforcement')
  const plugin = read('dist/adapters/dsh/plugin.js')
  assert.doesNotMatch(plugin, /createDshPreStepProbe/)
  assert.match(plugin,/getExplicitDiscardRefusal/,
    'Production uses only the existing guarded pre-step')
  assert.match(plugin,/readHostActiveInputStrike/,
    'Real refusal needs a Host-authenticated live Session campaign')
  assert.match(plugin,/nativeRefusalNoticeReady\(\)/,
    'Real refusal needs an installed native notice route')
})


test('ordinary-input refusal UI requires independent Host notice qualification and Session arming',()=>{
 const ui=read('dist/adapters/dsh/native-rights-ui.js')
 const client=read('src/adapters/dsh/client.ts')
 const plugin=read('dist/adapters/dsh/plugin.js')
 assert.match(ui,/settings\.inputStrikeNotActive/)
 assert.match(ui,/settings\.inputStrikeDisclosure/)
 assert.match(ui,/settings\.inputStrikeRevoke/)
 assert.match(client,/probeDshRefusalNoticeCapability/,
   'Real refusal must require an official native Host response')
 assert.match(client,/createDshInputRefusalConsentControl/,
   'Consent and campaign are separate Host settings, not inherited')
 assert.match(plugin,/readHostActiveInputStrike/,
   'An opt-in alone must never trigger the production reject gate')
})


test('ordinary-input attribution must combine official blocked turn with a separate Host receipt',()=>{
 const host=read('src/adapters/dsh/plugin.ts')
 const client=read('src/adapters/dsh/client.ts')
 const observer=read('src/adapters/dsh/client-refusal-notice.ts')
 assert.match(host,/registerDshRefusalNoticeFetch/)
 assert.match(host,/createVolatileRefusalNotices/)
 assert.match(host,/onExplicitRefusal\s*:/,
   'A real blocked candidate must store a Host-owned attribution receipt')
 assert.match(client,/createBrowserRefusalNoticeReader/)
 assert.match(observer,/matchRefusalToOfficialTurn/)
 assert.doesNotMatch(observer,/session\/prompt|session\/resume|automaticReplay\s*:\s*true/,
   'Notice projection cannot submit or replay refused input')
})


test('unverified Host client identity can never authorize human submission refusal',()=>{
 const integration=read('src/adapters/dsh/integration.ts')
 const host=read('src/adapters/dsh/plugin.ts')
 const client=read('src/adapters/dsh/client.ts')
 assert.match(integration,/host-verified-client-submission-v1/)
 assert.match(integration,/noticeRecipientMatchesOrigin/)
 assert.match(integration,/row\.submission\.turn!==turn/)
 assert.match(integration,/messageIds\.every/)
 assert.match(integration,/new Set\(payload\.messages\.map/)
 assert.match(host,/getExplicitDiscardRefusal\s*:/)
 assert.match(host,/readHostActiveInputStrike/,
  'A Session-scoped Host setting, NOT claimed client identity, must govern refusal')
 assert.match(integration,/dsh-session-armed-strike-v1/,
  'Never pretend DSH identifies the initiating Web browser in pre-step')
 assert.match(client,/probeDshRefusalNoticeCapability/,
  'Browser permission needs a live native notice response')
})
