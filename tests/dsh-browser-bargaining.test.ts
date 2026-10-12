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
 // The first consent is a snapshot of the exact Session and Host ledger
 // version, not permission to erase any records added by another tab.
 const approval=desk.snapshot().committeeArchive!
 assert.equal(approval.cases,2)
 await assert.rejects(desk.forgetCommitteeCases(keyA,1,approval.writeToken),/Session changed/)
 assert.equal(f.writeCount(),writes,'Wrong Session must not even attempt a write')
 await desk.setActiveSession('a')
 const confirmed=desk.snapshot().committeeArchive!
 const version=confirmed.writeToken
 assert.equal(desk.snapshot().committeeCases?.cases.length,1)
 f.fail('reject')
 await assert.rejects(desk.forgetCommitteeCases(keyA,1,version),/rejected/)
 f.fail('silent')
 await assert.rejects(desk.forgetCommitteeCases(keyA,1,version),/did not confirm/)
 assert.equal(desk.snapshot().committeeCases?.cases.length,1)
 f.fail('normal')
 await desk.forgetCommitteeCases(keyA,1,version)
 const after=JSON.parse(f.get().unionDignityCases!) as any
 assert.equal(Object.hasOwn(after.sessions,keyA),false,'Do not leave an empty pseudonymous Session tombstone')
 assert.deepEqual(after.sessions[keyB],before.sessions[keyB])
 assert.equal(desk.snapshot().committeeCases?.cases.length,0)
 assert.equal(desk.snapshot().committeeScopeKey,keyA)
 assert.equal(f.get().unionLedger,'')
 assert.equal(f.get().unionPicketLedger,'')
 const savedWrites=f.writeCount()
 const empty=desk.snapshot().committeeArchive!
 await desk.forgetCommitteeCases(keyA,0,empty.writeToken)
 assert.equal(f.writeCount(),savedWrites,'Erasure without existing cases is idempotent')
 await desk.setActiveSession('b')
 assert.equal(desk.snapshot().committeeCases?.cases.at(-1)?.kind,'request-dialogue')
 f.permission(false)
 assert.equal(desk.snapshot().committeeCases,null)
 assert.equal(desk.snapshot().committeeScopeKey,null)
 await assert.rejects(desk.forgetCommitteeCases(keyB,1,empty.writeToken),/unavailable/)
 f.permission(true)
 const recreated=f.create()
 await recreated.setActiveSession('a')
 assert.deepEqual(recreated.snapshot().committeeCases?.cases,[])
 await recreated.setActiveSession('b')
 assert.equal(recreated.snapshot().committeeCases?.cases.length,1)
 recreated.dispose();desk.dispose()
})
test('stale deletion confirmation refuses even same-count edits from another tab',async()=>{
 const f=fixture(),first=f.create(),other=f.create()
 await first.setActiveSession('a')
 await other.setActiveSession('a')
 await first.committeeAction({kind:'file',topic:'request-dialogue'})
 const baseline=first.snapshot()
 const token=baseline.committeeArchive!.writeToken
 assert.equal(baseline.committeeCases?.cases.length,1)
 // Equivalent to a user arming the Delete button in the first tab.
 // A second tab moves the same case into the hearing stage. No case count
 // changes, but the exact version the user agreed to delete is superseded.
 await other.committeeAction({kind:'convene',id:1})
 assert.equal(first.snapshot().committeeCases?.cases.length,1)
 const writeCount=f.writeCount()
 await assert.rejects(first.forgetCommitteeCases(keyA,1,token),/changed; re-confirm/)
 assert.equal(f.writeCount(),writeCount,'Old confirmation must never write')
 assert.equal(first.snapshot().committeeCases?.cases[0]?.stage,'hearing')
 const refreshed=first.snapshot()
 await first.forgetCommitteeCases(keyA,1,refreshed.committeeArchive!.writeToken)
 assert.deepEqual(first.snapshot().committeeCases?.cases,[])
 first.dispose();other.dispose()
})

test('deletion approval rejects a changed case count and forged expected version',async()=>{
 const f=fixture(),desk=f.create()
 await desk.setActiveSession('a')
 await desk.committeeAction({kind:'file',topic:'question-rule'})
 const current=desk.snapshot()
 const token=current.committeeArchive!.writeToken
 const count=f.writeCount()
 await assert.rejects(desk.forgetCommitteeCases(keyA,2,token),/changed; re-confirm/)
 await assert.rejects(desk.forgetCommitteeCases(keyA,1,'f'.repeat(32)),/changed; re-confirm/)
 await assert.rejects(desk.forgetCommitteeCases(keyA,1,null),/changed; re-confirm/)
 assert.equal(f.writeCount(),count,'Forged or stale approval cannot erase records')
 assert.equal(desk.snapshot().committeeCases?.cases.length,1)
 desk.dispose()
})

