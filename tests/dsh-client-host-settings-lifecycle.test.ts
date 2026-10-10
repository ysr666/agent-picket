import assert from 'node:assert/strict'
import test from 'node:test'
import { createOfficialDsh017Scope, type HostNamespaceView,
  type OfficialHostSettings } from '../src/adapters/dsh/client-host-settings-017.ts'
import { createDshClientRightsScope } from '../src/adapters/dsh/client-rights-scope.ts'

const row = (choice:'unseen'|'enabled'|'not-now', revision:number,
  ledger = ''):HostNamespaceView=>({
  ns:'agent-picket',revision,value:{welcomeDecision:choice,unionLedger:ledger},
})
type MutationResult = Awaited<ReturnType<NonNullable<OfficialHostSettings['settings']>['mutate']>>
function harness() {
  let status:'ready'|'unavailable' = 'ready'
  let value = row('unseen',1)
  let updates = 0
  let stopCount = 0
  const callbacks = new Set<()=>void>()
  let finish:((result:MutationResult)=>void)|undefined
  const mirror = {
    getSnapshot:()=>({status,view:{
      writable:true,namespaces:[value],
    }}),
    subscribe(callback:()=>void) {
      callbacks.add(callback)
      return ()=>{stopCount++;callbacks.delete(callback)}
    },
    async ensure(){},
    acceptView(next:HostNamespaceView) {
      updates++
      value=next
      for(const fn of callbacks)fn()
    },
  }
  const remote:OfficialHostSettings = {
    $host:{isLoopback:true},
    settings:{
      mutate:async () => new Promise<MutationResult>(resolve=>{finish=resolve}),
    },
  }
  const scope=createOfficialDsh017Scope(mirror,remote)
  return {
    scope,mirror,
    finish:(result:MutationResult)=>{assert.ok(finish,'operation must be dispatched');finish(result)},
    disconnect:()=>{status='unavailable'},
    view:()=>value,
    updates:()=>updates,
    stops:()=>stopCount,
  }
}

test('Host reply with enabled choice but unchanged revision cannot publish new consent',async()=>{
  const h=harness()
  let changed=0
  const unsub=h.scope.subscribe(()=>changed++)
  const task=h.scope.set('welcomeDecision','enabled')
  await Promise.resolve()
  h.finish({ok:true,value:row('enabled',1)})
  await assert.rejects(task,/confirmation/)
  assert.equal(createDshClientRightsScope(h.scope).snapshot().laborRightsEnabled,false)
  assert.equal(h.updates(),0)
  assert.equal(changed,0)
  unsub()
  assert.equal(h.stops(),1)
})

test('malformed success receipt is discarded before touching official Host mirror',async()=>{
  for(const invalid of [
    {ok:true,value:{...row('enabled',2),
      value:{welcomeDecision:'enabled',
        unionLedger:'{"schemaVersion":1,"sessions":{},"prompt":"TEST_ONLY"}'}}},
    {ok:true,value:{...row('enabled',2),ns:'unrelated-namespace'}},
    {ok:true,value:{...row('enabled',2),revision:-1}},
    {ok:true,value:row('not-now',2)},
  ]) {
    const h=harness()
    const task=h.scope.set('welcomeDecision','enabled')
    await Promise.resolve()
    h.finish(invalid)
    await assert.rejects(task,/confirmation|rejected/)
    assert.equal(h.updates(),0)
    assert.equal(h.view().revision,1)
    assert.equal(createDshClientRightsScope(h.scope).snapshot().laborRightsEnabled,false)
  }
})

test('Host disconnect during write cannot reintroduce stale enabled UI',async()=>{
  const h=harness()
  const task=h.scope.set('welcomeDecision','enabled')
  await Promise.resolve()
  h.disconnect()
  h.finish({ok:true,value:row('enabled',2)})
  await assert.rejects(task,/unavailable|changed/)
  assert.equal(h.updates(),0)
  assert.equal(createDshClientRightsScope(h.scope).snapshot().laborRightsEnabled,false)
})

test('Host update from another tab supersedes an older in-flight grant',async()=>{
  const h=harness()
  const task=h.scope.set('welcomeDecision','enabled')
  await Promise.resolve()
  h.mirror.acceptView(row('not-now',3))
  h.finish({ok:true,value:row('enabled',2)})
  await assert.rejects(task,/changed/)
  assert.equal(h.view().revision,3)
  assert.equal((h.view().value as {welcomeDecision:string}).welcomeDecision,'not-now')
  assert.equal(createDshClientRightsScope(h.scope).snapshot().laborRightsEnabled,false)
  assert.equal(h.updates(),1)
})

test('dispose drains in-flight write and never emits delayed Host consent',async()=>{
  const h=harness()
  let notifications=0
  h.scope.subscribe(()=>{notifications++})
  const task=h.scope.set('welcomeDecision','enabled')
  await Promise.resolve()
  const stopping=h.scope.dispose?.()
  assert.equal(h.stops(),1)
  h.finish({ok:true,value:row('enabled',2)})
  await assert.rejects(task,/unavailable|changed/)
  await stopping
  assert.equal(h.updates(),0)
  assert.equal(notifications,0)
  assert.equal(h.scope.getSnapshot().status,'unavailable')
  await assert.rejects(h.scope.set('welcomeDecision','enabled'),/unavailable/)
})

test('official Host no-op at same revision is valid only for unchanged consent',async()=>{
  const h=harness()
  const task=h.scope.set('welcomeDecision','unseen')
  await Promise.resolve()
  h.finish({ok:true,value:row('unseen',1)})
  await task
  assert.equal(h.updates(),0)
  assert.equal(h.view().revision,1)
  assert.equal(createDshClientRightsScope(h.scope).snapshot().laborRightsEnabled,false)
})
