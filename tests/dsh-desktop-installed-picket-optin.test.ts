import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

const script=fileURLToPath(new URL(
  '../scripts/verify-dsh-desktop-installed-picket.mjs',import.meta.url))

test('packed Windows/macOS Desktop native Picket E2E is opt-in; CI cannot launch desktop by accident',()=>{
  const result=spawnSync(process.execPath,[script],{
    encoding:'utf8',timeout:3000,
    env:{...process.env,PICKET_DESKTOP_INSTALLED_E2E:''},
  })
  assert.equal(result.status,1)
  assert.match(result.stderr,/Explicit opt-in required/)
})

test('native installed Picket E2E authenticates the tarball and never enables stop hooks or user profiles',()=>{
  const source=readFileSync(script,'utf8')
  assert.match(source,/PICKET_CANDIDATE_SHA256/)
  assert.match(source,/createHash\('sha256'\)/)
  assert.match(source,/assert\.equal\(actual,expected/)
  assert.match(source,/AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW:'off'/)
  assert.match(source,/AGENT_PICKET_STATS:'off'/)
  assert.match(source,/--user-data-dir=/)
  assert.match(source,/DSH_HOME:dsh/)
  assert.match(source,/checkedOrdinarySubmissionHold:false/)
  assert.match(source,/releaseDecision:'NO-GO'/)
  assert.match(source,/nativeColdRestartRemainsOut/)
  assert.match(source,/nativeInputStrikeArmed:false/)
  assert.match(source,/await nativeReady\(restartPort,child\)/)
  assert.match(source,/afterColdRestart/)
  assert.match(source,/Official Host union opt-out must survive real Desktop process restart/)
})

test('native acceptance has an independent macOS process cleanup path',()=>{
  const source=readFileSync(script,'utf8')
  assert.match(source,/process\.platform==='darwin'/)
  assert.match(source,/child\.kill\('SIGTERM'\)/)
  assert.match(source,/await stopOwnedDesktop\(child\)/)
  assert.doesNotMatch(source,/killall|pkill|process\.kill\(/)
})

test('actual Desktop text+image refusal is independent opt-in, uses real Host and requires visible manual resend',()=>{
  const source=readFileSync(script,'utf8')
  assert.match(source,/PICKET_DESKTOP_REAL_INPUT_E2E==='1'/)
  assert.match(source,/!realInput\|\|onboarding==='join'/)
  assert.match(source,/verifyRealNativeInputStrike\(page\)/)
  assert.match(source,/dsh-app/)
  assert.match(source,/refusal-notice\/v1\?capability=input-discard-resend-v1/)
  assert.match(source,/data-ap-input-armed/)
  assert.match(source,/session\/prompt/)
  assert.match(source,/mediaType:'image\/png'/)
  assert.match(source,/data-ap-strike-summons="verified"/)
  assert.match(source,/data-ap-native-refusal="verified"/)
  assert.match(source,/Real native|Real native/i)
  assert.match(source,/after\.realInputStrikeCampaign|hostSettings\(\)\)\?\.realInputStrikeCampaign/)
  assert.match(source,/realTextAndImageRejected:true/)
  assert.match(source,/nativeVisibleManualResendNotice:true/)
  assert.match(source,/hostConfirmedResume:true/)
  assert.match(source,/releaseDecision:'NO-GO'/)
  assert.doesNotMatch(source,/killall|pkill/)
})

test('320px standalone HQ settings test requires Not Now and never grants strike',()=>{
 const source=readFileSync(script,'utf8')
 assert.match(source,/PICKET_DESKTOP_NARROW_HQ_E2E==='1'/)
 assert.match(source,/onboarding==='skip'&&!realInput/)
 assert.match(source,/verifyNarrowUnionHqSettings/)
 assert.match(source,/page\.setViewportSize\(\{width:320,height:640\}\)/)
 assert.match(source,/data-ap-union-settings-route="hq"/)
 assert.match(source,/mainScrollWidth<=meas\.mainClientWidth\+3/)
 assert.match(source,/union\.press\('Enter'\)/)
 assert.match(source,/choice\.press\('Enter'\)/)
 assert.match(source,/noRealStrikeGrant:true/)
 assert.match(source,/releaseDecision:'NO-GO'/)
})

test('real cold Host restart negative refusal path cannot use a fake new client or an uninstalled Picket',()=>{
 const source=readFileSync(script,'utf8')
 assert.match(source,/PICKET_DESKTOP_ORPHAN_E2E==='1'/)
 assert.match(source,/onboarding==='join'&&!realInput&&!narrow/)
 assert.match(source,/verifyRealNativeInputStrike\(page,\{leaveArmed:true\}\)/)
 assert.match(source,/await stopOwnedDesktop\(child\)/)
 assert.match(source,/await nativeReady\(restartPort,child\)/)
 assert.match(source,/verifyOrphanedStrikeAfterRestart\(page,armed\)/)
 assert.match(source,/stored\.realInputStrikeCampaign,prior\.campaign/)
 assert.match(source,/capable\.status,200/)
 assert.match(source,/session\/projections/)
 assert.match(source,/session\/page/)
 assert.match(source,/x\.type==='turn\/start'/)
 assert.match(source,/x\.type==='turn\/end'/)
 assert.match(source,/lastReason,'blocked'/)
 assert.match(source,/report\.status,200/)
 assert.match(source,/officialNativeColdProcessRestart:true/)
 assert.match(source,/releaseDecision:'NO-GO'/)
})

test('two real DSH Web Chrome tabs are used for cross-client refusal, never a fake Electron target',()=>{
 const source=readFileSync(new URL('../tests/dsh-rights-browser.real.test.ts',import.meta.url),'utf8')
 assert.match(source,/PICKET_CROSS_CLIENT_E2E==='1'/)
 assert.match(source,/foreignTab=await context\.newPage\(\)/)
 assert.match(source,/await foreignTab\.goto\(origin/)
 assert.match(source,/actualForeignSession\.click\(\)/)
 assert.match(source,/assert\.notEqual\(foreignTab,page/)
 assert.match(source,/\(foreignTab\?\?page\)\.evaluate/)
 assert.match(source,/actualHostRefusalForForeignSubmission:true/)
 assert.match(source,/foreignNoticeVisible,true/)
 assert.match(source,/foreignNotice\.getAttribute\('role'\),'alertdialog'/)
 assert.match(source,/authenticatedSubmittingTabId:null/)
 assert.match(source,/receiverProvenanceVerified:false/)
 assert.match(source,/releaseDecision:'NO-GO'/)
})

test('headless Node Host-RPC client regression proves no submitter UI, and never claims native CLI/SDK source',()=>{
 const source=readFileSync(new URL('../tests/dsh-rights-browser.real.test.ts',import.meta.url),'utf8')
 assert.match(source,/PICKET_HEADLESS_CLIENT_E2E==='1'/)
 assert.match(source,/mode==='source'/)
 assert.match(source,/new URL\('\/api\/session\/prompt',origin\)/)
 assert.match(source,/cookie:renewedCookie\.name/)
 assert.match(source,/originalNodeClientHasNoUi:true/)
 assert.match(source,/visibleNoticeAtSubmittingClient:false/)
 assert.match(source,/authenticatedSubmittingClientId:null/)
 assert.match(source,/releaseDecision:'NO-GO'/)
})