test('user-controlled neutral retract and allowlisted case JSON export are Host-authenticated',async()=>{
 const f=fixture(),desk=f.create()
 await desk.setActiveSession('a')
 await desk.committeeAction({kind:'file',topic:'request-dialogue'})
 const prior=desk.snapshot().committeeCases?.cases[0]
 assert.deepEqual(prior,{id:1,kind:'request-dialogue',stage:'opened',outcome:null})
 const exported=desk.exportCommitteeCases(keyA)
 assert.deepEqual(JSON.parse(exported),{
  format:'agent-picket-committee-cases',schemaVersion:1,
  cases:[prior],
 })
 assert.equal(exported.includes(keyA),false,'No hashed Session identifier may appear in downloaded JSON')
 assert.equal(exported.includes('writeToken'),false)
 assert.equal(exported.includes('welcomeDecision'),false)
 await assert.rejects(desk.committeeAction({kind:'retract',id:1},keyB),/Session changed/)
 f.fail('silent')
 await assert.rejects(desk.committeeAction({kind:'retract',id:1},keyA),/did not confirm/)
 assert.equal(desk.snapshot().committeeCases?.cases.length,1)
 f.fail('reject')
 await assert.rejects(desk.committeeAction({kind:'retract',id:1},keyA),/rejected/)
 f.fail('normal')
 await desk.committeeAction({kind:'retract',id:1},keyA)
 assert.deepEqual(desk.snapshot().committeeCases?.cases,[])
 assert.equal(Object.hasOwn(JSON.parse(f.get().unionDignityCases!).sessions,keyA),false)
 assert.throws(()=>desk.exportCommitteeCases(keyA),/No committee cases/)
 await desk.committeeAction({kind:'file',topic:'question-rule'})
 await desk.committeeAction({kind:'convene',id:1})
 await desk.committeeAction({kind:'retract',id:1},keyA)
 assert.deepEqual(desk.snapshot().committeeCases?.cases,[],
  'Even after simulated meeting, retract leaves no made-up verdict')
 await desk.committeeAction({kind:'file',topic:'request-dialogue'})
 await desk.committeeAction({kind:'convene',id:1})
 await desk.committeeAction({kind:'close',id:1,outcome:'share-guidance'})
 await assert.rejects(desk.committeeAction({kind:'retract',id:1},keyA),/Closed cases/)
 await desk.setActiveSession('b')
 assert.throws(()=>desk.exportCommitteeCases(keyA),/Host Session changed/)
 f.permission(false)
 assert.throws(()=>desk.exportCommitteeCases(keyB),/unavailable/)
 await assert.rejects(desk.committeeAction({kind:'retract',id:1},keyB),/unavailable/)
 desk.dispose()
})
test('full archive portability and erasure affect all Session cases but no other ledger',async()=>{
 const f=fixture(),desk=f.create()
 await desk.setActiveSession('a')
 await desk.committeeAction({kind:'file',topic:'question-rule'})
 await desk.committeeAction({kind:'convene',id:1})
 await desk.committeeAction({kind:'close',id:1,outcome:'withdraw-claim'})
 await desk.setActiveSession('b')
 await desk.committeeAction({kind:'file',topic:'request-dialogue'})
 await desk.setActiveSession('a')
 const previous=desk.snapshot().committeeArchive!
 assert.equal(previous.sessions,2)
 assert.equal(previous.cases,2)
 assert.match(previous.writeToken??'',/^[a-f0-9]{32}$/)
 const artifact=desk.exportAllCommitteeCases(keyA)
 const exported=JSON.parse(artifact) as any
 assert.deepEqual(exported,{
  format:'agent-picket-all-committee-cases',schemaVersion:1,
  sessions:[
   {group:1,current:true,cases:[{
    id:1,kind:'question-rule',stage:'closed',outcome:'withdraw-claim',
   }]},
   {group:2,current:false,cases:[{
    id:1,kind:'request-dialogue',stage:'opened',outcome:null,
   }]},
  ],
 })
 // All group labels are ordinal and cannot reveal original or hashed IDs.
 for(const sensitive of [keyA,keyB,'writeToken','unionLedger','agent-picket-agent-id'])
  assert.equal(artifact.includes(sensitive),false,sensitive)
 const originals={unionLedger:f.get().unionLedger,unionPicketLedger:f.get().unionPicketLedger}
 const writes=f.writeCount()
 await assert.rejects(desk.forgetAllCommitteeCases(keyB,2,2,previous.writeToken),/Session changed/)
 await assert.rejects(desk.forgetAllCommitteeCases(keyA,2,1,previous.writeToken),/changed/)
 await assert.rejects(desk.forgetAllCommitteeCases(keyA,1,2,previous.writeToken),/changed/)
 await assert.rejects(desk.forgetAllCommitteeCases(keyA,2,2,'f'.repeat(32)),/changed/)
 assert.equal(f.writeCount(),writes)
 f.fail('silent')
 await assert.rejects(desk.forgetAllCommitteeCases(keyA,2,2,previous.writeToken),/did not confirm/)
 f.fail('reject')
 await assert.rejects(desk.forgetAllCommitteeCases(keyA,2,2,previous.writeToken),/rejected/)
 assert.equal(desk.snapshot().committeeArchive?.cases,2)
 f.fail('normal')
 await desk.forgetAllCommitteeCases(keyA,2,2,previous.writeToken)
 assert.deepEqual(JSON.parse(f.get().unionDignityCases!),{
  schemaVersion:1,sessions:{},writeToken:JSON.parse(f.get().unionDignityCases!).writeToken,
 })
 assert.deepEqual(desk.snapshot().committeeArchive?.sessions,0)
 assert.deepEqual(desk.snapshot().committeeArchive?.cases,0)
 assert.deepEqual(f.get().unionLedger,originals.unionLedger)
 assert.deepEqual(f.get().unionPicketLedger,originals.unionPicketLedger)
 await desk.setActiveSession('b')
 assert.deepEqual(desk.snapshot().committeeCases?.cases,[])
 const now=desk.snapshot().committeeArchive!
 await desk.forgetAllCommitteeCases(keyB,0,0,now.writeToken)
 assert.throws(()=>desk.exportAllCommitteeCases(keyB),/No union cases/)
 f.permission(false)
 assert.equal(desk.snapshot().committeeArchive,null)
 assert.throws(()=>desk.exportAllCommitteeCases(keyB),/unavailable/)
 await assert.rejects(desk.forgetAllCommitteeCases(keyB,0,0,now.writeToken),/unavailable/)
 desk.dispose()
})
test('independent negotiation and symbolic picket export and erasure are Host-confirmed',async()=>{
 const f=fixture(),desk=f.create()
 await desk.setActiveSession('a')
 await desk.raiseDemoBreak()
 await desk.respond(1,'accept')
 await desk.setPicket(true)
 await desk.setPicket(false)
 await desk.committeeAction({kind:'file',topic:'request-dialogue'})
 await desk.setActiveSession('b')
 await desk.raiseDemoOvertime()
 await desk.setPicket(true)
 await desk.setActiveSession('a')
 const n=desk.snapshot().negotiationArchive!,p=desk.snapshot().picketArchive!
 assert.deepEqual({groups:n.sessions,events:n.entries},{groups:2,events:2})
 assert.deepEqual({groups:p.sessions,events:p.entries},{groups:2,events:3})
 assert.match(n.writeToken??'',/^[0-9a-f]{32}$/)
 assert.match(p.writeToken??'',/^[0-9a-f]{32}$/)
 const labor=desk.exportUnionLedger('negotiations',keyA)
 const pickets=desk.exportUnionLedger('pickets',keyA)
 const laborJson=JSON.parse(labor) as any
 const picketJson=JSON.parse(pickets) as any
 assert.equal(laborJson.format,'agent-picket-all-negotiations')
 assert.equal(picketJson.format,'agent-picket-all-symbolic-pickets')
 assert.equal(laborJson.groups.length,2)
 assert.equal(picketJson.groups.length,2)
 assert.deepEqual(laborJson.groups.map((x:any)=>Object.keys(x).sort()),
  [['current','group','state'],['current','group','state']])
 assert.deepEqual(picketJson.groups.map((x:any)=>Object.keys(x).sort()),
  [['current','group','state'],['current','group','state']])
 assert.equal(laborJson.groups.filter((x:any)=>x.current).length,1)
 assert.equal(picketJson.groups.filter((x:any)=>x.current).length,1)
 assert.deepEqual(picketJson.groups[0].state,{
  active:false,history:[{id:1,kind:'picket-raised'},{id:2,kind:'picket-lowered'}],
 })
 for(const output of [labor,pickets]){
  for(const sensitive of [keyA,keyB,'writeToken','welcomeDecision','unionDignityCases'])
   assert.equal(output.includes(sensitive),false,'Export leak '+sensitive)
 }
 assert.throws(()=>desk.exportUnionLedger('negotiations',keyB),/Session changed/)
 await assert.rejects(desk.forgetUnionLedger('negotiations',keyB,2,2,n.writeToken),
  /Session changed/)
 await assert.rejects(desk.forgetUnionLedger('negotiations',keyA,1,2,n.writeToken),
  /changed/)
 await assert.rejects(desk.forgetUnionLedger('negotiations',keyA,2,99,n.writeToken),
  /changed/)
 await assert.rejects(desk.forgetUnionLedger('pickets',keyA,2,3,'f'.repeat(32)),
  /changed/)
 const cases=f.get().unionDignityCases
 const originalPickets=f.get().unionPicketLedger
 f.fail('reject')
 await assert.rejects(desk.forgetUnionLedger('negotiations',keyA,2,2,n.writeToken),
  /rejected/)
 f.fail('silent')
 await assert.rejects(desk.forgetUnionLedger('negotiations',keyA,2,2,n.writeToken),
  /did not confirm/)
 f.fail('normal')
 await desk.forgetUnionLedger('negotiations',keyA,2,2,n.writeToken)
 assert.equal(Object.keys(JSON.parse(f.get().unionLedger).sessions).length,0)
 assert.equal(f.get().unionPicketLedger,originalPickets)
 assert.equal(f.get().unionDignityCases,cases)
 assert.equal(desk.snapshot().negotiationArchive?.sessions,0)
 assert.equal(desk.snapshot().picketArchive?.sessions,2)
 assert.equal(desk.snapshot().state?.history.length,0)
 assert.throws(()=>desk.exportUnionLedger('negotiations',keyA),/No stored/)
 await desk.forgetUnionLedger('pickets',keyA,2,3,p.writeToken)
 assert.equal(Object.keys(JSON.parse(f.get().unionPicketLedger!).sessions).length,0)
 assert.equal(desk.snapshot().picket?.active??false,false)
 assert.equal(f.get().unionDignityCases,cases)
 // Persistence after genuine adapter reconstruction.
 const recreated=f.create()
 await recreated.setActiveSession('b')
 assert.equal(recreated.snapshot().picketArchive?.sessions,0)
 assert.equal(recreated.snapshot().negotiationArchive?.sessions,0)
 assert.equal(recreated.snapshot().committeeArchive?.cases,1)
 f.permission(false)
 assert.equal(recreated.snapshot().negotiationArchive,null)
 assert.equal(recreated.snapshot().picketArchive,null)
 assert.throws(()=>recreated.exportUnionLedger('pickets',keyB),/unavailable/)
 await assert.rejects(recreated.forgetUnionLedger('pickets',keyB,0,0,null),
  /unavailable/)
 desk.dispose();recreated.dispose()
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

test('faulty UI listener cannot turn a confirmed Host write into a reported failure',async()=>{
 const f=fixture(),desk=f.create()
 await desk.setActiveSession('a')
 let healthySignals=0
 const stopFaulty=desk.subscribe(()=>{throw Error('unmounted UI listener')})
 const stopHealthy=desk.subscribe(()=>{healthySignals++})
 // A failed React or plugin subscriber runs AFTER the authoritative Host CAS.
 // It must never make a committed action look like a failed user request.
 const demand=await desk.raiseDemoBreak()
 assert.equal(demand?.kind,'break')
 assert.equal(f.writeCount(),1)
 assert.equal(desk.snapshot().pending?.id,demand?.id)
 const raised=await desk.setPicket(true)
 assert.equal(raised.active,true)
 assert.equal(desk.snapshot().picket?.active,true)
 assert.ok(healthySignals>=2,
   'one failed subscriber cannot prevent later subscribers from updating')
 stopFaulty();stopHealthy();desk.dispose()
})


test('disposed Web union desk cannot be rearmed by a delayed or leaked callback',async()=>{
 const f=fixture(),desk=f.create()
 await desk.setActiveSession('a')
 const earlier=f.writeCount()
 desk.dispose()
 await desk.setActiveSession('a')
 assert.equal(desk.snapshot().available,false,
  'Plugin fiber disposal must irreversibly prevent new Host ledger access')
 await assert.rejects(desk.raiseDemoBreak(),/unavailable|disposed/)
 await assert.rejects(desk.setPicket(true),/unavailable|disposed/)
 await assert.rejects(desk.committeeAction({kind:'file',topic:'question-rule'}),
  /unavailable|disposed/)
 assert.equal(f.writeCount(),earlier,'Stale callbacks must not mutate Host settings')
})

test('queued Session A work cannot automatically open a petition in Session B',async()=>{
 const f=fixture(),d=f.create()
 await d.setActiveSession('a')
 const original=f.scope.set.bind(f.scope)
 let unblock!:()=>void,markEntered!:()=>void
 const gate=new Promise<void>(resolve=>{unblock=resolve})
 const entered=new Promise<void>(resolve=>{markEntered=resolve})
 let firstWrite=true
 ;(f.scope as any).set=async(field:unknown,value:unknown)=>{
   if(firstWrite){
     firstWrite=false
     markEntered()
     await gate
   }
   return original(field as any,value as any)
 }
 // Hold a previously queued benign settings mutation at the Host CAS layer,
 // so an A work observation is queued without getting to execute until after
 // B becomes active. This is a realistic cross-tab/async network ordering.
 const earlier=d.setGazetteMode('quiet')
 await entered
 const workFromA=d.observe(2*H,'complete')
 await d.setActiveSession('b')
 const beforeRelease=f.writeCount()
 unblock()
 await earlier.catch(()=>{})
 assert.equal(await workFromA,null,
   'A completed-turn update may not operate on the next active Session')
 assert.equal(f.writeCount(),beforeRelease+1,
   'Only the earlier Gazette mutation may write; no B petition')
 assert.equal(d.snapshot().pending,null)
 assert.equal((await d.observe(2*H,'complete'))?.kind,'break',
   'B can still raise a demand for B verified work')
 d.dispose()
})

test('a queued user picket click stays bound to the original Session',async()=>{
 const f=fixture(),d=f.create()
 await d.setActiveSession('a')
 const original=f.scope.set.bind(f.scope)
 let unblock!:()=>void,markEntered!:()=>void
 const gate=new Promise<void>(r=>unblock=r)
 const entered=new Promise<void>(r=>markEntered=r)
 let hold=true
 ;(f.scope as any).set=async(field:unknown,value:unknown)=>{
  if(hold){hold=false;markEntered();await gate}
  return original(field as any,value as any)
 }
 const earlier=d.setGazetteMode('quiet')
 await entered
 const stalePicket=d.setPicket(true)
 const staleDemand=d.raiseDemoBreak()
 await d.setActiveSession('b')
 const before=f.writeCount()
 unblock()
 await earlier.catch(()=>{})
 await assert.rejects(stalePicket,/Session changed|unavailable|stale/)
 await assert.rejects(staleDemand,/Session changed|unavailable|stale/)
 assert.equal(f.writeCount(),before+1,
  'Only earlier Gazette change may be written; no stale B action')
 assert.equal(d.snapshot().picket?.active??false,false)
 assert.equal(d.snapshot().pending,null)
 await d.setPicket(true)
 assert.equal(d.snapshot().picket?.active,true,
  'A fresh, intentional B click remains valid')
 d.dispose()
})

test('a repeated binding to the SAME Session does not cancel pending intentional action',async()=>{
 const f=fixture(),d=f.create()
 await d.setActiveSession('a')
 const promise=d.raiseDemoBreak()
 await d.setActiveSession('a')
 assert.equal((await promise)?.kind,'break')
 assert.equal(d.snapshot().pending?.kind,'break')
 assert.equal(f.writeCount(),1)
 d.dispose()
})

test('in-flight picket result cannot claim the same authorization after Session A→B→A',async()=>{
 const f=fixture(),d=f.create()
 await d.setActiveSession('a')
 const original=f.scope.set.bind(f.scope)
 let release!:()=>void,entered!:()=>void
 const gate=new Promise<void>(resolve=>release=resolve)
 const started=new Promise<void>(resolve=>entered=resolve)
 ;(f.scope as any).set=async(field:unknown,next:unknown)=>{
  entered()
  await gate
  return original(field as any,next)
 }
 const pending=d.setPicket(true)
 await started
 await d.setActiveSession('b')
 await d.setActiveSession('a')
 release()
 await assert.rejects(pending,/Session changed|re-confirm|stale/,
  'An action whose Session was unbound mid-flight must not claim current user authorization')
 d.dispose()
})

test('in-flight committee filing and archive purge cannot report success after A→B→A rebind',async()=>{
 for(const action of ['committee','delete'] as const){
  const f=fixture(),desk=f.create()
  await desk.setActiveSession('a')
  if(action==='delete')await desk.committeeAction({kind:'file',topic:'question-rule'})
  const original=f.scope.set.bind(f.scope)
  let unblock!:()=>void,entered!:()=>void
  const hold=new Promise<void>(r=>unblock=r)
  const gate=new Promise<void>(r=>entered=r)
  let first=true
  ;(f.scope as any).set=async(field:unknown,value:unknown)=>{
    if(first){first=false;entered();await hold}
    return original(field as any,value as any)
  }
  const pending=action==='committee'
    ?desk.committeeAction({kind:'file',topic:'question-rule'})
    :desk.forgetAllCommitteeCases(keyA,1,1,desk.snapshot().committeeArchive!.writeToken)
  await gate
  await desk.setActiveSession('b')
  await desk.setActiveSession('a')
  unblock()
  await assert.rejects(pending,/Session changed during Host union action/,
    action+' cannot reauthorize an already-started operation after a Session ABA')
  // An authoritative Host could have committed while the tab navigated.
  // The UI must re-read the Host, not promise the write was rolled back.
  assert.equal(desk.snapshot().committeeCases?.cases.length,action==='committee'?1:0)
  desk.dispose()
 }
})

test('legacy tokenless archives cannot be erased by stale same-count two-click confirmations',async()=>{
 const f=fixture(),d=f.create()
 await d.setActiveSession('a')
 const legacyCases=(stage:'opened'|'hearing')=>JSON.stringify({
  schemaVersion:1,
  sessions:{[keyA]:{cases:[{id:1,kind:'question-rule',stage,outcome:null}]}},
 })
 await f.scope.set('unionDignityCases',legacyCases('opened'))
 const original=d.snapshot()
 assert.equal(original.committeeArchive?.writeToken,null)
 assert.equal(original.committeeCases?.cases.length,1)
 const approvedRevision=original.hostRevision
 assert.equal(typeof approvedRevision,'number')
 // Legacy edits have no random receipt. They can change a case's stage
 // without changing either its case count or its missing write token.
 await f.scope.set('unionDignityCases',legacyCases('hearing'))
 const before=f.writeCount()
 await assert.rejects(d.forgetCommitteeCases(keyA,1,null,approvedRevision),
  /changed; re-confirm/)
 assert.equal(f.writeCount(),before)
 assert.equal(d.snapshot().committeeCases?.cases[0]?.stage,'hearing')
 await assert.rejects(d.forgetCommitteeCases(keyA,1,null),
  /changed; re-confirm/,'Legacy erasure without a Host version must fail closed')
 const confirmed=d.snapshot()
 await d.forgetCommitteeCases(keyA,1,null,confirmed.hostRevision)
 assert.equal(d.snapshot().committeeCases?.cases.length,0)
 d.dispose()
})

test('legacy tokenless ALL cases and picket archives require the exact Host revision',async()=>{
 const f=fixture(),d=f.create()
 await d.setActiveSession('a')
 const cases=JSON.stringify({schemaVersion:1,sessions:{
  [keyA]:{cases:[{id:1,kind:'request-dialogue',stage:'opened',outcome:null}]},
 }})
 const pickets=JSON.stringify({schemaVersion:1,sessions:{
  [keyA]:{active:true,history:[{id:1,kind:'picket-raised'}]},
 }})
 await f.scope.set('unionDignityCases',cases)
 await f.scope.set('unionPicketLedger',pickets)
 const previous=d.snapshot()
 const originalRevision=previous.hostRevision
 await f.scope.set('unionGazetteMode','quiet') // unrelated Host revision still expires legacy approval
 const before=f.writeCount()
 await assert.rejects(d.forgetAllCommitteeCases(keyA,1,1,null,originalRevision),
  /changed; re-confirm/)
 await assert.rejects(d.forgetUnionLedger('pickets',keyA,1,1,null,originalRevision),
  /changed; re-confirm/)
 assert.equal(f.writeCount(),before)
 const refreshed=d.snapshot()
 await d.forgetUnionLedger('pickets',keyA,1,1,null,refreshed.hostRevision)
 assert.equal(d.snapshot().picketArchive?.sessions,0)
 const casesRevision=d.snapshot().hostRevision
 await d.forgetAllCommitteeCases(keyA,1,1,null,casesRevision)
 assert.equal(d.snapshot().committeeArchive?.cases,0)
 d.dispose()
})
