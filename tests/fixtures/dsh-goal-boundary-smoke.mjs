import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {registerDshGoalWorkEnforcement,alreadyBlockedGoalToday} from '../../src/adapters/dsh/goal-work-enforcement.ts'

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
export function apply(ctx){
 ctx.llm.registerAdapter(['picket-goal-offline'],new OfflineModel())
 ctx.on('agent/pre-step',({agent,messages},next)=>{
  const text=messages.flatMap(x=>x.content??[]).map(x=>x.text??'').join(' ')
  if(text.includes('START_GOAL_PROBE')&&!created){
   created=true
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
   consent:()=>({kind:'agent-picket-real-goal-strike-v1',hostAuthenticated:true,enabled:true}),
   todayWork:()=>8*3_600_000,
   onResult:result=>record('strike-result:'+result),
 })
 record('fixture-loaded')
}
