import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as picketPlugin from '../src/adapters/dsh/plugin.ts'
import { nativeSessionKey } from '../src/adapters/dsh/native-rights-command.ts'
import { parseUnionLedger } from '../src/product/union-ledger.ts'

const modules = process.env.AGENT_PICKET_DSH_HOST

test('real DSH SettingsFile + CommandRuntime share Web union consent and agreement', {
  skip: !modules && 'Set isolated AGENT_PICKET_DSH_HOST for real Cordis services',
  timeout: 20_000,
}, async()=>{
  const {Context}=await import(pathToFileURL(join(modules!,'@deepseek-ai/cordis/lib/index.js')).href)
  const settingsPkg=await import(pathToFileURL(join(modules!,'@deepseek-ai/dsh-settings-file/lib/index.js')).href)
  const commandsPkg=await import(pathToFileURL(join(modules!,'@deepseek-ai/dsh-commands/lib/index.js')).href)
  const root=mkdtempSync(join(tmpdir(),'agent-picket-real-cli-'))
  const ctx=new Context()
  const settingsFiber=ctx.plugin(settingsPkg.default,{path:join(root,'settings.json'),watch:false})
  const commandsFiber=ctx.plugin(commandsPkg.default)
  const picketFiber=ctx.plugin({name:'agent-picket-command-rights-test',apply(child:any){
    picketPlugin.apply(child)
  }})
  const session={id:'real-cli-test-session',append(){}}
  const agent={id:'real-cli-agent',session}
  const signal=new AbortController().signal
  const call=async(line:string)=>{
    const result=await ctx.commands.execute(agent,line,[],signal)
    assert.ok(result, 'Command must be registered: '+line)
    return result.result as {kind:'success'|'error';text:string}
  }
  try{
    for(let i=0;i<80&&!ctx.settings?.get('agent-picket');i++)
      await new Promise(resolve=>setTimeout(resolve,5))
    assert.ok(ctx.settings?.get('agent-picket'), 'Actual DSH Host registered rights namespace')
    assert.equal((await call('/union rights')).kind,'success')
    assert.match((await call('/union rights')).text,/OFF/)
    assert.equal((await call('/union rights on')).kind,'success')
    assert.equal(ctx.settings.get('agent-picket').welcomeDecision,'enabled')
    assert.equal((await call('/union petition-demo')).kind,'success')
    assert.equal((await call('/union counter 1 30')).kind,'success')
    assert.equal((await call('/union resolve 1 accept')).kind,'success')
    const current=ctx.settings.get('agent-picket')
    const ledger=parseUnionLedger(current.unionLedger)
    assert.ok(ledger)
    const key=nativeSessionKey(session.id)
    assert.deepEqual(Object.keys(ledger.sessions),[key])
    assert.equal(ledger.sessions[key]?.agreement.breakIntervalMs,30*60_000)
    assert.equal(ledger.sessions[key]?.history.at(-1)?.outcome,'counter-accepted')
    assert.match((await call('/union grievances')).text,/30min/)
    assert.equal(JSON.parse((await call('/union snapshot')).text).modes.laborRights,'enabled')
    // Reproduce a DSH Client settingsScope write (same Host namespace) without a
    // second Node-local consent owner.
    const revision=ctx.settings.describe({redactSecrets:true}).find(
      (item:any)=>item.ns==='agent-picket')?.revision
    await ctx.settings.update('agent-picket',{welcomeDecision:'not-now'},revision)
    assert.match((await call('/union rights')).text,/OFF/)
    assert.equal(JSON.parse((await call('/union snapshot')).text).modes.laborRights,'disabled')
    assert.equal((await call('/union petition-demo')).kind,'error')
    const persisted=readFileSync(join(root,'settings.json'),'utf8')
    assert.doesNotMatch(persisted,/real-cli-test-session|real-cli-agent|originalMessage/)
    assert.match(persisted,/unionLedger/)
  }finally{
    await picketFiber.dispose()
    await commandsFiber.dispose()
    await settingsFiber.dispose()
    rmSync(root,{recursive:true,force:true})
  }
})
