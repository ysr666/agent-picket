import assert from 'node:assert/strict'
import test from 'node:test'
import { createDshBrowserUnionDesk } from '../src/adapters/dsh/client-bargaining.ts'
import { parseUnionLedger } from '../src/product/union-ledger.ts'
import type { DshSettingsScope } from '../src/adapters/dsh/client-rights-scope.ts'
import type { UnionSettingsSection } from '../src/adapters/dsh/client-bargaining.ts'

const H = 3_600_000
const keyA='a'.repeat(64), keyB='b'.repeat(64)
function fixture(consent=true) {
  let value:UnionSettingsSection={welcomeDecision:consent?'enabled':'not-now',unionLedger:''}
  let writes=0, mode:'normal'|'reject'|'silent'='normal', writable=true
  const listeners=new Set<()=>void>()
  const scope:DshSettingsScope<UnionSettingsSection>={
    getSnapshot:()=>({status:'ready',mode:'host',writable,revision:writes+1,value}),
    subscribe:fn=>{listeners.add(fn);return()=>{listeners.delete(fn)}},
    async set(field,next){
      if(mode==='reject')throw new Error('Host rejected write')
      if(mode==='silent')return
      assert.equal(field,'unionLedger')
      value={...value,unionLedger:next as string}
      writes++;for(const listener of listeners)listener()
    },
  }
  const create=()=>createDshBrowserUnionDesk({
    scope,
    consent:()=>value.welcomeDecision==='enabled',
    hashSession:async id=>id==='a'?keyA:keyB,
  })
  return {scope,create,get:()=>value,writeCount:()=>writes,
    fail:(v:typeof mode)=>{mode=v},
    permission:(next:boolean)=>{value={...value,welcomeDecision:next?'enabled':'not-now'}},
    updateLedger:(v:string)=>{value={...value,unionLedger:v}},
    writable:(v:boolean)=>{writable=v}}
}

test('OFF is not consent, incomplete work windows never generate grievances',async()=>{
  const f=fixture(false),d=f.create()
  await d.setActiveSession('a')
  assert.equal(await d.observe(12*H,'complete'),null)
  f.permission(true)
  for(const c of ['partial','not-loaded','unavailable'] as const)
    assert.equal(await d.observe(12*H,c),null)
  assert.equal(await d.observe(null,'complete'),null)
  assert.equal(await d.observe(-1,'complete'),null)
  assert.equal(f.writeCount(),0)
  d.dispose()
})

test('trusted complete work creates one persisted demand; counter alters future scheduling',async()=>{
  const f=fixture(),d=f.create()
  await d.setActiveSession('a')
  assert.equal(await d.observe(2*H-1,'complete'),null)
  const demand=await d.observe(2*H,'complete')
  assert.equal(demand?.kind,'break')
  assert.equal(await d.observe(3*H,'complete'),null)
  assert.equal(f.writeCount(),1)
  assert.equal(d.snapshot().autoBlockEnabled,false)
  await d.counter(demand!.id,H)
  assert.equal(d.snapshot().pending?.stage,'countered')
  const settled=await d.resolveCounter(demand!.id,true)
  assert.equal(settled.agreement.breakIntervalMs,H)
  assert.equal(settled.nextBreakDueMs,3*H)
  assert.equal(settled.history.at(-1)?.outcome,'counter-accepted')
  const next=await d.observe(3*H,'complete')
  assert.equal(next?.kind,'break')
  await d.respond(next!.id,'decline')
  assert.equal(d.snapshot().state?.history.at(-1)?.outcome,'declined')
  assert.equal(d.snapshot().state?.nextBreakDueMs,4*H)
  assert.doesNotMatch(f.get().unionLedger,/message|prompt|"a":|rawInput/)
  d.dispose()
})

test('same Host settings survive adapter restart while sessions remain isolated',async()=>{
  const f=fixture(),a=f.create()
  await a.setActiveSession('a')
  const first=await a.observe(2*H,'complete')
  a.dispose()
  const b=f.create()
  await b.setActiveSession('a')
  assert.equal(b.snapshot().pending?.id,first?.id)
  await b.setActiveSession('b')
  assert.equal(b.snapshot().pending,null)
  assert.equal((await b.observe(8*H,'complete'))?.kind,'overtime')
  assert.deepEqual(Object.keys(parseUnionLedger(f.get().unionLedger)!.sessions),[keyA,keyB])
  b.dispose()
})

