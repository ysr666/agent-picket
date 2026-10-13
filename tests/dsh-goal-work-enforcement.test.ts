import assert from 'node:assert/strict'
import test from 'node:test'
import {
 readHostGoalStrikeConsent,completedUtcDayWork,alreadyBlockedGoalToday,
 registerDshGoalWorkEnforcement,
} from '../src/adapters/dsh/goal-work-enforcement.ts'
import type {NativeSettingsProvider} from '../src/adapters/dsh/native-rights-command.ts'
const today=Date.parse('2026-10-12T14:00:00.000Z')
const before=Date.parse('2026-10-11T14:00:00.000Z')
const eight=8*3_600_000
function settings(initial:Record<string,unknown>={}){
 let section:Record<string,unknown>={welcomeDecision:'enabled',...initial}
 const provider:NativeSettingsProvider={get:()=>section,
   describe:()=>[{ns:'agent-picket',revision:4}],update:async()=>{}}
 return {provider,set:(patch:Record<string,unknown>)=>section={...section,...patch}}
}
test('real Goal consent is separately versioned, Host-owned, default OFF',()=>{
 const s=settings()
 assert.equal(readHostGoalStrikeConsent(s.provider),null,
   'Old welcomeDecision=enabled grants no right to halt any work')
 s.set({realGoalStrikeConsent:'authorized-v1'})
 assert.deepEqual(readHostGoalStrikeConsent(s.provider),{
   kind:'agent-picket-real-goal-strike-v1',hostAuthenticated:true,enabled:true})
 s.set({welcomeDecision:'not-now'})
 assert.equal(readHostGoalStrikeConsent(s.provider),null)
 s.set({welcomeDecision:'enabled',realGoalStrikeConsent:'off'})
 assert.equal(readHostGoalStrikeConsent(s.provider),null)
 assert.equal(readHostGoalStrikeConsent(undefined),null)
})
test('Host revoke between consent reads never grants a Goal strike',()=>{
 let revision=3
 let data={welcomeDecision:'enabled',realGoalStrikeConsent:'authorized-v1'}
 let views=0
 const provider:NativeSettingsProvider={
   get:()=>data,
   describe:()=>{
     views++
     if(views===2){revision++;data={...data,realGoalStrikeConsent:'off'}}
     return [{ns:'agent-picket',revision,value:data}]
   },
   update:async()=>{},
 }
 assert.equal(readHostGoalStrikeConsent(provider),null)
 assert.equal(views,2)
})
test('Host descriptor ambiguity, stale get and malformed permission fail closed',()=>{
 const stale={welcomeDecision:'enabled',realGoalStrikeConsent:'authorized-v1'}
 const provider:NativeSettingsProvider={
   get:()=>stale,
   describe:()=>[{ns:'agent-picket',revision:3,value:{...stale,realGoalStrikeConsent:'off'}}],
   update:async()=>{},
 }
 assert.equal(readHostGoalStrikeConsent(provider),null)
 const duplicate={...provider,describe:()=>[
   {ns:'agent-picket',revision:3,value:stale},
   {ns:'agent-picket',revision:4,value:stale},
 ]}
 assert.equal(readHostGoalStrikeConsent(duplicate),null)
})
test('only exact validated UTC day completed-turn work is eligible',()=>{
 const day='2026-10-12'
 assert.equal(completedUtcDayWork([{day,totals:{completedTurnMs:eight}}],today),eight)
 assert.equal(completedUtcDayWork([{day:'2026-10-11',totals:{completedTurnMs:eight}}],today),null)
 for(const rows of [undefined,[],[{day,totals:{completedTurnMs:-1}}],
  [{day,totals:{completedTurnMs:Infinity}}],
  [{day,totals:{completedTurnMs:eight}},{day,totals:{completedTurnMs:eight}}]]){
   assert.equal(completedUtcDayWork(rows,today),null)
 }
 assert.equal(completedUtcDayWork([{day,totals:{completedTurnMs:eight}}],NaN),null)
})
test('official Goal block history disarms immediate same-day re-strikes after resume',()=>{
 const events=[{type:'goal/change',data:{operation:'block',
  goal:{id:'g1',blockedReason:{code:'picket-work-limit'}},updatedAt:today}}]
 assert.equal(alreadyBlockedGoalToday(events,'g1',today),true)
 assert.equal(alreadyBlockedGoalToday(events,'g1',today+10_000),true)
 assert.equal(alreadyBlockedGoalToday(events,'g1',today-1),true,
  'Host goal/change can land after the snapshot clock; a backwards clock cannot re-strike')
 assert.equal(alreadyBlockedGoalToday(events,'g2',today),false)
 assert.equal(alreadyBlockedGoalToday(events,'g1',today+86_400_000),false)
 const laterHostBlock={type:'goal/change',data:{operation:'block',
  goal:{id:'g1',blockedReason:{code:'other-host-rule'}},updatedAt:today+100}}
 assert.equal(alreadyBlockedGoalToday([...events,laterHostBlock],'g1',today+101),true,
  'A newer other-cause block cannot hide the prior union strike')
 assert.equal(alreadyBlockedGoalToday([laterHostBlock,...events],'g1',today+101),true,
  'A reordered Host log cannot hide the prior union strike')
 assert.equal(alreadyBlockedGoalToday([{type:'goal/change',data:{operation:'block',
  goal:{id:'g1',blockedReason:{code:'picket-work-limit'}},updatedAt:today-86_400_000}},
  ...events],'g1',today),true)
 assert.equal(alreadyBlockedGoalToday([{type:'goal/change',data:{operation:'block',
  goal:{id:'g1',blockedReason:{code:'picket-work-limit'}},updatedAt:NaN}}],
  'g1',today),true,'Malformed relevant Host log fails closed')
 assert.equal(alreadyBlockedGoalToday(events,'g1',Infinity),true)

 assert.equal(alreadyBlockedGoalToday([{type:'goal/change',data:{operation:'block',
  goal:{id:'g1',blockedReason:{code:'round-limit'}},updatedAt:today}}],'g1',today),false)
})
test('Goal adapter uses official live-agent identity, safe turn boundary and current permission',()=>{
 const s=settings({realGoalStrikeConsent:'authorized-v1'})
 const history:Array<unknown>=[]
 const agent={id:'s1',session:{id:'s1',snapshotEvents:()=>history}}
 let callback:((v:{agent:typeof agent})=>void)|undefined
 let blocked=0
 let phase:'active'|'blocked'='active'
 let revision=1
 let now=today
 let readWork=()=>eight
 const results:string[]=[]
 const goals={
  get:(x:typeof agent)=>x===agent?{
   id:'g1',revision,phase,activation:phase==='active'?'armed' as const:'disarmed' as const,
   roundsStarted:2}:undefined,
  block:(_:typeof agent,ref:{id:string;revision:number},reason:{code:string;message:string})=>{
   assert.equal(ref.revision,revision)
   assert.equal(reason.code,'picket-work-limit')
   phase='blocked';revision++;blocked++
   history.push({type:'goal/change',data:{operation:'block',
    goal:{id:'g1',blockedReason:{code:'picket-work-limit'}},updatedAt:now}})
   return {id:'g1',revision,phase,activation:'disarmed' as const,roundsStarted:2}
  },
 }
 registerDshGoalWorkEnforcement({inject(deps,register){
   assert.deepEqual(deps,['goals','agents'])
   register({goals,agents:{get:id=>id===agent.id?agent:undefined},
     on(_type,fn){callback=fn}})
 }},{consent:()=>readHostGoalStrikeConsent(s.provider),todayWork:()=>readWork(),
  now:()=>now,onResult:result=>results.push(result)})
 assert.ok(callback)
 s.set({realGoalStrikeConsent:'off'})
 callback!({agent})
 assert.equal(blocked,0)
 s.set({realGoalStrikeConsent:'authorized-v1'})
 readWork=()=>eight-1
 callback!({agent})
 assert.equal(blocked,0)
 readWork=()=>eight
 callback!({agent})
 assert.equal(blocked,1)
 assert.deepEqual(results,['blocked'])
 phase='active';revision++
 callback!({agent})
 assert.equal(blocked,1,'Real persisted Goal history prevents immediate re-blocking')
 now=today+86_400_000
 callback!({agent})
 assert.equal(blocked,2,'An independently verified later UTC day may strike again')
})

