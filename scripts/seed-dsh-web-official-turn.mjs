/**
 * Test-only, offline, official DSH JSONL SessionPersistence writer for a
 * completely disposable Web Profile. Not part of the distributed package.
 * No prompts/attachments, model calls, accounts, global profiles or SQLite.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdirSync } from 'node:fs'

const home=process.argv[2]
const deps=process.env.AGENT_PICKET_DSH_HOST
assert.ok(home&&deps&&process.env.PICKET_GOAL_REAL_PERSISTED_E2E==='1',
  'Isolated Web persistence seeding requires explicit E2E opt-in')
const requireFromHost=createRequire(join(resolve(deps),'package.json'))
const officialImport=async name=>
  import(pathToFileURL(requireFromHost.resolve(name)).href)
const { Context }=await officialImport('@deepseek-ai/cordis')
const { default: JsonlProvider }=
  await officialImport('@deepseek-ai/dsh-session-persistence-jsonl')
const { SessionId,SessionSeq,SESSION_FORMAT_VERSION }=
  await officialImport('@deepseek-ai/dsh-session')
const root=join(resolve(home),'sessions')
mkdirSync(root,{recursive:true})
const ctx=new Context()
try {
  await ctx.plugin(JsonlProvider,{root,compression:'none'})
  const persistence=ctx.get('sessionPersistence')
  assert.ok(persistence,'Official DSH JSONL provider must be available')
  assert.equal((await persistence.list()).length,0,
    'Synthetic Web profile must start with no real sessions')
  const end=Date.now()-1500
  const start=end-(8*3_600_000+2_000)
  assert.ok(start>0)
  const id=SessionId('picket-isolated-web-prior-completed-turn')
  const handle=await persistence.create({
    id,version:SESSION_FORMAT_VERSION,createdAt:start,isSeeded:false,
  })
  try {
    await handle.append([
      {seq:SessionSeq(0),time:start,type:'turn/start',data:{turn:1}},
      {seq:SessionSeq(1),time:end,type:'turn/end',
        data:{turn:1,reason:{kind:'completed'}}},
    ])
    await handle.flush()
  }finally {await handle.close()}
  await persistence.flush()
  const items=await persistence.list()
  assert.equal(items.length,1,'Official provider must list exactly the synthetic record')
  const read=await persistence.open(id,'read')
  try{
    const events=(await read.read(0,4)).events
    assert.equal(events.length,2)
    assert.equal(events[1]?.data?.reason?.kind,'completed')
    assert.ok(events[1].time-events[0].time>=8*3_600_000)
  }finally{await read.close()}
  console.log('OFFICIAL_WEB_SYNTHETIC_PERSISTENCE_SEEDED=1')
}finally{await ctx.fiber.dispose()}
