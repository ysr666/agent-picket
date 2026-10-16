/**
 * Demonstrate the published official DSH provider's actual list() coverage
 * limitation; never run on a real user Profile. Uses a fresh OS process-style
 * provider instance after corrupting a disposable JSONL header.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { inspectOfficialPersistedDay } from '../src/adapters/dsh/official-persisted-work-preview.ts'

const repo=resolve(fileURLToPath(new URL('..',import.meta.url)))
const hostRequire=createRequire(join(repo,'.dsh-host-probe/package.json'))
async function official(name){
  return import(pathToFileURL(hostRequire.resolve(name)).href)
}
const {Context}=await official('@deepseek-ai/cordis')
const {default:Jsonl}=await official('@deepseek-ai/dsh-session-persistence-jsonl')
const {SessionId,SessionSeq,SESSION_FORMAT_VERSION}=await official('@deepseek-ai/dsh-session')
const base=mkdtempSync(join(tmpdir(),'picket-official-list-gap-'))
const home=join(base,'sessions')
const NOW=Date.parse('2026-10-14T12:00:00.000Z')
const idGood=SessionId('picket-a-valid-eight-hours')
const idBroken=SessionId('picket-b-malformed-header')
function scan(dir){
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const p=join(dir,entry.name)
    return entry.isDirectory()?scan(p):[p]
  })
}
async function provider(){
  const ctx=new Context()
  await ctx.plugin(Jsonl,{root:home,compression:'none'})
  return {ctx,storage:ctx.get('sessionPersistence')}
}
let first
try{
  first=await provider()
  const add=async(id,start,end)=>{
    const h=await first.storage.create({
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
  }
  await add(idGood,NOW-8*3_600_000,NOW)
  await add(idBroken,NOW-20_000,NOW-1000)
  assert.equal((await first.storage.list()).length,2)
  await first.ctx.fiber.dispose()
  first=null
  const files=scan(home).filter(path=>path.endsWith('.jsonl'))
  assert.equal(files.length,2,'both independent official Session files must be on disk')
  const affected=files.filter(path=>
    readFileSync(path,'utf8').split('\n')[0]?.includes(idBroken))
  assert.equal(affected.length,1,'identify the one exact synthetic Session header')
  // Deliberately damage JUST the other Session's first line. A fresh official
  // provider must not be mistaken for a complete census if list omits it.
  const body=readFileSync(affected[0],'utf8')
  writeFileSync(affected[0],'{malformed-header-json\n'+body.slice(body.indexOf('\n')+1))
  const cold=await provider()
  try{
    const rows=await cold.storage.list()
    assert.equal(rows.length,1,
      'official list skips malformed headers instead of attesting the full profile')
    assert.equal(rows[0].header.id,idGood)
    const projection=await inspectOfficialPersistedDay(cold.storage,NOW)
    assert.equal(projection?.confirmedCompletedTurnMs,8*3_600_000)
    assert.equal(projection?.coverage,'durable-prefix-lower-bound')
    // Do NOT assert all-history completeness, fault absence, or release PASS.
    console.log('DSH_OFFICIAL_LIST_OMITTED_MALFORMED_HEADER_CONFIRMED')
    console.log('SCOPE=isolated-published-provider-only; exhaustive-session-coverage=UNPROVEN; release=NO-GO')
  }finally{await cold.ctx.fiber.dispose()}
}finally{
  if(first)await first.ctx.fiber.dispose()
  rmSync(base,{force:true,recursive:true})
}
