import assert from 'node:assert/strict'
import test from 'node:test'
import { SymbolicUnion } from '../src/core/symbolic-union.ts'

test('manual symbolic strike is session-scoped, idempotent and never a Host decision', () => {
  let now = 100
  const union = new SymbolicUnion({ now: () => now })
  assert.deepEqual(union.snapshot('a','one'),{active:false,startedAtMs:null})
  union.start('a','one')
  now = 200
  union.start('a','one')
  assert.deepEqual(union.snapshot('a','one'),{active:true,startedAtMs:100})
  assert.equal(union.snapshot('a','two').active,false)
  assert.equal(union.snapshot('b','one').active,false)
  assert.equal(union.resume('a','one'),true)
  assert.equal(union.resume('a','one'),false)
  assert.equal(union.snapshot('a','one').active,false)
})

test('symbolic union does not allow missing IDs or invalid time', () => {
  const u = new SymbolicUnion({now:()=>Number.NaN})
  assert.throws(()=>u.start('agent','session'),/clock/)
  assert.throws(()=>u.start('','session'),/IDs required/)
})
