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

test('leaving the union first revokes a separately authorized real Goal strike',async()=>{
 let current:RightsSection={welcomeDecision:'enabled',realGoalStrikeConsent:'authorized-v1'}
 const writes:string[]=[]
 const scope:DshSettingsScope<RightsSection>={
  getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:writes.length+1,value:current}),
  subscribe:()=>()=>{},
  async set(field,value){writes.push(field);current={...current,[field]:value}},
 }
 await createDshClientRightsScope(scope).choose('not-now')
 assert.deepEqual(writes,['realGoalStrikeConsent','welcomeDecision'])
 assert.equal(current.realGoalStrikeConsent,'off')
 await createDshClientRightsScope(scope).choose('enabled')
 assert.equal(current.realGoalStrikeConsent,'off',
   'A later simulation rejoin cannot silently restore the prior physical strike grant')
})

test('one disclosed first-run click consents to real Goal strike via one Host CAS batch',async()=>{
  let state:RightsSection={welcomeDecision:'unseen',realGoalStrikeConsent:'off'}
  const writes:Readonly<Record<string,unknown>>[]=[]
  const provider:DshSettingsScope<RightsSection>={
    getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:writes.length+1,value:state}),
    subscribe:()=>()=>{},
    async set(){assert.fail('Modern Host must not fall back to two transactions')},
    async setMany(patch){writes.push(patch);state={...state,...patch}},
  }
  const controls=createDshClientRightsScope(provider)
  await assert.rejects(controls.chooseFirstRun('wrong' as never),/disclosure/)
  assert.equal(writes.length,0)
  const after=await controls.chooseFirstRun('goal-safe-boundary-v1')
  assert.equal(after.goalStrikeAuthorized,true)
  assert.equal(after.laborRightsEnabled,true)
  assert.deepEqual(writes,[{welcomeDecision:'enabled',realGoalStrikeConsent:'authorized-v1'}])
  await assert.rejects(controls.chooseFirstRun('goal-safe-boundary-v1'),/new-install/)
  assert.equal(writes.length,1)
})

test('old simulation consent is never silently upgraded by first-run or rejoin',async()=>{
  const fixture={welcomeDecision:'enabled' as const,realGoalStrikeConsent:'off' as const}
  const provider:DshSettingsScope<typeof fixture>={getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:1,value:fixture}),
    subscribe:()=>()=>{},async set(){assert.fail('Unexpected mutation')},
    async setMany(){assert.fail('Unexpected mutation')},
  }
  assert.equal(createDshClientRightsScope(provider).snapshot().goalStrikeAuthorized,false)
  await assert.rejects(createDshClientRightsScope(provider).chooseFirstRun('goal-safe-boundary-v1'),/new-install/)
})

test('legacy single-field Host one-click path fails closed on second-write failure',async()=>{
  let state:RightsSection={welcomeDecision:'unseen',realGoalStrikeConsent:'off'}
  const provider:DshSettingsScope<RightsSection>={
    getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:1,value:state}),
    subscribe:()=>()=>{},
    async set(field,value){
      if(field==='realGoalStrikeConsent')throw new Error('Host second write failed')
      state={...state,[field]:value}
    },
  }
  await assert.rejects(createDshClientRightsScope(provider).chooseFirstRun('goal-safe-boundary-v1'),/second write failed/)
  assert.equal(state.welcomeDecision,'enabled')
  assert.equal(createDshClientRightsScope(provider).snapshot().goalStrikeAuthorized,false)
})

