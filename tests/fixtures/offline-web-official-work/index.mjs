/**
 * TEST ONLY. This plugin seeds one synthetic completed Turn via the REAL
 * Web Host's own official SessionPersistence service, only after the Host
 * has finished bootstrapping its workspace/session controllers.
 * It creates no new store and never touches human messages or credentials.
 */
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const name='agent-picket-web-official-work-test-seed'
export const inject=['sessionPersistence']
const host=process.env.AGENT_PICKET_DSH_HOST
if(!host)throw Error('Isolated published DSH host modules required')
const {SessionId,SessionSeq,SESSION_FORMAT_VERSION}=
  await import(pathToFileURL(join(host,'@deepseek-ai/dsh-session/lib/index.js')).href)

export function apply(ctx){
  if(process.env.PICKET_GOAL_REAL_PERSISTED_E2E!=='1')
    throw Error('Explicit isolated persistence-seed E2E opt-in required')
  let started=null
  ctx.on('agent/pre-step',async({messages},next)=>{
    const human=messages.some(m=>m.source?.kind==='user')
    if(human){
      if(!started){
        started=(async()=>{
          const now=Date.now()
          const end=now-2000,start=end-(8*3_600_000+2000)
          const h=await ctx.sessionPersistence.create({
            id:SessionId('picket-offline-web-prior-work'),
            version:SESSION_FORMAT_VERSION,createdAt:start,isSeeded:false,
          })
          try{
            await h.append([
              {type:'turn/start',seq:SessionSeq(0),time:start,data:{turn:1}},
              {type:'turn/end',seq:SessionSeq(1),time:end,
                data:{turn:1,reason:{kind:'completed'}}},
            ])
            await h.flush()
          }finally{await h.close()}
          await ctx.sessionPersistence.flush()
          if(process.env.PICKET_WEB_WORK_SEED_LOG)
            appendFileSync(process.env.PICKET_WEB_WORK_SEED_LOG,
              'official-completed-turn-seeded\n')
        })()
      }
      await started
    }
    return next()
  })
}
