import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createDshRightsOwner } from '../src/adapters/dsh/rights-owner.ts'

test('DSH rights owner persists consent and isolates negotiated sessions', () => {
  const home = mkdtempSync(join(tmpdir(), 'picket-owner-'))
  try {
    const owner = createDshRightsOwner(home)
    const a = { agent: { id: 'a', session: { id: 's-one' } } }
    const b = { agent: { id: 'a', session: { id: 's-two' } } }
    const c = { agent: { id: 'b', session: { id: 's-one' } } }
    assert.equal(owner.rights.snapshot().record.laborRightsEnabled, false)
    assert.equal(owner.getLaborDesk(a)?.observe(8 * 3_600_000, 'complete'), null)
    owner.rights.choose('enable')
    const first = owner.getLaborDesk(a)!.observe(2 * 3_600_000, 'complete')
    assert.equal(first?.kind,'break')
    assert.equal(owner.getLaborDesk(b)!.snapshot().state?.pending, null)
    assert.equal(owner.getLaborDesk(c)!.snapshot().state?.pending, null)
    const recovered = createDshRightsOwner(home)
    assert.equal(recovered.rights.snapshot().record.laborRightsEnabled,true)
    assert.equal(recovered.getLaborDesk(a)?.snapshot().state?.pending?.id,first?.id)
    recovered.getLaborDesk(a)?.respond(first!.id,'accept')
    assert.equal(owner.getLaborDesk(a)?.snapshot().state?.pending,null)
    assert.equal(owner.getLaborDesk(b)?.snapshot().state?.pending,null)
  } finally {
    rmSync(home,{ recursive:true,force:true })
  }
})

test('missing DSH Agent or Session identity cannot pick a shared union store', () => {
  const home = mkdtempSync(join(tmpdir(),'picket-owner-bad-'))
  try {
    const owner = createDshRightsOwner(home)
    assert.equal(owner.getLaborDesk(), undefined)
    assert.equal(owner.getLaborDesk({agent:{id:'a'}}), undefined)
    assert.equal(owner.getLaborDesk({agent:{session:{id:'s'}}}), undefined)
    assert.equal(owner.getLaborDesk({agent:{id:'',session:{id:'s'}}}), undefined)
  }finally{
    rmSync(home,{recursive:true,force:true})
  }
})
