/**
 * TEST ONLY. This plugin seeds one synthetic completed Turn via the REAL
 * Web Host's own official SessionPersistence service, only after the Host
 * has finished bootstrapping its workspace/session controllers.
 * It creates no new store and never touches human messages or credentials.
 */
import { appendFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const name='agent-picket-web-official-work-test-seed'
export const inject=['sessionPersistence','attachments']
const host=process.env.AGENT_PICKET_DSH_HOST
if(!host)throw Error('Isolated published DSH host modules required')
const {SessionId,SessionSeq,SESSION_FORMAT_VERSION}=
  await import(pathToFileURL(join(host,'@deepseek-ai/dsh-session/lib/index.js')).href)

export function apply(ctx){
  if(process.env.PICKET_GOAL_REAL_PERSISTED_E2E!=='1')
    throw Error('Explicit isolated persistence-seed E2E opt-in required')
  let started=null
  ctx.on('agent/pre-step',async({agent,messages},next)=>{
    const human=messages.some(m=>m.source?.kind==='user')
    const byteCheck=messages.some(m=>m.source?.kind==='user'&&
      m.content?.some(b=>b.type==='text'&&b.text==='VERIFY_DURABLE_FILE_BYTES'))
    if(byteCheck){
      const original=agent.session.snapshotEvents().filter(e=>
        e.type==='user/message'&&
        e.data?.source?.rpcId==='picket-synthetic-file-during-strike-001')
      if(original.length!==1)throw Error('Exactly one durable synthetic message is required')
      const content=original[0].data?.content??[]
      const refs=content.filter(x=>x.type==='file')
      if(refs.length!==1)throw Error('The stored synthetic user message needs exactly one file')
      const ref=refs[0].attachment
      if(!ref)throw Error('Persisted file reference absent')
      const digest=createHash('sha256')
      let size=0
      for await (const chunk of ctx.attachments.readFileStream(ref)){
        digest.update(chunk)
        size+=chunk.byteLength
      }
      const target=Buffer.from('Agent Picket synthetic file integrity: no personal data, only test bytes.')
      const expected=createHash('sha256').update(target).digest('hex')
      if(ref.attachmentId!=='sha256:'+expected||
        digest.digest('hex')!==expected||size!==target.length||
        ref.bytes!==target.length||ref.name!=='picket-synthetic.txt')
        throw Error('Verbatim stored file bytes failed SHA256 and metadata checks')
      if(process.env.PICKET_WEB_WORK_SEED_LOG)
        appendFileSync(process.env.PICKET_WEB_WORK_SEED_LOG,
          'official-cold-file-bytes-sha256-verified\n')
    }
    if(human){
      if(!started){
        started=(async()=>{
          const now=Date.now()
          const end=now-2000,start=end-(8*3_600_000+2000)
          const id=SessionId('picket-offline-web-prior-work')
          // This plugin is reinstalled on a real Host cold restart. Its own
          // test seed must be idempotent; never duplicate the synthetic Turn.
          if(await ctx.sessionPersistence.stat(id))return
          const h=await ctx.sessionPersistence.create({
            id,version:SESSION_FORMAT_VERSION,createdAt:start,isSeeded:false,
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
