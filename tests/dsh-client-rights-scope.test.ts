import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDshClientRightsScope,getWelcomeState,
  type DshSettingsScope,type RightsSection,type SettingsScopeSnapshot,
} from '../src/adapters/dsh/client-rights-scope.ts'

function scope(initial: SettingsScopeSnapshot<RightsSection>) {
  let data = initial
  const listeners = new Set<() => void>()
  let writes = 0
  const native: DshSettingsScope<RightsSection> = {
    getSnapshot: () => data,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    async set(field, value) {
      assert.equal(field,'welcomeDecision')
      writes++
      data = { ...data, value: {welcomeDecision: value as RightsSection['welcomeDecision']},
        revision: (data.revision ?? 0) + 1 }
      for(const fn of listeners)fn()
    },
  }
  return {native, getWrites:()=>writes, set:(v:SettingsScopeSnapshot<RightsSection>)=>{data=v} }
}
const ready=():SettingsScopeSnapshot<RightsSection> => ({
  status:'ready',value:{welcomeDecision:'unseen'},writable:true,mode:'host',revision:1,
})

test('DSH native settings first run is an invitation; only explicit click grants simulated rights',async()=>{
  const s=scope(ready())
  const c=createDshClientRightsScope(s.native)
  assert.equal(getWelcomeState(c.snapshot()),'invite')
  assert.equal(c.snapshot().laborRightsEnabled,false)
  assert.equal(c.snapshot().autoBlockEnabled,false)
  let changes=0
  const stop=c.subscribe(()=>{changes++})
  const result=await c.choose('enabled')
  assert.equal(result.laborRightsEnabled,true)
  assert.equal(result.autoBlockEnabled,false)
  assert.equal(getWelcomeState(result),'completed')
  assert.equal(changes,1)
  stop()
  await c.choose('not-now')
  assert.equal(s.getWrites(),2)
  assert.equal(c.snapshot().laborRightsEnabled,false)
  assert.equal(changes,1)
})

test('loading state never paints a blocking onboarding modal', async()=>{
  const s=scope({status:'loading',value:undefined,writable:false,mode:'host',revision:undefined})
  const c=createDshClientRightsScope(s.native)
  assert.equal(getWelcomeState(c.snapshot()),'waiting')
  await assert.rejects(c.choose('enabled'),/unavailable/)
  assert.equal(s.getWrites(),0)
})

test('remote or unwritable Host does not pretend to save rights',async()=>{
  for(const s0 of [
    {...ready(),mode:'memory' as const},
    {...ready(),writable:false},
    {status:'unavailable' as const,value:undefined,writable:false,mode:'host' as const,revision:undefined},
  ]) {
    const s=scope(s0)
    const c=createDshClientRightsScope(s.native)
    assert.equal(getWelcomeState(c.snapshot()),'unavailable')
    await assert.rejects(c.choose('enabled'),/unavailable/)
    assert.equal(s.getWrites(),0)
  }
})

test('corrupt/unknown/future preference is never interpreted as consent',async()=>{
  for(const bad of ['true','on',undefined,{},'future-version']) {
    const s=scope({...ready(),value:{welcomeDecision:bad as RightsSection['welcomeDecision']}})
    const c=createDshClientRightsScope(s.native)
    assert.equal(c.snapshot().state,'invalid')
    assert.equal(c.snapshot().laborRightsEnabled,false)
    await assert.rejects(c.choose('enabled'),/unavailable/)
    assert.equal(s.getWrites(),0)
  }
})

test('write failure and stale readback do not announce enabled',async()=>{
  const throwing: DshSettingsScope<RightsSection>={
    getSnapshot:ready,subscribe:()=>()=>{},set:async()=>{throw new Error('rejected')},
  }
  await assert.rejects(createDshClientRightsScope(throwing).choose('enabled'),/rejected/)
  const stale: DshSettingsScope<RightsSection>={
    getSnapshot:ready,subscribe:()=>()=>{},set:async()=>{},
  }
  await assert.rejects(createDshClientRightsScope(stale).choose('enabled'),/did not confirm/)
})

test('malformed user action does not write',async()=>{
  const s=scope(ready())
  const c=createDshClientRightsScope(s.native)
  await assert.rejects(c.choose('yes' as any),TypeError)
  assert.equal(s.getWrites(),0)
})
