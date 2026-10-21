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
