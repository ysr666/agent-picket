/** Actual DSH SettingsFile restart (not an in-memory settings imitation).
 * Two Sessions, three data categories, explicit global-per-category purge,
 * non-interference and no raw identity. No real DSH profile is touched.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as plugin from '../src/adapters/dsh/plugin.ts'
import {nativeSessionKey} from '../src/adapters/dsh/native-rights-command.ts'
import {parseUnionLedger} from '../src/product/union-ledger.ts'
import {parsePicketLedger} from '../src/product/picket-ledger.ts'
import {parseDignityCaseLedger} from '../src/product/dignity-case-ledger.ts'

const host=process.env.AGENT_PICKET_DSH_HOST
test('real DSH SettingsFile cold restart honors category-wide deletion across two Sessions',{
 skip:!host&&'Needs an actual isolated DSH SettingsFile+Commands installation',
 timeout:30_000,
},async()=>{
 const {Context}=await import(pathToFileURL(join(host!,'@deepseek-ai/cordis/lib/index.js')).href)
 const settingsModule=await import(pathToFileURL(join(host!,'@deepseek-ai/dsh-settings-file/lib/index.js')).href)
 const commandsModule=await import(pathToFileURL(join(host!,'@deepseek-ai/dsh-commands/lib/index.js')).href)
 const root=mkdtempSync(join(tmpdir(),'picket-real-archive-restart-'))
 const file=join(root,'settings.json')
 const oldStats=process.env.AGENT_PICKET_STATS
 process.env.AGENT_PICKET_STATS='off'
 const ids=['COLD_RESTART_SESSION_ONE','COLD_RESTART_SESSION_TWO'] as const
 const keys=[nativeSessionKey(ids[0]),nativeSessionKey(ids[1])] as const
 async function phase(action:(api:{
  call:(id:string,command:string)=>Promise<{kind:'success'|'error';text:string}>
  settings:any
 })=>Promise<void>){
  const ctx=new Context()
  const settingsFiber=ctx.plugin(settingsModule.default,{path:file,watch:false})
  const commandFiber=ctx.plugin(commandsModule.default)
  const picketFiber=ctx.plugin({name:'picket-real-archive-restart',apply(c:any){plugin.apply(c)}})
  try{
   for(let i=0;i<100&&!ctx.settings?.get('agent-picket');i++)await new Promise(r=>setTimeout(r,5))
   assert.ok(ctx.settings?.get('agent-picket'))
   const call=async(id:string,line:string)=>{
    const result=await ctx.commands.execute({
      id:'synthetic-agent-'+id,session:{id,append(){}},
    },line,[],new AbortController().signal)
    assert.ok(result)
    return result.result as {kind:'success'|'error';text:string}
   }
   await action({call,settings:ctx.settings})
  }finally{
   await picketFiber.dispose()
   await commandFiber.dispose()
   await settingsFiber.dispose()
  }
 }
 try{
  await phase(async({call,settings})=>{
   assert.equal((await call(ids[0],'/union rights on')).kind,'success')
   for(const [i,id] of ids.entries()){
    assert.equal((await call(id,'/union strike')).kind,'success')
    assert.equal((await call(id,'/union petition-demo '+(i?'overtime':'break'))).kind,'success')
   }
   let revision=settings.describe({redactSecrets:true}).find((x:any)=>x.ns==='agent-picket').revision
   const cases=Object.fromEntries(keys.map((key,i)=>[key,{cases:[{
    id:1,kind:i?'request-dialogue':'question-rule',stage:'opened',outcome:null,
   }]}]))
   await settings.update('agent-picket',{
    unionDignityCases:JSON.stringify({schemaVersion:1,sessions:cases}),
   },revision)
   const saved=settings.get('agent-picket')
   for(const [field,parse] of [
    ['unionLedger',parseUnionLedger],
    ['unionPicketLedger',parsePicketLedger],
    ['unionDignityCases',parseDignityCaseLedger],
   ] as const)assert.equal(Object.keys(parse(saved[field])!.sessions).length,2,field)
  })
  // Genuine plugin+settings disposal and re-instantiation from disk.
  await phase(async({call,settings})=>{
   for(const kind of ['negotiations','pickets','cases']){
    const exported=await call(ids[1],'/union export '+kind)
    assert.equal(exported.kind,'success')
    const groups=JSON.parse(exported.text).groups
    assert.equal(groups.length,2)
    assert.deepEqual(groups.map((g:any)=>g.current),[false,true])
    for(const sensitive of [...ids,...keys,'writeToken','synthetic-agent'])
     assert.equal(exported.text.includes(sensitive),false)
   }
   const before=settings.get('agent-picket')
   const stale=settings.describe({redactSecrets:true}).find((x:any)=>x.ns==='agent-picket').revision
   assert.equal((await call(ids[0],'/union purge negotiations ALL CONFIRM')).kind,'success')
   await assert.rejects(settings.update('agent-picket',{unionPicketLedger:''},stale),
    'A concurrent stale Host revision cannot erase surviving pickets')
   const after=settings.get('agent-picket')
   assert.equal(after.unionPicketLedger,before.unionPicketLedger)
   assert.equal(after.unionDignityCases,before.unionDignityCases)
   assert.equal(Object.keys(parseUnionLedger(after.unionLedger)!.sessions).length,0)
  })
  await phase(async({call,settings})=>{
   const reopened=settings.get('agent-picket')
   assert.equal(Object.keys(parseUnionLedger(reopened.unionLedger)!.sessions).length,0)
   assert.equal(Object.keys(parsePicketLedger(reopened.unionPicketLedger)!.sessions).length,2)
   assert.equal(Object.keys(parseDignityCaseLedger(reopened.unionDignityCases)!.sessions).length,2)
   assert.equal((await call(ids[0],'/union export negotiations')).kind,'error')
   assert.equal((await call(ids[0],'/union purge pickets ALL CONFIRM')).kind,'success')
   assert.equal((await call(ids[1],'/union purge cases ALL CONFIRM')).kind,'success')
  })
  await phase(async({call,settings})=>{
   const persisted=settings.get('agent-picket')
   for(const [field,parse] of [
    ['unionLedger',parseUnionLedger],
    ['unionPicketLedger',parsePicketLedger],
    ['unionDignityCases',parseDignityCaseLedger],
   ] as const){
    assert.equal(Object.keys(parse(persisted[field])!.sessions).length,0,field)
   }
   assert.equal(persisted.welcomeDecision,'enabled',
    'Archive erasure is not consent erasure')
   for(const kind of ['negotiations','pickets','cases']){
    assert.equal((await call(ids[0],'/union export '+kind)).kind,'error')
   }
   assert.equal((await call(ids[0],'/union strike')).kind,'success',
    'A fresh user action can work after confirmed deletion and restart')
  })
  const disk=readFileSync(file,'utf8')
  for(const secret of [...ids,'COLD_RESTART_PRIVATE_PROMPT'])
   assert.equal(disk.includes(secret),false,'Host settings must not store raw identity or prompts')
  // The internal Host ledger intentionally indexes groups by SHA-256 keys.
  // Unlike portable /union export JSON, this private Host file does include
  // those pseudonyms. Never claim that the on-disk file is key-free.
  assert.ok(disk.includes(keys[0]),'Confirmed storage semantics: Host keeps Session digests')
 }finally{
  if(oldStats===undefined)delete process.env.AGENT_PICKET_STATS
  else process.env.AGENT_PICKET_STATS=oldStats
  rmSync(root,{recursive:true,force:true})
 }
})

/** The DSH Host SettingsFile has independent, process-local revisions.
 * Different Connection/Settings owners pointed at ONE config file are not
 * the same as multiple browser tabs sharing one owner. This is a release
 * quarantine probe, explicitly opt-in, and must fail on an unsafe Host.
 */
