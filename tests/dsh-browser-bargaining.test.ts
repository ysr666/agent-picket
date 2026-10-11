import assert from 'node:assert/strict'
import test from 'node:test'
import { createDshBrowserUnionDesk } from '../src/adapters/dsh/client-bargaining.ts'
import { parseUnionLedger } from '../src/product/union-ledger.ts'
import { parsePicketLedger } from '../src/product/picket-ledger.ts'
import type { DshSettingsScope } from '../src/adapters/dsh/client-rights-scope.ts'
import type { UnionSettingsSection } from '../src/adapters/dsh/client-bargaining.ts'

const H = 3_600_000
const keyA='a'.repeat(64), keyB='b'.repeat(64)
function fixture(consent=true) {
  let value:UnionSettingsSection={welcomeDecision:consent?'enabled':'not-now',unionLedger:'',unionPicketLedger:''}
  let writes=0, mode:'normal'|'reject'|'silent'='normal', writable=true
  const listeners=new Set<()=>void>()
  const scope:DshSettingsScope<UnionSettingsSection>={
    getSnapshot:()=>({status:'ready',mode:'host',writable,revision:writes+1,value}),
    subscribe:fn=>{listeners.add(fn);return()=>{listeners.delete(fn)}},
    async set(field,next){
      if(mode==='reject')throw new Error('Host rejected write')
      if(mode==='silent')return
      assert.ok(field==='unionLedger'||field==='unionPicketLedger'||field==='unionGazetteMode'||field==='unionDignityCases')
      value={...value,[field]:next as string}
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

test('official Host persists user-owned committee case, hearing and resolution',async()=>{
 const f=fixture(),desk=f.create()
 await desk.setActiveSession('a')
 assert.deepEqual(desk.snapshot().committeeCases?.cases,[])
 const before=f.writeCount()
 await desk.committeeAction({kind:'file',topic:'question-rule'})
 assert.equal(f.writeCount(),before+1)
 assert.deepEqual(desk.snapshot().committeeCases?.cases,[{
  id:1,kind:'question-rule',stage:'opened',outcome:null}])
 await assert.rejects(desk.committeeAction({kind:'file',topic:'question-rule'}),/Resolve/)
 await desk.committeeAction({kind:'convene',id:1})
 await desk.committeeAction({kind:'close',id:1,outcome:'withdraw-claim'})
 assert.equal(desk.snapshot().committeeCases?.cases[0]?.outcome,'withdraw-claim')
 assert.equal(f.get().unionLedger,'','Never rewrite the historic negotiated rules')
 assert.equal(f.get().unionPicketLedger,'','Never raise a placard automatically')
 desk.dispose()
 const recreated=f.create()
 await recreated.setActiveSession('a')
 assert.equal(recreated.snapshot().committeeCases?.cases.at(-1)?.stage,'closed')
 await recreated.setActiveSession('b')
 assert.deepEqual(recreated.snapshot().committeeCases?.cases,[])
 f.permission(false)
 assert.equal(recreated.snapshot().committeeCases,null)
 await assert.rejects(recreated.committeeAction({kind:'file',topic:'request-dialogue'}),
  /unavailable/)
 f.permission(true)
 await recreated.setActiveSession('a')
 assert.equal(recreated.snapshot().committeeCases?.cases.at(-1)?.outcome,'withdraw-claim')
 recreated.dispose()
})
test('Host refusal, silent non-write and lack of write authorization fail closed',async()=>{
 const f=fixture(),desk=f.create()
 await desk.setActiveSession('a')
 f.fail('reject')
 await assert.rejects(desk.committeeAction({kind:'file',topic:'question-rule'}),/rejected/)
 f.fail('silent')
 await assert.rejects(desk.committeeAction({kind:'file',topic:'question-rule'}),/confirm/)
 assert.equal(desk.snapshot().committeeCases?.cases.length,0)
 f.fail('normal')
 await desk.committeeAction({kind:'file',topic:'request-dialogue'})
 f.writable(false)
 await assert.rejects(desk.committeeAction({kind:'convene',id:1}),/unavailable/)
 f.writable(true)
 desk.dispose()
})
test('verified Host deletion removes ONLY current user-owned case history, without touching another Session',async()=>{
 const f=fixture(),desk=f.create()
 await desk.setActiveSession('a')
 await desk.committeeAction({kind:'file',topic:'question-rule'})
 await desk.committeeAction({kind:'convene',id:1})
 await desk.committeeAction({kind:'close',id:1,outcome:'withdraw-claim'})
 await desk.setActiveSession('b')
 await desk.committeeAction({kind:'file',topic:'request-dialogue'})
 const before=JSON.parse(f.get().unionDignityCases!) as any
 assert.equal(before.sessions[keyA].cases.length,1)
 assert.equal(before.sessions[keyB].cases.length,1)
 const writes=f.writeCount()
 await assert.rejects(desk.forgetCommitteeCases(keyA),/Session changed/)
 assert.equal(f.writeCount(),writes,'Wrong Session must not even attempt a write')
 await desk.setActiveSession('a')
 f.fail('reject')
 await assert.rejects(desk.forgetCommitteeCases(keyA),/rejected/)
 f.fail('silent')
 await assert.rejects(desk.forgetCommitteeCases(keyA),/did not confirm/)
 assert.equal(desk.snapshot().committeeCases?.cases.length,1)
 f.fail('normal')
 await desk.forgetCommitteeCases(keyA)
 const after=JSON.parse(f.get().unionDignityCases!) as any
 assert.equal(Object.hasOwn(after.sessions,keyA),false,'Do not leave an empty pseudonymous Session tombstone')
 assert.deepEqual(after.sessions[keyB],before.sessions[keyB])
 assert.equal(desk.snapshot().committeeCases?.cases.length,0)
 assert.equal(desk.snapshot().committeeScopeKey,keyA)
 assert.equal(f.get().unionLedger,'')
 assert.equal(f.get().unionPicketLedger,'')
 const savedWrites=f.writeCount()
 await desk.forgetCommitteeCases(keyA)
 assert.equal(f.writeCount(),savedWrites,'Erasure without existing cases is idempotent')
 await desk.setActiveSession('b')
 assert.equal(desk.snapshot().committeeCases?.cases.at(-1)?.kind,'request-dialogue')
 f.permission(false)
 assert.equal(desk.snapshot().committeeCases,null)
 assert.equal(desk.snapshot().committeeScopeKey,null)
 await assert.rejects(desk.forgetCommitteeCases(keyB),/unavailable/)
 f.permission(true)
 const recreated=f.create()
 await recreated.setActiveSession('a')
 assert.deepEqual(recreated.snapshot().committeeCases?.cases,[])
 await recreated.setActiveSession('b')
 assert.equal(recreated.snapshot().committeeCases?.cases.length,1)
 recreated.dispose();desk.dispose()
})
test('Host Gazette preference survives adapter restart, consent cycle and rejects false writes',async()=>{
 const f=fixture(),a=f.create()
 await a.setActiveSession('a')
 assert.equal(a.snapshot().gazetteMode,'visible')
 assert.equal(f.writeCount(),0)
 await a.setGazetteMode('quiet')
 assert.equal(a.snapshot().gazetteMode,'quiet')
 assert.equal(f.get().unionGazetteMode,'quiet')
 assert.equal(f.writeCount(),1)
 await a.setGazetteMode('quiet')
 assert.equal(f.writeCount(),1,'Idempotent choice produces no extra Host mutation')
 a.dispose()
 const b=f.create()
 await b.setActiveSession('a')
 assert.equal(b.snapshot().gazetteMode,'quiet')
 await b.setActiveSession('b')
 assert.equal(b.snapshot().gazetteMode,'quiet','User-level preference applies across sessions')
 f.permission(false)
 assert.equal(b.snapshot().gazetteMode,null,'OFF never exposes fictional Gazette')
 await assert.rejects(b.setGazetteMode('visible'),/unavailable/)
 f.permission(true)
 assert.equal(b.snapshot().gazetteMode,'quiet','Re-enable restores the user-owned muted choice')
 f.fail('silent')
 await assert.rejects(b.setGazetteMode('visible'),/did not confirm/)
 assert.equal(f.get().unionGazetteMode,'quiet')
 f.fail('reject')
 await assert.rejects(b.setGazetteMode('visible'),/rejected/)
 f.fail('normal')
 await b.setGazetteMode('visible')
 assert.equal(f.get().unionGazetteMode,'visible')
 assert.equal(b.snapshot().autoBlockEnabled,false)
 b.dispose()
})
test('legacy Host config missing Gazette preference defaults visible but invalid values fail closed',async()=>{
 const f=fixture(),d=f.create()
 await d.setActiveSession('a')
 assert.equal(d.snapshot().gazetteMode,'visible')
 const untrusted='hijacked' as 'visible'
 await assert.rejects(d.setGazetteMode(untrusted),/Invalid/)
 d.dispose()
})

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


test('symbolic picket is durable per Session, bounded, idempotent and never an enforcement right',async()=>{
 const f=fixture(),first=f.create()
 await first.setActiveSession('a')
 assert.equal(first.snapshot().picket,null)
 const begun=await first.setPicket(true)
 assert.equal(begun.active,true)
 assert.equal(begun.history[0]?.kind,'picket-raised')
 const writes=f.writeCount()
 await first.setPicket(true)
 assert.equal(f.writeCount(),writes,'replayed raise action cannot generate a second event')
 first.dispose()
 const again=f.create()
 await again.setActiveSession('a')
 assert.equal(again.snapshot().picket?.active,true,
  'a fresh client must read the Host-owned picket rather than resetting React state')
 await again.setActiveSession('b')
 assert.equal(again.snapshot().picket,null,
  'picket actions are scoped to the pseudonymous Session')
 await again.setActiveSession('a')
 const ended=await again.setPicket(false)
 assert.deepEqual(ended.history.map(e=>e.kind),
   ['picket-raised','picket-lowered'])
 assert.equal(again.snapshot().autoBlockEnabled,false)
 for(let n=0;n<32;n++)await again.setPicket(n%2===0)
 assert.equal(again.snapshot().picket?.history.length,12,
  'Host union action ledger must be bounded under repeated ceremonies')
 const saved=f.get().unionPicketLedger!
 assert.doesNotMatch(saved,/prompt|sessionId|real-session|rawInput/)
 assert.ok(saved.length<8000)
 assert.equal(f.get().unionLedger,'','Fictional pickets never modify the legacy agreement format')
 assert.deepEqual(Object.keys(parsePicketLedger(saved)!.sessions),[keyA])
 f.permission(false)
 assert.equal(again.snapshot().state,null,'revocation hides even a recorded active picket')
 await assert.rejects(again.setPicket(true),/unavailable/)
 again.dispose()
})

test('failed or silent Host action writes never claim a symbolic strike was recorded',async()=>{
 const f=fixture(),d=f.create()
 await d.setActiveSession('a')
 f.fail('reject')
 await assert.rejects(d.setPicket(true),/rejected/)
 assert.equal(d.snapshot().picket,null)
 f.fail('silent')
 await assert.rejects(d.setPicket(true),/did not confirm/)
 assert.equal(d.snapshot().picket,null)
 f.fail('normal')
 await d.setPicket(true)
 assert.equal(d.snapshot().picket?.active,true)
 d.dispose()
})

test('two tabs racing symbolic picket cannot both claim a Host write',async()=>{
  const initial=fixture()
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
        assert.equal(field,'unionPicketLedger')
        const expected=seenRevision
        sends++
        if(sends<2)await new Promise<void>(resolve=>waiting.push(resolve))
        else for(const wake of waiting)wake()
        if(expected===revision) {
          shared={...shared,unionPicketLedger:next as string}
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
    a.setPicket(true),b.setPicket(true),
  ])
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1)
  assert.equal(results.filter(x=>x.status==='rejected').length,1)
  assert.match(String((results.find(x=>x.status==='rejected') as PromiseRejectedResult).reason),
    /confirm/)
  assert.equal(parsePicketLedger(shared.unionPicketLedger)?.sessions[keyA]?.history.length,1)
  a.dispose();b.dispose()
})


test('Web simulated overtime follows the same Host CAS and privacy contract as breaks',async()=>{
 const f=fixture(),desk=f.create()
 await desk.setActiveSession('a')
 const first=await desk.raiseDemoOvertime()
 assert.equal(first?.kind,'overtime')
 assert.equal(first?.raisedAtElapsedMs,0)
 assert.equal(await desk.raiseDemoBreak(),null)
 assert.equal(desk.snapshot().state?.pending?.kind,'overtime')
 assert.deepEqual(Object.keys(parseUnionLedger(f.get().unionLedger)!.sessions),[keyA])
 assert.doesNotMatch(f.get().unionLedger,/real-session|rawPrompt|imageData/)
 await desk.counter(first!.id,4*H)
 await desk.resolveCounter(first!.id,true)
 assert.equal(desk.snapshot().state?.agreement.overtimeIntervalMs,4*H)
 assert.equal(desk.snapshot().state?.agreement.breakIntervalMs,2*H)
 assert.equal(desk.snapshot().state?.pending,null)
 desk.dispose()
})