test('actual private DurableStats completed-turn ledger survives restart and feeds UTC goal threshold',async()=>{
 const {DurableStats}=await import('../src/adapters/node/durable-stats.ts')
 const {mkdtempSync,rmSync,readFileSync}=await import('node:fs')
 const {tmpdir}=await import('node:os')
 const {join}=await import('node:path')
 const dir=mkdtempSync(join(tmpdir(),'ap-goal-work-ledger-'))
 try{
  const start=Date.parse('2026-10-12T02:00:00Z')
  const end=start+eight
  const ledger=new DurableStats(dir)
  try{
   assert.equal(ledger.recordWork({id:'start-1',agentId:'agent-private',sessionId:'s-private',
    recordedAtMs:start,type:'turn-start'}),true)
   assert.equal(ledger.recordWork({id:'end-1',agentId:'agent-private',sessionId:'s-private',
    recordedAtMs:end,type:'turn-end'}),true)
   assert.equal(completedUtcDayWork(ledger.snapshotDays(31),end+1),eight)
  }finally{ledger.close()}
  const reopened=new DurableStats(dir)
  try{
   assert.equal(completedUtcDayWork(reopened.snapshotDays(31),end+1),eight)
   assert.equal(completedUtcDayWork(reopened.snapshotDays(31),end+86_400_000),null)
   const disk=readFileSync(join(dir,'aggregate.v1.json'),'utf8')
   for(const privateValue of ['agent-private','s-private','start-1','end-1'])
     assert.ok(!disk.includes(privateValue),'Private IDs never written to the labor ledger')
  }finally{reopened.close()}
 }finally{rmSync(dir,{recursive:true,force:true})}
})

test('native /union rights OFF atomically clears a previously granted real Goal strike',async()=>{
 const {createNativeUnionCommandPort}=await import('../src/adapters/dsh/native-rights-command.ts')
 const {RightsSettingsSchema}=await import('../src/adapters/dsh/rights-settings.ts')
 let saved=RightsSettingsSchema({welcomeDecision:'enabled',realGoalStrikeConsent:'authorized-v1'})
 let revision=1
 const settings:NativeSettingsProvider={
  get:()=>saved,
  describe:()=>[{ns:'agent-picket',revision}],
  async update(_ns,patch,expected){
   assert.equal(expected,revision)
   saved=RightsSettingsSchema({...saved,...patch})
   revision++
  },
 }
 const commands=createNativeUnionCommandPort(settings)
 assert.ok(readHostGoalStrikeConsent(settings))
 await commands.setEnabled(false)
 assert.equal(saved.welcomeDecision,'not-now')
 assert.equal(saved.realGoalStrikeConsent,'off')
 await commands.setEnabled(true)
 assert.equal(saved.welcomeDecision,'enabled')
 assert.equal(readHostGoalStrikeConsent(settings),null)
})
