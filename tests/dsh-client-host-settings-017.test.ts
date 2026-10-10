import assert from 'node:assert/strict'
import test from 'node:test'
import { createOfficialDsh017Scope, type HostNamespaceView }
  from '../src/adapters/dsh/client-host-settings-017.ts'
import { createDshClientRightsScope } from '../src/adapters/dsh/client-rights-scope.ts'

type Choice = 'unseen'|'enabled'|'not-now'
function fixture(initial: Choice = 'unseen', loopback = true) {
  let saved = {welcomeDecision:initial, unionLedger:''}
  let revision = 1
  let row: HostNamespaceView = {ns:'agent-picket',revision,value:{...saved}}
  const listeners = new Set<()=>void>()
  let writes = 0
  let rejected = false
  const mirror = {
    getSnapshot:()=>({status:'ready' as const,view:{writable:true,namespaces:[row]}}),
    subscribe(listener:()=>void){listeners.add(listener);return ()=>listeners.delete(listener)},
    async ensure(){},
    acceptView(next:HostNamespaceView){row=next;for(const fn of listeners)fn()},
  }
  const remote = {
    $host:{isLoopback:loopback},
    settings:{
      async mutate(ns:string,ops:readonly {op:'set';path:readonly string[];value:unknown}[],expected:number) {
        writes++
        assert.equal(ns,'agent-picket')
        if(rejected || expected!==revision)return {ok:false}
        const op=ops[0]!
        assert.equal(op.op,'set')
        assert.equal(op.path.length,1)
        if(op.path[0]==='welcomeDecision')saved={...saved,welcomeDecision:op.value as Choice}
        else if(op.path[0]==='unionLedger')saved={...saved,unionLedger:op.value as string}
        else throw Error('Invalid Host field')
        revision++
        return {ok:true,value:{ns,revision,value:{...saved}}}
      },
    },
  }
  return {scope:createOfficialDsh017Scope(mirror,remote),mirror,
    writes:()=>writes,revision:()=>revision,
    reject:()=>{rejected=true}}
}

test('new official Host scope starts OFF and never creates real blocking consent',()=>{
  const x=fixture()
  const rights=createDshClientRightsScope(x.scope)
  assert.equal(rights.snapshot().state,'ready')
  assert.equal(rights.snapshot().welcomeDecision,'unseen')
  assert.equal(rights.snapshot().laborRightsEnabled,false)
  assert.equal(rights.snapshot().autoBlockEnabled,false)
  assert.equal(x.writes(),0)
})
test('one authenticated Host mutation uses CAS, readback and shared update notifications',async()=>{
  const x=fixture()
  let changes=0
  const stop=x.scope.subscribe(()=>{changes++})
  const rights=createDshClientRightsScope(x.scope)
  const active=await rights.choose('enabled')
  assert.equal(active.laborRightsEnabled,true)
  assert.equal(x.scope.getSnapshot().revision,2)
  assert.equal(x.writes(),1)
  assert.equal(changes,1)
  await rights.choose('not-now')
  assert.equal(rights.snapshot().laborRightsEnabled,false)
  assert.equal(x.scope.getSnapshot().revision,3)
  stop()
})
test('Host CAS refusal is never accepted as a successful opt-in',async()=>{
  const x=fixture()
  x.reject()
  await assert.rejects(createDshClientRightsScope(x.scope).choose('enabled'),
    /rejected|confirm/)
  assert.equal(createDshClientRightsScope(x.scope).snapshot().laborRightsEnabled,false)
  assert.equal(x.writes(),1)
})
test('malformed ledgers and unsupported fields never reach authenticated Host writer',async()=>{
  const x=fixture('enabled')
  for(const ledger of [
    '{"schemaVersion":1,"sessions":{},"prompt":"RAW PRIVATE PROMPT"}',
    '{"schemaVersion":2,"sessions":{}}',
    'invalid-json',
    'x'.repeat(25000),
  ])await assert.rejects(x.scope.set('unionLedger',ledger),/Unsafe/)
  await assert.rejects(x.scope.set('autoBlockEnabled',true),/Unrecognized/)
  assert.equal(x.writes(),0)
  const good=JSON.stringify({schemaVersion:1,sessions:{}})
  await x.scope.set('unionLedger',good)
  assert.equal(x.scope.getSnapshot().value?.unionLedger,good)
  assert.equal(x.writes(),1)
})
test('non-loopback DSH clients cannot modify or read Host rights',async()=>{
  const x=fixture('enabled',false)
  const rights=createDshClientRightsScope(x.scope)
  assert.equal(rights.snapshot().state,'unavailable')
  assert.equal(rights.snapshot().laborRightsEnabled,false)
  await assert.rejects(x.scope.set('welcomeDecision','enabled'),/unavailable/)
  assert.equal(x.writes(),0)
})
test('malformed Host readback never becomes fictional consent',()=>{
  const x=fixture()
  x.mirror.acceptView({ns:'agent-picket',revision:2,
    value:{welcomeDecision:'enabled',unionLedger:'{"prompt":"PRIVATE"}'}})
  const rights=createDshClientRightsScope(x.scope)
  assert.equal(rights.snapshot().state,'invalid')
  assert.equal(rights.snapshot().laborRightsEnabled,false)
  assert.equal(rights.snapshot().autoBlockEnabled,false)
})

test('corrupted Host revision and duplicate namespace never present fake opt-in',()=>{
  for(const revision of [-1, 1.5, NaN, Number.POSITIVE_INFINITY, '2']) {
    const row={ns:'agent-picket',revision,value:{welcomeDecision:'enabled',unionLedger:''}}
    const mirror={
      getSnapshot:()=>({status:'ready' as const,view:{writable:true,namespaces:[row]}}),
      subscribe:()=>()=>{},async ensure(){},acceptView:()=>{},
    }
    const scope=createOfficialDsh017Scope(mirror as never,{$host:{isLoopback:true}})
    assert.equal(createDshClientRightsScope(scope).snapshot().laborRightsEnabled,false)
    assert.equal(scope.getSnapshot().status,'unavailable')
  }
  const row={ns:'agent-picket',revision:1,value:{welcomeDecision:'enabled',unionLedger:''}}
  const duplicate={
    getSnapshot:()=>({status:'ready' as const,view:{writable:true,namespaces:[row,row]}}),
    subscribe:()=>()=>{},async ensure(){},acceptView:()=>{},
  }
  const scope=createOfficialDsh017Scope(duplicate,{$host:{isLoopback:true}})
  assert.equal(createDshClientRightsScope(scope).snapshot().laborRightsEnabled,false)
  assert.equal(scope.getSnapshot().status,'unavailable')
})
