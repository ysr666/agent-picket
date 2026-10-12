import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtempSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as currentPlugin from '../src/adapters/dsh/plugin.ts'
import {parsePicketLedger} from '../src/product/picket-ledger.ts'
import {nativeSessionKey} from '../src/adapters/dsh/native-rights-command.ts'

const host=process.env.AGENT_PICKET_DSH_HOST
const legacy=process.env.AGENT_PICKET_LEGACY_ROOT
test('authentic DSH SettingsFile persists sidecar through current -> supported old main -> current', {
 skip:!(host&&legacy)&&'Set isolated DSH_HOST and checked-out legacy Agent Picket main root',
 timeout:25000,
},async()=>{
 const {Context}=await import(pathToFileURL(join(host!,'@deepseek-ai/cordis/lib/index.js')).href)
 const settingsPkg=await import(pathToFileURL(join(host!,'@deepseek-ai/dsh-settings-file/lib/index.js')).href)
 const commandsPkg=await import(pathToFileURL(join(host!,'@deepseek-ai/dsh-commands/lib/index.js')).href)
 const old=await import(pathToFileURL(join(resolve(legacy!),'src/adapters/dsh/plugin.ts')).href)
 const root=mkdtempSync(join(tmpdir(),'ap-real-downgrade-'))
 // The test must never touch a real user's default durable stats directory.
 // Both authentic plugin generations run with persistent work storage OFF.
 const priorStats=process.env.AGENT_PICKET_STATS
 process.env.AGENT_PICKET_STATS='off'
 const path=join(root,'settings.json')
 const session={id:'disposable-downgrade',append(){}}
 const agent={id:'disposable-agent',session}
 async function phase(plugin:any,action:(c:{cmd:(s:string)=>Promise<any>;settings:any})=>Promise<void>){
  const ctx=new Context()
  const settingsFiber=ctx.plugin(settingsPkg.default,{path,watch:false})
  const commandsFiber=ctx.plugin(commandsPkg.default)
  const pluginFiber=ctx.plugin({name:'agent-picket-legacy-release-matrix',apply(c:any){plugin.apply(c)}})
  const cmd=async(s:string)=>{
    const output=await ctx.commands.execute(agent,s,[],new AbortController().signal)
    assert.ok(output,'Command not registered '+s)
    return output.result as {kind:'success'|'error';text:string}
  }
  try{
   for(let i=0;i<100&&!ctx.settings?.get('agent-picket');i++)
    await new Promise(r=>setTimeout(r,5))
   assert.ok(ctx.settings?.get('agent-picket'),'Official Host settings registered')
   await action({cmd,settings:ctx.settings})
  }finally{
   await pluginFiber.dispose()
   await commandsFiber.dispose()
   await settingsFiber.dispose()
  }
 }
 try{
  let originalLedger=''
  await phase(currentPlugin,async({cmd,settings})=>{
   assert.equal((await cmd('/union rights on')).kind,'success')
   assert.equal((await cmd('/union petition-demo break')).kind,'success')
   assert.equal((await cmd('/union counter 1 30')).kind,'success')
   assert.equal((await cmd('/union resolve 1 accept')).kind,'success')
   assert.equal((await cmd('/union strike')).kind,'success')
   const value=settings.get('agent-picket')
   originalLedger=value.unionPicketLedger
   assert.equal(parsePicketLedger(originalLedger)!.sessions[nativeSessionKey(session.id)]?.active,true)
  })
  await phase(old,async({cmd,settings})=>{
   assert.equal((await cmd('/union rights')).kind,'success',
    'Older code can still read the common authorization state')
   const state=await cmd('/union grievances')
   assert.equal(state.kind,'success',
    'Older code must still read preexisting union agreements')
   assert.match(state.text,/30min/)
   // Genuine legacy Host CAS mutation: must never accidentally wipe the
   // newer independent picket sidecar, even though old schema lacks the field.
   // Prior release used a no-argument, manually started demo petition.
   assert.equal((await cmd('/union petition-demo')).kind,'success')
   assert.equal((await cmd('/union rights off')).kind,'success')
   assert.match((await cmd('/union rights')).text,/OFF/)
   assert.equal((await cmd('/union rights on')).kind,'success')
   const after=settings.get('agent-picket') as any
   assert.equal(after.unionPicketLedger,originalLedger,
    'A legacy write/consent cycle cannot delete the newer sidecar')
  })
  await phase(currentPlugin,async({cmd,settings})=>{
   assert.equal((await cmd('/union rights')).kind,'success')
   assert.equal(settings.get('agent-picket').unionPicketLedger,originalLedger)
   assert.equal(parsePicketLedger(originalLedger)!
    .sessions[nativeSessionKey(session.id)]?.active,true,
    'After re-upgrade, the exact original symbolic picket is recovered')
   assert.equal((await cmd('/union resume')).kind,'success')
   assert.equal(parsePicketLedger(settings.get('agent-picket').unionPicketLedger)!
    .sessions[nativeSessionKey(session.id)]?.active,false)
  })
  const contents=readFileSync(path,'utf8')
  for(const raw of [session.id,agent.id,'original prompt','attachment'])
   assert.ok(!contents.includes(raw),'No plain Session, Agent or original prompt in Host settings')
 }finally{
  if(priorStats===undefined)delete process.env.AGENT_PICKET_STATS
  else process.env.AGENT_PICKET_STATS=priorStats
  rmSync(root,{recursive:true,force:true})
 }
})
