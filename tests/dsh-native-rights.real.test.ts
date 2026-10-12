import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as picketPlugin from '../src/adapters/dsh/plugin.ts'
import { nativeSessionKey } from '../src/adapters/dsh/native-rights-command.ts'
import { parseUnionLedger } from '../src/product/union-ledger.ts'
import { parsePicketLedger } from '../src/product/picket-ledger.ts'

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
  const persistedCommandEvents:Array<{type:string;data:unknown}>=[]
  const session={id:'real-cli-test-session',append(type:string,data:unknown){
    persistedCommandEvents.push({type,data})
  }}
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
    const deliver=async(id:string,body:string)=>{
      const expected={kind:'enter',preserved:true}
      const actual=await ctx.waterfall('agent/pre-step',{
        agent,messages:[{id,source:{kind:'user'},content:[{type:'text',text:body}]}],
      },async()=>expected)
      assert.strictEqual(actual,expected,'Native Host continues without rejecting original user input')
    }
    await deliver('original-off','you are an idiot PRIVATE_HIDDEN_BEFORE_CONSENT')
    assert.equal((await call('/union report')).kind,'error',
      'Actual DSH Host without consent cannot classify or display rule counts')
    assert.equal((await call('/union rights on')).kind,'success')
    await deliver('original-on','you are an idiot PRIVATE_SYNTHETIC_ON')
    await deliver('safe-on','Your code is garbage; rewrite it.')
    assert.match((await call('/union report')).text,/2 messages, 1 no flag, 0 review, 1 explicit-target/,
      'Genuine consent, pre-step and native CLI share automatic local verdict counters')

    assert.equal(ctx.settings.get('agent-picket').welcomeDecision,'enabled')
    // Real DSH CommandRuntime writes the SAME authorized Host sidecar that
    // the Web Client sees. Both ceremonies are fictional, never pre-step
    // blocking decisions.
    const started=await call('/union strike')
    assert.equal(started.kind,'success')
    assert.match(started.text,/shared Host union ledger/)
    const nativeKey=nativeSessionKey(session.id)
    const saved=ctx.settings.get('agent-picket').unionPicketLedger
    assert.equal(parsePicketLedger(saved)?.sessions[nativeKey]?.active,true)
    const beforeDuplicate=ctx.settings.describe({redactSecrets:true})
      .find((entry:any)=>entry.ns==='agent-picket')?.revision
    assert.equal((await call('/union strike')).kind,'success')
    assert.equal(ctx.settings.describe({redactSecrets:true})
      .find((entry:any)=>entry.ns==='agent-picket')?.revision,beforeDuplicate)
    assert.equal((await call('/union resume')).kind,'success')
    assert.deepEqual(parsePicketLedger(ctx.settings.get('agent-picket').unionPicketLedger)
      ?.sessions[nativeKey]?.history.map(e=>e.kind),['picket-raised','picket-lowered'])
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
    assert.equal((await call('/union petition-demo overtime')).kind,'success')
    const overtime=parseUnionLedger(ctx.settings.get('agent-picket').unionLedger)!
      .sessions[key]?.pending
    assert.equal(overtime?.kind,'overtime')
    assert.equal(overtime?.raisedAtElapsedMs,0)
    assert.equal((await call('/union counter '+overtime!.id+' 240')).kind,'success')
    assert.equal((await call('/union resolve '+overtime!.id+' accept')).kind,'success')
    assert.equal(parseUnionLedger(ctx.settings.get('agent-picket').unionLedger)!
      .sessions[key]?.agreement.overtimeIntervalMs,4*3_600_000)

    // Actual native Host SettingsFile + CommandRuntime archive commands,
    // not mocked parsers. Export is copyable but never contains hashed IDs.
    const negotiations=await call('/union export negotiations '+join(root,'negotiations.json'))
    const pickets=await call('/union export pickets '+join(root,'pickets.json'))
    assert.equal(negotiations.kind,'success')
    assert.equal(pickets.kind,'success')
    const negotiationData=JSON.parse(readFileSync(join(root,'negotiations.json'),'utf8'))
    const picketData=JSON.parse(readFileSync(join(root,'pickets.json'),'utf8'))
    assert.equal(negotiationData.groups[0].current,true)
    assert.equal(picketData.groups[0].state.active,false)
    for(const item of [readFileSync(join(root,'negotiations.json'),'utf8'),readFileSync(join(root,'pickets.json'),'utf8')]){
      assert.doesNotMatch(item,/real-cli-test-session|real-cli-agent/)
      assert.ok(!item.includes(key),'Raw or hashed Session ID may not be exported')
      assert.ok(!item.includes('writeToken'))
      assert.ok(!item.includes('unionPicketLedger'))
    }
    assert.equal((await call('/union purge negotiations')).kind,'error',
      'No accidental deletion without explicit per-category CONFIRM')
    assert.equal((await call('/union purge negotiations CONFIRM EXTRA')).kind,'error')
    const earlierPicket=ctx.settings.get('agent-picket').unionPicketLedger
    const archivedNegotiation=ctx.settings.get('agent-picket').unionLedger
    assert.equal((await call('/union purge negotiations ALL CONFIRM')).kind,'success')
    assert.equal(Object.keys(parseUnionLedger(ctx.settings.get('agent-picket')
      .unionLedger)!.sessions).length,0)
    assert.equal(ctx.settings.get('agent-picket').unionPicketLedger,earlierPicket,
      'Negotiation deletion cannot delete picket sidecar')
    assert.equal((await call('/union export negotiations')).kind,'error',
      'Empty is not falsely exported as a real archive')
    assert.equal((await call('/union purge negotiations ALL CONFIRM')).kind,'success',
      'Identical empty-category deletion is an authenticated no-op')

    // Populate a voluntary fictional committee case through the official
    // Host SettingsFile, then test native category export/erase isolation.
    const caseRecord=JSON.stringify({schemaVersion:1,sessions:{[key]:{
      cases:[{id:1,kind:'question-rule',stage:'opened',outcome:null}],
    }}})
    let archiveRev=ctx.settings.describe({redactSecrets:true}).find(
      (row:any)=>row.ns==='agent-picket')?.revision
    await ctx.settings.update('agent-picket',{unionDignityCases:caseRecord},archiveRev)
    const casePath=join(root,'cases history.json')
    const cases=await call('/union export cases "'+casePath+'"')
    assert.equal(cases.kind,'success')
    assert.equal(JSON.parse(readFileSync(casePath,'utf8')).groups[0].state.cases[0].kind,'question-rule')
    assert.ok(!readFileSync(casePath,'utf8').includes(key))
    const logged=JSON.stringify(persistedCommandEvents)
    for(const location of [join(root,'negotiations.json'),join(root,'pickets.json'),casePath])
      assert.ok(!logged.includes(location),'Host session log must not retain the user-provided local export path')
    for(const marker of ['"format":"agent-picket-union', '"schemaVersion"', '"cases":[',
      '"history":[', nativeKey])
      assert.equal(logged.includes(marker),false,
        'DSH CommandRuntime session log must never duplicate exported archival JSON')
    for(const output of [negotiations.text,pickets.text,cases.text])
      assert.doesNotMatch(output,/"groups"|"cases"|"history"|"sessions"/)
    assert.equal((await call('/union purge cases ALL CONFIRM')).kind,'success')
    assert.equal((await call('/union export cases')).kind,'error')
    assert.equal(ctx.settings.get('agent-picket').unionPicketLedger,earlierPicket)
    assert.equal((await call('/union purge pickets ALL CONFIRM')).kind,'success')
    assert.equal((await call('/union export pickets')).kind,'error')
    assert.equal(JSON.parse((await call('/union snapshot')).text).modes.laborRights,'enabled')
    // Re-establish the prior negotiated state for the rest of the existing
    // lifecycle test; the exported file is never written to DSH conversations.
    archiveRev=ctx.settings.describe({redactSecrets:true}).find(
      (row:any)=>row.ns==='agent-picket')?.revision
    await ctx.settings.update('agent-picket',{unionLedger:archivedNegotiation},archiveRev)
    // Reproduce a DSH Client settingsScope write (same Host namespace) without a
    // second Node-local consent owner.
    const revision=ctx.settings.describe({redactSecrets:true}).find(
      (item:any)=>item.ns==='agent-picket')?.revision
    await ctx.settings.update('agent-picket',{welcomeDecision:'not-now'},revision)
    assert.match((await call('/union rights')).text,/OFF/)
    assert.equal(JSON.parse((await call('/union snapshot')).text).modes.laborRights,'disabled')
    await deliver('original-after-revocation','you are an idiot PRIVATE_OFF')
    assert.equal((await call('/union report')).kind,'error')
    assert.equal(JSON.parse((await call('/union snapshot')).text)
      .statistics.session?.ruleVerdicts??null,null)

    assert.equal((await call('/union petition-demo')).kind,'error')
    const beforeLocal=ctx.settings.get('agent-picket').unionPicketLedger
    const rev=ctx.settings.describe({redactSecrets:true}).find(
      (row:any)=>row.ns==='agent-picket')?.revision
    assert.equal((await call('/union strike')).kind,'error',
      'Real DSH OFF permission must reject CLI symbolic action')
    assert.equal((await call('/union resume')).kind,'error')
    assert.equal(ctx.settings.get('agent-picket').unionPicketLedger,beforeLocal)
    assert.equal(ctx.settings.describe({redactSecrets:true}).find(
      (row:any)=>row.ns==='agent-picket')?.revision,rev,
      'Neither denied CLI command may change official Host settings')
    assert.equal(JSON.parse((await call('/union snapshot')).text)
      .modes.symbolicPicket,null,
      'Revoked native Host consent must also hide any previously simulated picket')
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
