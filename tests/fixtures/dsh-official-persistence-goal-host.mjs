/**
 * Isolated P0 feasibility fixture. Published DSH Host only, offline LLM.
 * Deliberately NOT production enforcement: synthetic history & test authority.
 * Its sole purpose is checking real persistence -> goal pre-step -> Host CAS.
 */
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const name='agent-picket-dsh-official-work-host-probe'
export const inject=['llm','goals','agents','sessionPersistence']

const moduleRoot=process.env.AGENT_PICKET_DSH_HOST
if(!moduleRoot)throw Error('Isolated official Host installation required')
const { LlmAdapter }=await import(pathToFileURL(join(moduleRoot,'@deepseek-ai/dsh-llm/lib/index.js')).href)
const { SessionId, SessionSeq, SESSION_FORMAT_VERSION }=
  await import(pathToFileURL(join(moduleRoot,'@deepseek-ai/dsh-session/lib/index.js')).href)
const marker=(message)=>{
  if(process.env.AGENT_PICKET_NATIVE_GOAL_LOG)
    appendFileSync(process.env.AGENT_PICKET_NATIVE_GOAL_LOG,message+'\n')
}
class OfflineModel extends LlmAdapter {
  async resolveModel(provider,model){
    return {provider,id:model,name:model,contextWindow:32768,defaultMaxTokens:100}
  }
  async *stream(){
    marker('model-call')
    yield {type:'block-start',index:0,blockType:'text'}
    yield {type:'text-delta',index:0,text:'OFFLINE_OK'}
    yield {type:'block-end',index:0,block:{type:'text',text:'OFFLINE_OK'}}
    yield {type:'finish',reason:{kind:'stop'}}
  }
}
async function insertPriorCompletedTurn(persistence,hours,createdAt){
  const id=SessionId('picket-persisted-synthetic-prior')
  const endAt=createdAt-5000
  const from=endAt-hours*3_600_000
  const h=await persistence.create({id,createdAt:from,version:SESSION_FORMAT_VERSION,
    isSeeded:false})
  try{
    await h.append([
      {type:'turn/start',seq:SessionSeq(0),time:from,data:{turn:1}},
      {type:'turn/end',seq:SessionSeq(1),time:endAt,data:{turn:1,reason:{kind:'completed'}}},
    ])
    await h.flush()
  }finally{await h.close()}
}
/** Conservative only-completed count. No raw prompt, source id or attachment returned. */
async function readOfficialCompletedWork(persistence,now){
  try{
    const snapshots=await persistence.list()
    if(!Array.isArray(snapshots)||snapshots.length===0||snapshots.length>100)return null
    const day=new Date(now).toISOString().slice(0,10)
    let sum=0,read=0
    const seen=new Set()
    for(const snap of snapshots){
      const id=snap?.header?.id
      if(typeof id!=='string'||!id||seen.has(id))return null
      seen.add(id)
      const h=await persistence.open(id,'read')
      try{
        if(h.header.id!==id||!Number.isSafeInteger(h.inheritedEventCount)||
          h.inheritedEventCount<0||(!h.header.isSeeded&&h.inheritedEventCount!==0))
          return null
        let seq=h.inheritedEventCount
        let opened=null
        while(true){
          if(read>=10000)return null
          const batch=(await h.read(seq,128)).events
          if(!Array.isArray(batch)||batch.length>128)return null
          if(batch.length===0)break
          for(const event of batch){
            if(event.seq!==seq++||!Number.isSafeInteger(event.time)||
              event.time<0||event.time>now)return null
            read++
            if(event.type==='turn/start'){
              if(opened)return null
              opened={turn:event.data.turn,time:event.time}
            }
            if(event.type==='turn/end'){
              if(!opened||opened.turn!==event.data.turn||event.time<opened.time)return null
              if(event.data.reason.kind==='completed'&&
                new Date(event.time).toISOString().slice(0,10)===day)
                sum+=event.time-opened.time
              opened=null
            }
          }
        }
      }finally{await h.close()}
    }
    return Number.isSafeInteger(sum)?sum:null
  }catch{return null}
}
export function apply(ctx){
  marker('fixture-loaded')
  const persistence=ctx.get('sessionPersistence')
  marker('inject-sessionPersistence:'+String(!!persistence))
  marker('inject-goals:'+String(!!ctx.goals))
  if(!persistence||!ctx.goals)throw Error('Host services missing')
  ctx.llm.registerAdapter(['picket-offline-persisted'],new OfflineModel())
  const hours=Number(process.env.AGENT_PICKET_NATIVE_GOAL_HOURS)
  const enabled=process.env.AGENT_PICKET_NATIVE_GOAL_CONSENT==='yes'
  if(![7,8].includes(hours))throw Error('Only isolated seven/eight hour fixture is supported')
  const activated=new Set()
  ctx.on('agent/pre-step',async({agent,messages},next)=>{
    const human=messages.some(m=>m.source?.kind==='user' &&
      m.content?.some(b=>b.type==='text'&&b.text==='START_OFFLINE_GOAL'))
    if(human&&!activated.has(agent.session.id)){
      activated.add(agent.session.id)
      await insertPriorCompletedTurn(persistence,hours,Date.now())
      const goal=ctx.goals.create(agent,{objective:'Synthetic offline Goal',maxGoalRounds:3})
      marker('created:'+goal.phase)
    }
    // ONLY an exclusively auto-generated Goal prompt may be rejected; do not
    // drop a mixed batch, a human user message or any attachment.
    const auto=messages.length===1?messages[0]:null
    if(auto?.source?.kind==='goal'&&Number.isSafeInteger(auto.source.round)
      &&auto.source.round>0){
      const work=await readOfficialCompletedWork(persistence,Date.now())
      marker('durable-work:'+String(work))
      if(enabled&&work!==null&&work>=8*3_600_000){
        const goal=ctx.goals.get(agent)
        if(goal?.phase==='active'&&goal.activation==='armed'&&
          auto.source.goalId===goal.id&&auto.source.revision===goal.revision){
          const block=ctx.goals.block(agent,{id:goal.id,revision:goal.revision},{
            code:'picket-work-limit',
            message:'Offline synthetic Agent Picket work limit; resume manually.',
          })
          marker('block:'+block.phase+':'+block.activation+
            ':revision-plus-one='+String(block.revision===goal.revision+1))
          // This is the official pre-step reject of an AUTONOMOUS round only.
          // Do not copy, replay, or mutate user input.
          return {kind:'reject'}
        }
      }
    }
    return next()
  })
  ctx.on('session/event',(_session,event)=>{
    if(event.type==='turn/end')marker('turn-end:'+event.data.reason.kind)
    if(event.type==='goal/change'&&event.data?.operation==='block'&&
      event.data.goal?.blockedReason?.code==='picket-work-limit')
      marker('official-goal-change:block')
  })
}