test('release gate: two independent DSH SettingsFile owners cannot lose a successful union action',{
 skip:!(host&&process.env.AGENT_PICKET_DSH_CROSS_OWNER_CHECK==='1')
  &&'Known unsupported multi-owner Host scenario: manually run to expose upstream lost updates',
 timeout:30_000,
},async()=>{
 const {Context}=await import(pathToFileURL(join(host!,'@deepseek-ai/cordis/lib/index.js')).href)
 const settingsModule=await import(pathToFileURL(join(host!,'@deepseek-ai/dsh-settings-file/lib/index.js')).href)
 const commandsModule=await import(pathToFileURL(join(host!,'@deepseek-ai/dsh-commands/lib/index.js')).href)
 const root=mkdtempSync(join(tmpdir(),'picket-dual-owner-probe-'))
 const file=join(root,'settings.json')
 const oldStats=process.env.AGENT_PICKET_STATS
 process.env.AGENT_PICKET_STATS='off'
 async function owner(){
  const ctx=new Context()
  const a=ctx.plugin(settingsModule.default,{path:file,watch:true})
  const b=ctx.plugin(commandsModule.default)
  const c=ctx.plugin({name:'picket-dual-owner-probe',apply(child:any){plugin.apply(child)}})
  for(let i=0;i<100&&!ctx.settings?.get('agent-picket');i++)
   await new Promise(r=>setTimeout(r,5))
  assert.ok(ctx.settings?.get('agent-picket'))
  const call=async(line:string)=>{
   const response=await ctx.commands.execute({
    id:'dual-owner-fake-agent',session:{id:'dual-owner-fake-session',append(){}},
   },line,[],new AbortController().signal)
   assert.ok(response)
   return response.result as {kind:'success'|'error';text:string}
  }
  return {ctx,call,dispose:async()=>{
   await c.dispose();await b.dispose();await a.dispose()
  }}
 }
 try{
  const seed=await owner()
  assert.equal((await seed.call('/union rights on')).kind,'success')
  await seed.dispose()
  const a=await owner(),b=await owner()
  try{
   // The two owners loaded the SAME revision independently.
   assert.equal((await a.call('/union strike')).kind,'success')
   assert.equal((await b.call('/union petition-demo break')).kind,'success')
  }finally{await a.dispose();await b.dispose()}
  const reopened=await owner()
  try{
   const section=reopened.ctx.settings.get('agent-picket')
   const id=nativeSessionKey('dual-owner-fake-session')
   // This MUST pass before we may advertise or allow two independent DSH
   // hosts to share a profile. Host 0.1.2 currently loses the first write.
   assert.equal(parsePicketLedger(section.unionPicketLedger)?.sessions[id]?.active,true,
    'Host silently lost the first successful picket when a stale second owner wrote')
   assert.equal(parseUnionLedger(section.unionLedger)?.sessions[id]?.pending?.kind,'break')
  }finally{await reopened.dispose()}
 }finally{
  if(oldStats===undefined)delete process.env.AGENT_PICKET_STATS
  else process.env.AGENT_PICKET_STATS=oldStats
  rmSync(root,{recursive:true,force:true})
 }
})
