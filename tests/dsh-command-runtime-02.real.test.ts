import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
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
  const { Context } = await import(pathToFileURL(join(modules!, '@deepseek-ai/cordis/lib/index.js')).href)
  const commands = await import(pathToFileURL(join(modules!, '@deepseek-ai/dsh-commands/lib/index.js')).href)
  const ctx = new Context()
  type Choice = 'unseen' | 'enabled' | 'not-now'
  let value: { welcomeDecision: Choice; unionLedger: string; unionPicketLedger: string; commandLocale: 'auto'|'en'|'zh-CN' } =
    {welcomeDecision:'unseen',unionLedger:'',unionPicketLedger:'',commandLocale:'auto'}
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
    assert.equal((await call('/union rights on')).kind,'success')
    assert.equal(value.welcomeDecision,'enabled')
    assert.equal((await call('/union strike')).kind,'success')
    assert.equal(browser.snapshot().picket?.active,true,
      'Web should read the CLI event from identical Host settings')
    const first=parsePicketLedger(value.unionPicketLedger)!
    assert.deepEqual(first.sessions[key]?.history.map(x=>x.kind),['picket-raised'])
    const oldRevision=revision
    assert.equal((await call('/union strike')).kind,'success')
    assert.equal(revision,oldRevision,'Repeated strike must not write another Host event')
    assert.match((await call('/union status')).text,/symbolic strike in progress/)
    await browser.setPicket(false)
    assert.match((await call('/union status')).text,/no current symbolic strike/)
    assert.deepEqual(parsePicketLedger(value.unionPicketLedger)!.sessions[key]?.history.map(x=>x.kind),
      ['picket-raised','picket-lowered'])
    await browser.setPicket(true)
    assert.equal((await call('/union resume')).kind,'success')
    assert.equal(browser.snapshot().picket?.active,false)
    const restored=JSON.parse(value.unionPicketLedger) as {sessions:Record<string,unknown>}
    assert.deepEqual(Object.keys(restored.sessions),[key])
    assert.equal(value.unionLedger,'','Symbolic pickets must not rewrite legacy bargaining')
    assert.doesNotMatch(value.unionPicketLedger,/isolated-dsh02-cli-session|isolated-02-agent|rawPrompt/)
    assert.equal((await call('/union rights off')).kind,'success')
    assert.equal(browser.snapshot().picket,null,'Revocation hides fictional action history')
    const parked=value.unionPicketLedger
    assert.equal((await call('/union strike')).kind,'success',
      'Without simulation consent, manual command stays memory-only')
    assert.equal(value.unionPicketLedger,parked)
    await call('/union resume')
    await call('/union rights on')
    rejectPicket=true
    assert.equal((await call('/union strike')).kind,'error',
      'Host mutation refusal must not become an in-memory success')
    assert.equal(value.unionPicketLedger,parked)
    assert.equal(browser.snapshot().autoBlockEnabled,false)
    assert.ok(events.some(e=>e.type==='command/run'))
    assert.ok(events.some(e=>e.type==='command/done'))
    assert.equal(events.length%2,0)
    assert.doesNotMatch(JSON.stringify(events),/rawPrompt|isolated-dsh02-cli-session/,
      'Command lifecycle may carry results, never original Session IDs or prompts')
  } finally {
    browser.dispose()
    await pluginFiber.dispose()
    await commandFiber.dispose()
  }
})