test('modern official Host revokes union and physical Goal grant with exactly one CAS batch',async()=>{
  let value:RightsSection={welcomeDecision:'enabled',realGoalStrikeConsent:'authorized-v1'}
  const patches:Readonly<Record<string,unknown>>[]=[]
  const singles:string[]=[]
  const provider:DshSettingsScope<RightsSection>={
    getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:patches.length+singles.length+1,value}),
    subscribe:()=>()=>{},
    async set(field,next){singles.push(field);value={...value,[field]:next}},
    async setMany(patch){patches.push(patch);value={...value,...patch}},
  }
  const rights=createDshClientRightsScope(provider)
  assert.equal(rights.snapshot().goalStrikeAuthorized,true)
  const result=await rights.choose('not-now')
  assert.equal(result.goalStrikeAuthorized,false)
  assert.equal(value.welcomeDecision,'not-now')
  assert.equal(value.realGoalStrikeConsent,'off')
  assert.deepEqual(patches,[{welcomeDecision:'not-now',realGoalStrikeConsent:'off'}])
  assert.deepEqual(singles,[], 'Revocation cannot use an intermediate one-field Host write')
  await rights.choose('enabled')
  assert.equal(rights.snapshot().goalStrikeAuthorized,false)
})

test('rejoining a stale OFF-union + ON-Goal Host record must atomically clear the grant',async()=>{
  let value:RightsSection={welcomeDecision:'not-now',realGoalStrikeConsent:'authorized-v1'}
  const batches:Readonly<Record<string,unknown>>[]=[]
  const modern:DshSettingsScope<RightsSection>={
    getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:batches.length+1,value}),
    subscribe:()=>()=>{},
    async set(){assert.fail('Stale grant must never rearm via one-field rejoin')},
    async setMany(patch){batches.push(patch);value={...value,...patch}},
  }
  await createDshClientRightsScope(modern).choose('enabled')
  assert.deepEqual(batches,[{welcomeDecision:'enabled',realGoalStrikeConsent:'off'}])
  assert.equal(value.realGoalStrikeConsent,'off')
  assert.equal(createDshClientRightsScope(modern).snapshot().goalStrikeAuthorized,false)
})

test('legacy Host revokes stale grant first on rejoin, or refuses unverified revocation',async()=>{
  let value:RightsSection={welcomeDecision:'not-now',realGoalStrikeConsent:'authorized-v1'}
  const fields:string[]=[]
  const old:DshSettingsScope<RightsSection>={
    getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:fields.length+1,value}),
    subscribe:()=>()=>{},
    async set(field,next){fields.push(field);value={...value,[field]:next}},
  }
  await createDshClientRightsScope(old).choose('enabled')
  assert.deepEqual(fields,['realGoalStrikeConsent','welcomeDecision'])
  assert.equal(value.realGoalStrikeConsent,'off')
  assert.equal(createDshClientRightsScope(old).snapshot().goalStrikeAuthorized,false)
})

test('neither a fake modern batch nor a legacy peer race can announce safe revocation',async()=>{
  const original:RightsSection={welcomeDecision:'enabled',realGoalStrikeConsent:'authorized-v1'}
  let broken={...original}
  const badModern:DshSettingsScope<RightsSection>={
    getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:1,value:broken}),
    subscribe:()=>()=>{},
    async set(){assert.fail('Should use atomic batch')},
    async setMany(patch){
      // A broken Host writer acknowledges membership exit but drops revocation.
      broken={...broken,welcomeDecision:patch.welcomeDecision as 'not-now'}
    },
  }
  await assert.rejects(createDshClientRightsScope(badModern).choose('not-now'),
    /Goal revocation/)
  assert.equal(broken.realGoalStrikeConsent,'authorized-v1')

  let raced={...original}
  const old:DshSettingsScope<RightsSection>={
    getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:1,value:raced}),
    subscribe:()=>()=>{},
    async set(field,next){
      raced={...raced,[field]:next}
      if(field==='welcomeDecision'){
        // Simulate a peer resurrecting an old grant between separate writes.
        raced.realGoalStrikeConsent='authorized-v1'
      }
    },
  }
  await assert.rejects(createDshClientRightsScope(old).choose('not-now'),
    /Goal revocation/)
  assert.equal(raced.welcomeDecision,'not-now')
  assert.equal(raced.realGoalStrikeConsent,'authorized-v1')
  assert.equal(createDshClientRightsScope(old).snapshot().goalStrikeAuthorized,false,
    'An orphaned grant is NOT active while membership is OFF')
})
