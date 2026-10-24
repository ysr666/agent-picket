import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

test('native Desktop UI smoke cannot accidentally launch a real app in normal test suites',()=>{
  const script=fileURLToPath(new URL('../scripts/verify-dsh-desktop-native-ui.mjs',import.meta.url))
  const result=spawnSync(process.execPath,[script],{
    encoding:'utf8',
    timeout:3000,
    env:{...process.env,PICKET_DESKTOP_NATIVE_UI_E2E:''},
  })
  assert.equal(result.status,1)
  assert.match(result.stderr,/Explicit opt-in required/)
})