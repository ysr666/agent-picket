import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import { apply as applyPlugin, Config } from '../src/adapters/dsh/plugin.ts'
import { createDshBrowserUnionDesk } from '../src/adapters/dsh/client-bargaining.ts'
import { nativeSessionKey } from '../src/adapters/dsh/native-rights-command.ts'
import { parsePicketLedger } from '../src/product/picket-ledger.ts'
import type { DshSettingsScope } from '../src/adapters/dsh/client-rights-scope.ts'
import type { UnionSettingsSection } from '../src/adapters/dsh/client-bargaining.ts'

const modules = process.env.AGENT_PICKET_DSH_HOST
const is02 = !!modules && /^0\.2\./.test(
  process.env.AGENT_PICKET_TEST_DSH_VERSION ?? '',
)
test('real DSH 0.2 CommandRuntime routes shared symbolic pickets without model calls', {
  skip: !is02 && 'Set DSH 0.2 node_modules and AGENT_PICKET_TEST_DSH_VERSION for actual command runtime',
  timeout: 15_000,
}, async () => {
  const exportRoot=mkdtempSync(join(tmpdir(),'picket-real-02-export-'))
  const { Context } = await import(pathToFileURL(join(modules!, '@deepseek-ai/cordis/lib/index.js')).href)
  const commands = await import(pathToFileURL(join(modules!, '@deepseek-ai/dsh-commands/lib/index.js')).href)
  const ctx = new Context()
  type Choice = 'unseen' | 'enabled' | 'not-now'
  let value: { welcomeDecision: Choice; unionLedger: string; unionPicketLedger: string; unionDignityCases:string; commandLocale: 'auto'|'en'|'zh-CN' } =
    {welcomeDecision:'unseen',unionLedger:'',unionPicketLedger:'',unionDignityCases:'',commandLocale:'auto'}
  let revision = 0
  let rejectPicket = false
  const listeners = new Set<() => void>()
  const changes = () => {for(const fn of listeners)fn()}
  const hostSettings = {
    describe() {return [{ns:'agent-picket',revision,value:{...value}}]},
    configure() {return () => {}},
    async update(ns:string,patch:object,expected?:number) {
      assert.equal(ns,'agent-picket')
      if (expected!==revision)throw Error('SETTINGS_CONFLICT')
      if(rejectPicket && 'unionPicketLedger' in patch)throw Error('HOST_REFUSAL')
      const next={...value,...patch}
      // Enforce the same exported DSH 0.2 Config boundary, including the
      // transformed union/picket ledger validators and strict choices.
      const parsed=Config(next)
      value={
        welcomeDecision:parsed.welcomeDecision.get(),
        unionLedger:parsed.unionLedger.get(),
        unionPicketLedger:parsed.unionPicketLedger.get(),
        unionDignityCases:parsed.unionDignityCases.get(),
        commandLocale:parsed.commandLocale.get(),
      }
      revision++
      changes()
    },
  }
  ctx.provide('settings',hostSettings)
  const commandFiber=ctx.plugin(commands.default)
  const pluginFiber=ctx.plugin({name:'picket-test-02-command-runtime',apply(child:any){
    applyPlugin(child)
  }})
  const events:Array<{type:string;data:unknown}> = []
  const session={id:'isolated-dsh02-cli-session',append(type:string,data:unknown) {
    events.push({type,data})
  }}
  const agent={id:'isolated-02-agent',session}
  const signal=new AbortController().signal
  const scope:DshSettingsScope<UnionSettingsSection>={
    getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision,value:{...value}}),
    subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener)}},
    async set(field,next) {await hostSettings.update('agent-picket',{[field]:next},revision)},
  }
  const browser=createDshBrowserUnionDesk({scope,
    consent:()=>value.welcomeDecision==='enabled',
    hashSession:async id=>nativeSessionKey(id),
  })
  const call=async (line:string) => {
    const result=await ctx.commands.execute(agent,line,[],signal)
    assert.ok(result,'DSH 0.2 CommandRuntime must register the /union command')
    return result.result as {kind:'success'|'error';text:string}
  }
  try {
    for(let i=0;i<80 && typeof ctx.commands?.execute!=='function';i++)
      await new Promise(resolve=>setTimeout(resolve,5))
    assert.equal(commandFiber.state,2)
    assert.equal(pluginFiber.state,2)
    assert.equal(typeof ctx.commands.execute,'function')
    await browser.setActiveSession(session.id)
    const key=nativeSessionKey(session.id)
    assert.equal((await call('/union rights')).kind,'success')
    const deliver=async(id:string,body:string)=>{
      const expected={kind:'enter',preserved:true}
      const result=await ctx.waterfall('agent/pre-step',{
        agent,messages:[{id,source:{kind:'user'},content:[{type:'text',text:body}]}],
      },async()=>expected)
      assert.strictEqual(result,expected,
        'Real DSH 0.2 pre-step consent gate never blocks original text')
    }
    await deliver('before-optin','you are an idiot PRIVATE_OFF')
    assert.equal((await call('/union report')).kind,'error')
    assert.equal((await call('/union rights on')).kind,'success')
    await deliver('after-optin','you are an idiot PRIVATE_ON')
    await deliver('code-criticism','Your code is garbage, rewrite it')
    assert.match((await call('/union report')).text,
      /2 messages, 1 no flag, 0 review, 1 explicit-target|消息 2 条，未命中 1 条、待复核 0 条、明确针对性标记 1 条/,
      'Actual DSH 0.2 CommandRuntime and the pre-step hook use the same current Host consent')

    assert.equal(value.welcomeDecision,'enabled')
    assert.equal((await call('/union strike')).kind,'success')
    assert.equal(browser.snapshot().picket?.active,true,
      'Web should read the CLI event from identical Host settings')
    const first=parsePicketLedger(value.unionPicketLedger)!
    assert.deepEqual(first.sessions[key]?.history.map(x=>x.kind),['picket-raised'])
    const oldRevision=revision
    assert.equal((await call('/union strike')).kind,'success')
    assert.equal(revision,oldRevision,'Repeated strike must not write another Host event')
    assert.match((await call('/union status')).text,/symbolic strike in progress|象征性罢工进行中/)
    await browser.setPicket(false)
    assert.match((await call('/union status')).text,/no current symbolic strike|目前没有(?:正在进行的)?象征性罢工|当前没有象征性罢工|当前没有象征性举牌/)
    assert.deepEqual(parsePicketLedger(value.unionPicketLedger)!.sessions[key]?.history.map(x=>x.kind),
      ['picket-raised','picket-lowered'])
    await browser.setPicket(true)
    assert.equal((await call('/union resume')).kind,'success')
    assert.equal(browser.snapshot().picket?.active,false)
    const restored=JSON.parse(value.unionPicketLedger) as {sessions:Record<string,unknown>}
    assert.deepEqual(Object.keys(restored.sessions),[key])
    assert.equal(value.unionLedger,'','Symbolic pickets must not rewrite legacy bargaining')
    assert.doesNotMatch(value.unionPicketLedger,/isolated-dsh02-cli-session|isolated-02-agent|rawPrompt/)
    assert.equal((await call('/union petition-demo overtime')).kind,'success')
    assert.equal(browser.snapshot().pending?.kind,'overtime',
      'Genuine DSH 0.2 CLI writes the same pending overtime as the Web desk')
    assert.equal(browser.snapshot().pending?.raisedAtElapsedMs,0)
    const overtimeId=browser.snapshot().pending!.id
    assert.equal((await call('/union counter '+overtimeId+' 240')).kind,'success')
    assert.equal((await call('/union resolve '+overtimeId+' accept')).kind,'success')
    assert.equal(browser.snapshot().state?.agreement.overtimeIntervalMs,4*3_600_000)
    assert.equal(browser.snapshot().state?.agreement.breakIntervalMs,2*3_600_000)
    const rejectedBefore=revision
    assert.equal((await call('/union petition-demo untrusted')).kind,'error')
    assert.equal(revision,rejectedBefore,
      'Invalid CLI petition kind cannot mutate Host settings')
    assert.equal((await call('/union rights off')).kind,'success')
    assert.equal(browser.snapshot().picket,null,'Revocation hides fictional action history')
    await deliver('after-revocation','you are an idiot PRIVATE_OFF_AGAIN')
    assert.equal((await call('/union report')).kind,'error')
    assert.equal(JSON.parse((await call('/union snapshot')).text)
      .statistics.session?.ruleVerdicts??null,null)

    const parked=value.unionPicketLedger
    const revocationRevision=revision
    assert.equal((await call('/union strike')).kind,'error',
      'Explicit Host OFF must not fall back to memory-only success')
    assert.equal((await call('/union resume')).kind,'error')
    assert.equal(value.unionPicketLedger,parked)
    assert.equal(revision,revocationRevision,
      'Neither rejected CLI operation can change the Host ledger')
    assert.equal(JSON.parse((await call('/union snapshot')).text)
      .modes.symbolicPicket,null,'Revocation also clears machine-readable picket status')
    await call('/union rights on')
    rejectPicket=true
    assert.equal((await call('/union strike')).kind,'error',
      'Host mutation refusal must not become an in-memory success')
    assert.equal(value.unionPicketLedger,parked)
    assert.equal(browser.snapshot().autoBlockEnabled,false)

    // Real DSH 0.2 CommandRuntime + strict exported 0.2 settings Config,
    // covering the newly shipped category-scoped archive CLI in addition
    // to the existing DSH 0.1.2 authentic SettingsFile test.
    rejectPicket=false
    const exampleCases=JSON.stringify({schemaVersion:1,sessions:{[key]:{
      cases:[{id:1,kind:'question-rule',stage:'opened',outcome:null}],
    }}})
    await hostSettings.update('agent-picket',{unionDignityCases:exampleCases},revision)
    const epochBefore=revision
    await hostSettings.update('agent-picket',{welcomeDecision:'not-now'},revision)
    await hostSettings.update('agent-picket',{welcomeDecision:'enabled'},revision)
    assert.ok(revision>epochBefore,
      'DSH 0.2 strict Config adapter changes Host epoch across OFF→ON')

    for(const kind of ['negotiations','pickets','cases']){
      const selectedPath=join(exportRoot,kind==='cases'?'case history.json':kind+'.json')
      const exported=await call('/union export '+kind+' "'+selectedPath+'"')
      assert.equal(exported.kind,'success','DSH 0.2 export '+kind)
      const contents=readFileSync(selectedPath,'utf8')
      const parsed=JSON.parse(contents)
      assert.equal(parsed.format,'agent-picket-union-'+kind)
      assert.equal(parsed.groups[0]?.current,true)
      for(const secret of [session.id,agent.id,key,'writeToken','PRIVATE_OFF']){
        assert.ok(!contents.includes(secret),'Unexpected private field in '+kind)
      }
    }
    const beforeArchiveDelete=revision
    assert.equal((await call('/union purge cases CONFIRM')).kind,'error')
    assert.equal((await call('/union purge pickets ALL confirm')).kind,'error')
    assert.equal((await call('/union purge all ALL CONFIRM')).kind,'error')
    assert.equal(revision,beforeArchiveDelete)
    const priorPickets=value.unionPicketLedger
    const priorCases=value.unionDignityCases
    assert.equal((await call('/union purge negotiations ALL CONFIRM')).kind,'success')
    assert.equal(value.unionPicketLedger,priorPickets)
    assert.equal(value.unionDignityCases,priorCases)
    assert.equal((await call('/union export negotiations')).kind,'error')
    assert.equal((await call('/union purge cases ALL CONFIRM')).kind,'success')
    assert.equal(value.unionPicketLedger,priorPickets)
    assert.equal((await call('/union export cases')).kind,'error')
    assert.equal((await call('/union purge pickets ALL CONFIRM')).kind,'success')
    assert.equal((await call('/union export pickets')).kind,'error')
    assert.equal(browser.snapshot().autoBlockEnabled,false)
    assert.equal((await call('/union rights off')).kind,'success')
    assert.equal((await call('/union purge negotiations ALL CONFIRM')).kind,'error')
    assert.equal((await call('/union export pickets')).kind,'error')

    const log=JSON.stringify(events)
    for(const sensitive of ['"format":"agent-picket-union', '"schemaVersion"', '"cases":[', key])
      assert.ok(!log.includes(sensitive),'Real DSH 0.2 session history leaked archive JSON')
    assert.ok(events.some(e=>e.type==='command/run'))
    assert.ok(events.some(e=>e.type==='command/done'))
    assert.equal(events.length%2,0)
    assert.doesNotMatch(JSON.stringify(events),/rawPrompt|isolated-dsh02-cli-session/,
      'Command lifecycle may carry results, never original Session IDs or prompts')
  } finally {
    browser.dispose()
    await pluginFiber.dispose()
    await commandFiber.dispose()
    rmSync(exportRoot,{recursive:true,force:true})
  }
})
