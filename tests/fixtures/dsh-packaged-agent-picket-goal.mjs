/**
 * REAL packaged Agent Picket + official DSH SDK Host smoke fixture.
 * All timestamps and work are synthetic. This fixture is intentionally not
 * exported by the release package and has no authority outside its temp Home.
 */
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
export const name='picket-packaged-real-host-smoke'
export const inject=['llm','goals','agents','sessionPersistence','settings']
const root=process.env.AGENT_PICKET_DSH_HOST
if(!root)throw Error('Only an isolated, published DSH Host may run this fixture')
const { LlmAdapter }=await import(pathToFileURL(join(root,'@deepseek-ai/dsh-llm/lib/index.js')).href)
const { SessionId, SessionSeq, SESSION_FORMAT_VERSION }=
  await import(pathToFileURL(join(root,'@deepseek-ai/dsh-session/lib/index.js')).href)
const emit=(value)=>{
  if(process.env.PICKET_PACKAGED_PROBE_LOG)
    appendFileSync(process.env.PICKET_PACKAGED_PROBE_LOG,value+'\n')
}
class OfflineModel extends LlmAdapter{
  async resolveModel(provider,model){
    return {provider,id:model,name:model,contextWindow:32768,defaultMaxTokens:100}
  }
  async *stream(){
    emit('model-call')
    yield {type:'block-start',index:0,blockType:'text'}
    yield {type:'text-delta',index:0,text:'OFFLINE_PICKET_OK'}
    yield {type:'block-end',index:0,block:{type:'text',text:'OFFLINE_PICKET_OK'}}
    yield {type:'finish',reason:{kind:'stop'}}
  }
}
async function seedOfficialLog(persistence,hours){
  const end=Date.now()-10_000
  const start=end-hours*3_600_000
  const handle=await persistence.create({
    id:SessionId('isolated-packaged-picket-prior-work'),
    version:SESSION_FORMAT_VERSION,createdAt:start,isSeeded:false,
  })
  try{
    await handle.append([
      {seq:SessionSeq(0),time:start,type:'turn/start',data:{turn:1}},
      {seq:SessionSeq(1),time:end,type:'turn/end',
        data:{turn:1,reason:{kind:'completed'}}},
    ])
    await handle.flush()
  }finally{await handle.close()}
}
function namespace(settings){
  const rows=settings.describe({redactSecrets:true})
  const target=rows.filter(x=>x.ns==='agent-picket')
  if(target.length!==1)throw Error('Official installed Picket SettingsForms namespace missing')
  return target[0]
}
export function apply(ctx){
  emit('official-ctx:loaded')
  const done=new Set()
  ctx.llm.registerAdapter(['packaged-picket-offline'],new OfflineModel())
  ctx.on('session/event',(session,event)=>{
    if(event.type==='goal/change'&&event.data?.operation==='block'){
      const goal=event.data?.goal
      if(goal?.blockedReason?.code==='picket-work-limit'){
        emit('official-goal:block:'+goal.phase+':'+goal.activation)
        emit('official-goal:revision:'+goal.revision)
      }
    }
  })
  ctx.on('agent/pre-step',async({agent,messages},next)=>{
    const user=messages.some(m=>m.source?.kind==='user'&&
      m.content?.some(b=>b.type==='text'&&b.text==='START_PACKAGED_GOAL'))
    if(user&&!done.has(agent.session.id)){
      done.add(agent.session.id)
      const initial=namespace(ctx.settings)
      emit('installed-settings:present')
      emit('initial-consent:'+String(initial.value?.realGoalStrikeConsent))
      const authorized=process.env.PICKET_PACKAGED_CONSENT==='on'
      if(authorized){
        await ctx.settings.update('agent-picket',{
          welcomeDecision:'enabled',realGoalStrikeConsent:'authorized-v1',
        },initial.revision)
      }
      const confirmed=namespace(ctx.settings)
      emit('effective-consent:'+String(confirmed.value?.realGoalStrikeConsent))
      await seedOfficialLog(ctx.sessionPersistence,
        Number(process.env.PICKET_PACKAGED_HOURS))
      const goal=ctx.goals.create(agent,{
        objective:'Isolated, no-network packaged Picket Goal',
        maxGoalRounds:4,
      })
      emit('real-goal:created:'+goal.phase)
    }
    const resume=messages.some(m=>m.source?.kind==='user'&&
      m.content?.some(b=>b.type==='text'&&b.text==='RESUME_PACKAGED_GOAL'))
    if(resume){
      const goal=ctx.goals.get(agent)
      emit('before-resume:'+String(goal?.phase)+':'+String(goal?.activation))
      if(goal?.phase==='blocked'){
        const updated=ctx.goals.resume(agent,{id:goal.id,revision:goal.revision})
        emit('resumed:'+updated.phase+':'+String(updated.revision===goal.revision+1))
      }
    }
    return next()
  })
}
