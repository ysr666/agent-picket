import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { blockAutonomousGoalAtTurnStopping } from '../../src/adapters/dsh/goal-boundary-strike.ts'

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
let created=false,blockedOnce=false
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
  if(!blockedOnce&&goal?.roundsStarted>=1){
   // Test fixture alone supplies simulated accumulated work and consent.
   // Uses REAL DSH GoalService and actual AgentLoop turn-stopping event.
   const result=blockAutonomousGoalAtTurnStopping({
    consent:{kind:'agent-picket-real-goal-strike-v1',hostAuthenticated:true,enabled:true},
    event:{type:'agent/turn-stopping',reason:'settling',sessionId:agent.session.id},
    agent,agentSessionId:agent.session.id,
    work:{coverage:'complete',completedTurnMs:60_000,resumeFloorMs:0,thresholdMs:60_000},
    goals:{
      get(a){return ctx.goals.get(a)},
      block(a,ref,reason){
        try {
          const value=ctx.goals.block(a,ref,reason)
          record('host-block-return:'+JSON.stringify({phase:value.phase,revision:value.revision,activation:value.activation}))
          return value
        }catch(error){
          record('host-block-error:'+String(error?.code??'unknown')+':'+String(error?.message??error))
          throw error
        }
      },
    },
   })
   record('strike-result:'+result.state)
   if(result.state==='blocked')blockedOnce=true
  }
 })
 record('fixture-loaded')
}
