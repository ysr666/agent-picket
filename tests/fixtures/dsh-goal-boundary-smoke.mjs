import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {registerDshGoalWorkEnforcement,alreadyBlockedGoalToday,completedUtcDayWork,readHostGoalStrikeConsent} from '../../src/adapters/dsh/goal-work-enforcement.ts'
import {DurableStats} from '../../src/adapters/node/durable-stats.ts'

export const name='picket-goal-boundary-isolated-smoke'
export const inject=['llm','goals','agents']
const root=process.env.AGENT_PICKET_DSH_HOST
if(!root)throw Error('Only run in an isolated DSH installation')
const {LlmAdapter}=await import(pathToFileURL(join(root,'@deepseek-ai/dsh-llm/lib/index.js')).href)
const record=value=>{if(process.env.AGENT_PICKET_PROBE_LOG)appendFileSync(process.env.AGENT_PICKET_PROBE_LOG,value+'\n')}
class OfflineModel extends LlmAdapter {
 async resolveModel(provider,model){return {provider,id:model,name:model,contextWindow:32768,defaultMaxTokens:100}}
 async *stream(){
  record('model-call')
  yield {type:'block-start',index:0,blockType:'text'}
  yield {type:'text-delta',index:0,text:'GOAL_BOUNDARY_OFFLINE_OK'}
  yield {type:'block-end',index:0,block:{type:'text',text:'GOAL_BOUNDARY_OFFLINE_OK'}}
  yield {type:'finish',reason:{kind:'stop'}}
 }
}
let created=false
let restoredHandle
const ledgerMode=process.env.AGENT_PICKET_LEDGER_E2E==='1'
const justBelow=process.env.AGENT_PICKET_LEDGER_BELOW==='1'
export function apply(ctx){
 const dayStart=Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00.000Z')
 const syntheticNow=Math.max(Date.now(),dayStart+8*3_600_000+1)
 const stats=ledgerMode?new DurableStats(join(process.env.DSH_HOME,'picket-ledger-test')):null
 ctx.effect?.(()=>()=>stats?.close())
 const rights={welcomeDecision:'enabled',realGoalStrikeConsent:'authorized-v1'}
 const settings={get:()=>rights,describe:()=>[{ns:'agent-picket',revision:1,value:rights}]}

 ctx.llm.registerAdapter(['picket-goal-offline'],new OfflineModel())
 ctx.on('agent/pre-step',async ({agent,messages},next)=>{
  const text=messages.flatMap(x=>x.content??[]).map(x=>x.text??'').join(' ')
  if(text.includes('ATTACH_RESTORED_GOAL_PROBE')){
   try {
    restoredHandle=await ctx.agents.resume({
     resumeSessionId:'picket-goal-native-session',
     agentOptions:{provider:'picket-goal-offline',model:'offline-test'},
    })
    const restored=ctx.goals.get(restoredHandle.agent)
    record('agent-reattached:'+String(restored?.phase??'none'))
    record('agent-restored-rounds:'+String(restored?.roundsStarted??-1))
    record('agent-restored-block-history:'+alreadyBlockedGoalToday(
      restoredHandle.agent.session.snapshotEvents(),restored?.id??'',Date.now()))
   }catch(error){
    record('agent-reattach-error:'+String(error?.message??error))
   }
  }
  if(text.includes('RESUME_RESTORED_GOAL_PROBE')){
   const original=restoredHandle?.agent
   const prior=original&&ctx.goals.get(original)
   if(prior?.phase==='blocked'){
    const after=ctx.goals.resume(original,{id:prior.id,revision:prior.revision})
    record('goal-resumed:'+after.phase)
   }else record('goal-restored-not-blocked')
  }
  if(text.includes('START_GOAL_PROBE')&&!created){
   created=true
   if(stats){
    const info={agentId:'synthetic-prior-work',sessionId:'synthetic-shift'}
    stats.recordWork({...info,id:'test-ledger-start',type:'turn-start',recordedAtMs:dayStart})
    stats.recordWork({...info,id:'test-ledger-end',type:'turn-end',recordedAtMs:dayStart+8*3_600_000-(justBelow?1:0)})
    record('durable-ledger-work:'+completedUtcDayWork(stats.snapshotDays(31),syntheticNow))
   }
   const goal=ctx.goals.create(agent,{objective:'Synthetic native Goal boundary round test',maxGoalRounds:5})
   record('goal-created:'+goal.phase)
  }
  if(text.includes('RESUME_GOAL_PROBE')){
   const goal=ctx.goals.get(agent)
   const history=agent.session.snapshotEvents()
   const verified=goal?.id?alreadyBlockedGoalToday(history,goal.id,Date.now()):false
   record('host-persisted-union-block:'+verified)
   const matching=history.filter(row=>row.type==='goal/change'
     &&row.data?.operation==='block'&&row.data?.goal?.id===goal?.id)
   record('goal-block-event-count:'+matching.length)
   record('goal-block-meta-valid:'+matching.some(row=>
     row.data.kind==='goal/change'&&Number.isSafeInteger(row.data.updatedAt)
     &&row.data.goal.blockedReason?.code==='picket-work-limit'))

   if(goal?.phase==='blocked'){
    const updated=ctx.goals.resume(agent,{id:goal.id,revision:goal.revision})
    record('goal-resumed:'+updated.phase)
   }
  }
  return next()
 })
 ctx.on('session/event',(session,event)=>{
  if(event.type==='turn/end')record('turn-end:'+event.data.reason.kind)
 })
 ctx.on('agent/turn-stopping',({agent})=>{
  const goal=ctx.goals.get(agent)
  record('goal-rounds:'+String(goal?.roundsStarted??'none'))
 })
 // Isolated test-only consent & synthetic work readings. Crucially, use the
 // EXACT same production registration code with official Host Goal service.
 registerDshGoalWorkEnforcement(ctx,{
   consent:()=>ledgerMode?readHostGoalStrikeConsent(settings)
    :({kind:'agent-picket-real-goal-strike-v1',hostAuthenticated:true,enabled:true}),
   todayWork:now=>stats?completedUtcDayWork(stats.snapshotDays(31),now):8*3_600_000,
   now:()=>ledgerMode?syntheticNow:Date.now(),
   onResult:result=>record('strike-result:'+result),
 })
 record('fixture-loaded')
}
