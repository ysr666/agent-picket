import assert from 'node:assert/strict'
import test from 'node:test'
import { currentDshUnionSession } from '../src/adapters/dsh/client.ts'

test('old DSH current-session selector remains authoritative',()=>{
  assert.equal(currentDshUnionSession({current:'old',byId:{old:{},other:{retainedBy:{mainView:1}}}}),'old')
  assert.equal(currentDshUnionSession({current:'old',byId:{other:{retainedBy:{mainView:1}}}}),'old')
})
test('DSH 0.1.7 main-view retention selects exactly one active Agent Session',()=>{
  assert.equal(currentDshUnionSession({byId:{first:{retainedBy:{mainView:0}},
    active:{retainedBy:{mainView:1}}}}),'active')
  assert.equal(currentDshUnionSession({byId:{first:{retainedBy:{mainView:1}},
    second:{retainedBy:{mainView:2}}}}),undefined)
  assert.equal(currentDshUnionSession({byId:{unretained:{}}}),undefined)
  assert.equal(currentDshUnionSession({byId:{untrusted:{retainedBy:{mainView:-1}}}}),undefined)
  assert.equal(currentDshUnionSession(undefined),undefined)
})