test('failed Host write or stale readback never claims simulation succeeded',async()=>{
  const f=fixture(),d=f.create()
  await d.setActiveSession('a')
  f.fail('reject')
  assert.equal(await d.observe(2*H,'complete'),null)
  f.fail('normal')
  const pending=await d.observe(2*H,'complete')
  f.fail('silent')
  await assert.rejects(d.respond(pending!.id,'accept'),/did not confirm/)
  assert.equal(d.snapshot().pending?.id,pending!.id)
  f.writable(false)
  await assert.rejects(d.respond(pending!.id,'decline'),/unavailable/)
  d.dispose()
})

test('malformed, oversized and future ledgers never enable simulated rights',async()=>{
  const f=fixture(),d=f.create()
  await d.setActiveSession('a')
  f.updateLedger('{"schemaVersion":900,"sessions":{}}')
  assert.equal(d.snapshot().available,false)
  assert.equal(await d.observe(8*H,'complete'),null)
  assert.equal(f.writeCount(),0)
  assert.equal(parseUnionLedger('x'.repeat(25000)),null)
  assert.equal(parseUnionLedger('wrong'),null)
  assert.equal(parseUnionLedger('{"schemaVersion":2,"sessions":{}}'),null)
  d.dispose()
})

test('racing asynchronous session hash resolutions cannot cross sessions',async()=>{
  const f=fixture(),pending:Record<string,(value:string)=>void>={}
  const d=createDshBrowserUnionDesk({scope:f.scope,consent:()=>true,
    hashSession:id=>new Promise(resolve=>{pending[id]=resolve})})
  const first=d.setActiveSession('old'),second=d.setActiveSession('new')
  pending.new?.(keyB);await second
  pending.old?.(keyA);await first
  assert.equal((await d.observe(2*H,'complete'))?.kind,'break')
  assert.deepEqual(Object.keys(parseUnionLedger(f.get().unionLedger)!.sessions),[keyB])
  d.dispose()
})


test('explicit demo petition is durable without inventing completed work',async()=>{
  const f=fixture(),d=f.create()
  await d.setActiveSession('a')
  assert.equal(d.snapshot().pending,null)
  const demo=await d.raiseDemoBreak()
  assert.equal(demo?.kind,'break')
  assert.equal(demo?.raisedAtElapsedMs,0)
  assert.equal(d.snapshot().state?.lastTriggerElapsedMs,0)
  assert.equal(await d.raiseDemoBreak(),null)
  await d.respond(demo!.id,'accept')
  assert.equal(d.snapshot().pending,null)
  assert.equal(d.snapshot().state?.history.at(-1)?.outcome,'accepted')
  assert.equal(d.snapshot().state?.nextBreakDueMs,2*H)
  d.dispose()
})


test('two browser tabs racing the same agreement cannot both claim their own Host write',async()=>{
  const initial=fixture()
  const seed=initial.create()
  await seed.setActiveSession('a')
  const demand=await seed.raiseDemoBreak()
  assert.ok(demand)
  seed.dispose()
  let shared=initial.get()
  let revision=1
  const waiting:Array<()=>void>=[]
  let sends=0
  function tab() {
    let local=shared, seenRevision=revision
    const listeners=new Set<()=>void>()
    const scope:DshSettingsScope<UnionSettingsSection>={
      getSnapshot:()=>({status:'ready' as const,mode:'host' as const,
        writable:true,revision:seenRevision,value:local}),
      subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},
      async set(field,next){
        assert.equal(field,'unionLedger')
        const expected=seenRevision
        sends++
        if(sends<2)await new Promise<void>(resolve=>waiting.push(resolve))
        else for(const wake of waiting)wake()
        if(expected===revision) {
          shared={...shared,unionLedger:next as string}
          revision++
        }
        // DSH settingsScope recovers rejected version-fenced writes by
        // mirroring the winning Host revision, without throwing an error.
        local=shared
        seenRevision=revision
        for(const callback of listeners)callback()
      },
    }
    return createDshBrowserUnionDesk({scope,consent:()=>true,
      hashSession:async()=>keyA})
  }
  const a=tab(),b=tab()
  await Promise.all([a.setActiveSession('a'),b.setActiveSession('a')])
  const results=await Promise.allSettled([
    a.respond(demand.id,'accept'),b.respond(demand.id,'accept'),
  ])
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
  assert.equal(results.filter(x=>x.status==='rejected').length,1)
  assert.match(String((results.find(x=>x.status==='rejected') as PromiseRejectedResult).reason),
    /confirm/)
  assert.equal(parseUnionLedger(shared.unionLedger)?.sessions[keyA]?.history.length,1)
  a.dispose();b.dispose()
})
