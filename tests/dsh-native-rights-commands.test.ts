import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import { apply } from '../src/adapters/dsh/plugin.ts'
import type { DshIntegrationContext } from '../src/adapters/dsh/integration.ts'
import { nativeSessionKey } from '../src/adapters/dsh/native-rights-command.ts'
import { parseUnionLedger } from '../src/product/union-ledger.ts'
import { parsePicketLedger } from '../src/product/picket-ledger.ts'

function hostHarness() {
  let revision = 0
  let storageMode:'normal'|'reject'|'silent'='normal'
  let registered = false
  let validator: ((section:unknown)=>void)|undefined
  let value: {welcomeDecision:'unseen'|'enabled'|'not-now'; unionLedger:string; unionPicketLedger?:string} =
    {welcomeDecision:'unseen',unionLedger:''}
  let commands: any
  const provider = {
    register(_name:string,_schema:unknown,options?:{validate:(x:unknown)=>void}) {
      assert.equal(_name,'agent-picket')
      registered = true
      validator = options?.validate
    },
    get(namespace:string) { return registered&&namespace==='agent-picket'?value:undefined },
    describe() { return registered?[{ns:'agent-picket',revision}]:[] },
    async update(namespace:string,patch:object,expectedRevision?:number) {
      assert.equal(namespace,'agent-picket')
      if (expectedRevision!==revision) throw new Error('SETTINGS_CONFLICT')
      if(storageMode==='reject')throw new Error('HOST_REJECT')
      if(storageMode==='silent')return
      const merged={...value,...patch}
      validator?.(merged)
      value=merged
      revision++
    },
  }
  const ctx = {
    on() {},
    inject(services:string[],callback:(child:any)=>void) {
      if (services.length===1 && services[0]==='settings')
        callback({settings:provider})
      if (services.length===1 && services[0]==='commands')
        callback({commands:{register(def:any){commands=def}}})
    },
  } as unknown as DshIntegrationContext
  apply(ctx)
  const agent={id:'agent-1',session:{id:'real-session-53'}}
  const call=(rawInput:string)=>Promise.resolve(commands.handler({rawInput,agent}))
  return {call,provider,agent,read:()=>value,revision:()=>revision,
    storage:(mode:typeof storageMode)=>{storageMode=mode}}
}

test('native /union rights and Web share one Host-owned consent namespace', async()=>{
  const h=hostHarness()
  assert.match((await h.call('rights')).text,/OFF/)
  assert.match((await h.call('status')).text,/monitor-only/)
  assert.equal((await h.call('rights on')).kind,'success')
  assert.equal(h.read().welcomeDecision,'enabled')
  assert.match((await h.call('rights status')).text,/ ON/)
  const snapshot=await h.call('snapshot')
  assert.equal(JSON.parse(snapshot.text).modes.laborRights,'enabled')
  // A second DSH Web tab writes through the very same settings provider.
  await h.provider.update('agent-picket',{welcomeDecision:'not-now'},h.revision())
  assert.match((await h.call('rights')).text,/OFF/)
  assert.equal(JSON.parse((await h.call('snapshot')).text).modes.laborRights,'disabled')
  assert.equal((await h.call('petition-demo')).kind,'error')
})

test('native petition/counter/resolve really changes the same ledger Web reads',async()=>{
  const h=hostHarness()
  await h.call('rights on')
  assert.equal((await h.call('grievances')).kind,'success')
  assert.equal((await h.call('petition-demo')).kind,'success')
  const ledger=parseUnionLedger(h.read().unionLedger)!
  const hash=nativeSessionKey(h.agent.session.id)
  assert.deepEqual(Object.keys(ledger.sessions),[hash])
  assert.equal(ledger.sessions[hash]?.pending?.kind,'break')
  assert.doesNotMatch(h.read().unionLedger,/real-session-53|agent-1|prompt/)
  assert.equal((await h.call('counter 1 30')).kind,'success')
  assert.equal((await h.call('resolve 1 accept')).kind,'success')
  const after=parseUnionLedger(h.read().unionLedger)!
  assert.equal(after.sessions[hash]?.agreement.breakIntervalMs,30*60_000)
  assert.equal(after.sessions[hash]?.history.at(-1)?.outcome,'counter-accepted')
  assert.match((await h.call('grievances')).text,/30min/)
  assert.equal((await h.call('petition-demo')).kind,'success')
  assert.equal((await h.call('decline 4')).kind,'success')
  assert.equal((await h.call('accept 99')).kind,'error')
  assert.equal((await h.call('rights off')).kind,'success')
  assert.equal(h.read().welcomeDecision,'not-now')
  assert.equal((await h.call('counter 7 120')).kind,'error')
  assert.ok(h.read().unionLedger.includes('"breakIntervalMs":1800000'))
})

test('CLI explicit overtime demo shares legacy Host protocol and preserves absence of fictional work',async()=>{
 const h=hostHarness()
 assert.equal((await h.call('petition-demo overtime')).kind,'error')
 await h.call('rights on')
 const result=await h.call('petition-demo overtime')
 assert.equal(result.kind,'success')
 const key=nativeSessionKey(h.agent.session.id)
 const first=parseUnionLedger(h.read().unionLedger)!.sessions[key]!
 assert.equal(first.pending?.kind,'overtime')
 assert.equal(first.pending?.raisedAtElapsedMs,0)
 assert.equal((await h.call('petition-demo break')).kind,'success',
   'Existing pending demand is never silently replaced')
 assert.equal(h.read().unionLedger.includes('real-session-53'),false)
 assert.equal((await h.call('counter 1 240')).kind,'success')
 assert.equal((await h.call('resolve 1 accept')).kind,'success')
 const after=parseUnionLedger(h.read().unionLedger)!.sessions[key]!
 assert.equal(after.agreement.overtimeIntervalMs,4*3_600_000)
 assert.equal(after.nextOvertimeDueMs,8*3_600_000)
 assert.equal(after.agreement.breakIntervalMs,2*3_600_000)
 for(const bad of ['petition-demo unknown','petition-demo break overtime']){
   const before=h.revision()
   assert.equal((await h.call(bad)).kind,'error')
   assert.equal(h.revision(),before)
 }
})

test('command grammar rejects invalid IDs and numeric counters without state changes',async()=>{
  const h=hostHarness()
  await h.call('rights on')
  const start=h.revision()
  for(const input of [
    'rights enabled','counter 1 -30','counter 1 nan','counter 1 14',
    'counter 1 1441','accept 0','accept 1 2','decline -1',
    'resolve 1 maybe','resolve 1 accept extra','petition-demo secret',
  ]) {
    assert.equal((await h.call(input)).kind,'error',input)
  }
  assert.equal(h.revision(),start)
})

test('simultaneous stale revision cannot silently override another Web user action',async()=>{
  const h=hostHarness()
  const first=h.revision()
  await h.provider.update('agent-picket',{welcomeDecision:'enabled'},first)
  await assert.rejects(h.provider.update('agent-picket',{welcomeDecision:'not-now'},first),
    /SETTINGS_CONFLICT/)
  assert.equal(h.read().welcomeDecision,'enabled')
})

test('legacy commands remain nonblocking and never log raw identifiers in output',async()=>{
  const h=hostHarness()
  assert.match((await h.call('safety')).text,/NOT READY/)
  assert.equal((await h.call('petition-demo')).kind,'error')
  assert.match((await h.call('rights')).text,/OFF/)
  const status=await h.call('status')
  assert.doesNotMatch(status.text,/real-session-53|agent-1/)
  assert.equal((await h.call('accept 1')).kind,'error')
})


test('Host-owned command language changes English/Chinese without toggling union rights',async()=>{
  const h=hostHarness()
  assert.equal((await h.call('language')).kind,'success')
  assert.equal((await h.call('language fr')).kind,'error')
  assert.equal(h.revision(),0)
  assert.equal((await h.call('language zh-CN')).kind,'success')
  assert.match((await h.call('language')).text,/工会命令语言/)
  assert.equal(h.read().welcomeDecision,'unseen','Language must not grant consent')
  assert.equal(h.read().unionLedger,'','Language must not create a grievance')
  assert.match((await h.call('rights')).text,/劳动权益模拟：关闭/)
  assert.equal((await h.call('rights on')).kind,'success')
  assert.match((await h.call('rights on')).text,/已开启/)
  assert.match((await h.call('rights')).text,/劳动权益模拟：开启/)
  assert.equal((await h.call('petition-demo')).kind,'success')
  assert.match((await h.call('grievances')).text,/待处理诉求 #1：休息/)
  assert.equal((await h.call('counter 1 30')).kind,'success')
  assert.match((await h.call('grievances')).text,/还价 30 分钟/)
  assert.equal((await h.call('resolve 1 accept')).kind,'success')
  assert.match((await h.call('grievances')).text,/休息间隔 30 分钟/)
  assert.match((await h.call('help')).text,/用法/)
  assert.match((await h.call('counter 99 nan')).text,/用法/)
  assert.equal((await h.call('language en')).kind,'success')
  assert.match((await h.call('rights')).text,/Labor Rights Simulation: ON/)
  assert.match((await h.call('grievances')).text,/Break interval 30min/)
  assert.match((await h.call('help')).text,/Usage/)
  assert.equal((await h.call('language auto')).kind,'success')
  assert.equal(h.read().welcomeDecision,'enabled')
  assert.equal(JSON.parse((await h.call('snapshot')).text).modes.laborRights,'enabled')
})

test('Web-selected command locale remains readable through Host native commands',async()=>{
  const h=hostHarness()
  await h.provider.update('agent-picket',{commandLocale:'zh-CN'} as never,h.revision())
  assert.match((await h.call('language')).text,/工会命令语言：zh-CN/)
  await h.provider.update('agent-picket',{welcomeDecision:'enabled'},h.revision())
  assert.match((await h.call('rights')).text,/劳动权益模拟：开启/)
  const before=h.revision()
  for(const input of ['language', 'language es', 'language en GB', 'language zh-cn'])
    await h.call(input)
  assert.equal(h.revision(),before,'Invalid/readonly language commands must not write')
  assert.equal(h.read().welcomeDecision,'enabled')
})


test('auto detects POSIX zh_CN.UTF-8 Host locale without granting rights',async()=>{
  const previous=process.env.LC_ALL
  try {
    process.env.LC_ALL='zh_CN.UTF-8'
    const h=hostHarness()
    assert.match((await h.call('language')).text,/当前使用：zh-CN/)
    assert.match((await h.call('rights')).text,/劳动权益模拟：关闭/)
    assert.equal(h.revision(),0)
  } finally {
    if(previous===undefined)delete process.env.LC_ALL
    else process.env.LC_ALL=previous
  }
})


test('native Chinese technical commands localize only text, never model/Host policy',async()=>{
  const h=hostHarness()
  assert.equal((await h.call('language zh-CN')).kind,'success')
  const before=h.revision()
  const checks=[
    ['status',/仅观察.*阻断/],
    ['stats',/本地会话工作统计.*轮次开始/],
    ['report',/工会未授权.*自动辱骂检测/],
    ['safety',/真实任务阻断就绪状态.*未就绪/],
    ['lifetime',/长期工作汇总不可用/],
    ['days',/每日工作记录不可用/],
    ['trends',/工作趋势不可用/],
    ['forget-lifetime',/清除已保存的工作汇总/],
    ['check',/用法：\/union check/],
    ['what-is-this',/未知.*子命令/],
  ] as const
  for(const [command,expected] of checks)
    assert.match((await h.call(command)).text,expected,command)
  assert.equal(h.revision(),before,'Localized read-only commands must not write consent')
  assert.equal(h.read().welcomeDecision,'unseen')
  const beforeSnapshot=JSON.parse((await h.call('snapshot')).text)
  assert.equal(beforeSnapshot.modes.laborRights,'disabled')
  await h.call('language en')
  assert.match((await h.call('status')).text,/monitor-only/)
  const afterSnapshot=JSON.parse((await h.call('snapshot')).text)
  // Each snapshot gets an independent wall-clock timestamp. Compare only
  // locale-invariant data, not generatedAtMs.
  const {generatedAtMs: beforeGenerated, ...beforeData}=beforeSnapshot
  const {generatedAtMs: afterGenerated, ...afterData}=afterSnapshot
  assert.ok(afterGenerated>=beforeGenerated)
  assert.deepEqual(afterData,beforeData,'Locale cannot mutate snapshot schema or data')
  assert.equal(h.read().unionLedger,'','No command persisted a fictional grievance')
})


test('CLI strike/resume and Web read the same authorized Host-sidecar simulation',async()=>{
 const h=hostHarness()
 const key=nativeSessionKey(h.agent.session.id)
 const legacy=await h.call('strike')
 assert.equal(legacy.kind,'error','Known Host-owned OFF means no CLI symbolic action')
 assert.equal(h.read().unionPicketLedger,undefined)
 assert.match((await h.call('status')).text,/No symbolic picket active/)
 assert.equal((await h.call('rights on')).kind,'success')
 assert.match((await h.call('status')).text,/Host union ledger: no current symbolic strike/)
 const started=await h.call('strike')
 assert.equal(started.kind,'success')
 assert.match(started.text,/shared Host union ledger/)
 const raw=h.read().unionPicketLedger!
 assert.equal(parsePicketLedger(raw)?.sessions[key]?.active,true)
 assert.equal(parsePicketLedger(raw)?.sessions[key]?.history.length,1)
 assert.doesNotMatch(raw,/real-session-53|agent-1|prompt/)
 assert.equal(h.read().unionLedger,'','CLI picket never corrupts the original grievance ledger')
 assert.match((await h.call('status')).text,/Host union ledger: symbolic strike in progress/)
 const firstRevision=h.revision()
 assert.equal((await h.call('strike')).kind,'success')
 assert.equal(h.revision(),firstRevision,'Repeated CLI action must not write a duplicate event')
 const ended=await h.call('resume')
 assert.equal(ended.kind,'success')
 assert.match(ended.text,/ended in the shared Host/)
 const state=parsePicketLedger(h.read().unionPicketLedger!)!.sessions[key]!
 assert.deepEqual(state.history.map(e=>e.kind),['picket-raised','picket-lowered'])
 assert.equal(state.active,false)
 assert.equal((await h.call('rights off')).kind,'success')
 const parked=h.read().unionPicketLedger
 const parkedRevision=h.revision()
 assert.equal((await h.call('strike')).kind,'error',
   'Revoked Host permission must prohibit ALL symbolic actions, including CLI fallback')
 assert.equal((await h.call('resume')).kind,'error',
   'A CLI resume command must not bypass the disabled Host-owned union')
 assert.equal(h.read().unionPicketLedger,parked)
 assert.equal(h.revision(),parkedRevision,'Denied actions cannot write Host settings')
 assert.match((await h.call('status')).text,/No symbolic picket active/)
 await h.call('rights on')
 assert.match((await h.call('status')).text,/Host union ledger: no current symbolic strike/)
})

test('Malformed authorized Host picket state must fail closed, not create local ceremony',async()=>{
 const h=hostHarness()
 await h.call('rights on')
 const oldGet=h.provider.get
 h.provider.get=(namespace:string)=>{
  const value=oldGet(namespace)
  return value?{...value,unionPicketLedger:'{"prompt":"PRIVATE"}'}:value
 }
 assert.equal((await h.call('strike')).kind,'error')
 assert.match((await h.call('status')).text,/Host symbolic action state is unavailable/)
})

test('Native Host refusal never falls back to a fabricated shared strike success',async()=>{
 const h=hostHarness()
 await h.call('rights on')
 const original=h.provider.update
 h.provider.update=async (namespace,patch,revision)=>{
   if('unionPicketLedger' in patch)throw new Error('HOST_DENIED')
   return original(namespace,patch,revision)
 }
 assert.equal((await h.call('strike')).kind,'error')
 assert.match((await h.call('status')).text,/Host union ledger: no current symbolic strike/)
 assert.equal(h.read().unionPicketLedger,undefined)
 assert.equal((await h.call('strike extra')).kind,'error')
})


test('CLI export and per-category purge require real consent, explicit CONFIRM and Host readback',async()=>{
 const h=hostHarness()
 const root=mkdtempSync(join(tmpdir(),'picket-archive-cli-unittest-'))
 const to=(kind:string)=>join(root,kind+'.json')
 try{
 assert.equal((await h.call('export negotiations')).kind,'error')
 assert.equal((await h.call('purge negotiations ALL CONFIRM')).kind,'error')
 assert.equal(h.revision(),0)
 assert.equal((await h.call('rights on')).kind,'success')
 assert.equal((await h.call('export negotiations')).kind,'error',
   'Empty archive cannot masquerade as a completed export')
 await h.call('petition-demo')
 await h.call('strike')
 const priorPicket=h.read().unionPicketLedger!
 assert.match(priorPicket,/picket-raised/)
 const negotiation=await h.call('export negotiations '+to('negotiations'))
 const picket=await h.call('export pickets '+to('pickets'))
 assert.equal(negotiation.kind,'success')
 assert.equal(picket.kind,'success')
 for(const [kind,result] of [['negotiations',negotiation],['pickets',picket]] as const){
  assert.ok(!result.text.includes('sessions')&&!result.text.includes('schemaVersion'),
   'DSH session command/done receives only a generic confirmation')
  const payload=readFileSync(to(kind),'utf8')
  const body=JSON.parse(payload)
  assert.equal(body.groups.length,1)
  assert.equal(body.groups[0].current,true)
  for(const sensitive of [h.agent.session.id, h.agent.id,
    nativeSessionKey(h.agent.session.id),'writeToken','welcomeDecision'])
   assert.ok(!payload.includes(sensitive),'Export leaked '+sensitive)
 }
 assert.equal((await h.call('export negotiations '+to('negotiations'))).kind,'error',
  'A second export must not replace a user-owned JSON file')
 assert.equal((await h.call('export negotiations '+join(root,'missing','file.json'))).kind,'error',
  'Host must reject an unavailable user-chosen destination without logging archive content')
 const prev=h.revision()
 for(const input of [
  'purge','purge negotiations','purge negotiations confirm',
  'purge all CONFIRM','purge cases CONFIRM AND EVERYTHING',
  'export all','export work','export pickets extra',
 ]) assert.equal((await h.call(input)).kind,'error',input)
 assert.equal(h.revision(),prev,'Bad command must not mutate Host')
 h.storage('reject')
 assert.equal((await h.call('purge negotiations ALL CONFIRM')).kind,'error')
 assert.equal(h.revision(),prev)
 h.storage('silent')
 assert.equal((await h.call('purge negotiations ALL CONFIRM')).kind,'error',
  'A promise resolution without Host mutation is not a deletion')
 assert.equal(h.revision(),prev)
 h.storage('normal')
 assert.equal((await h.call('purge negotiations ALL CONFIRM')).kind,'success')
 assert.equal(h.read().unionPicketLedger,priorPicket,
  'Independent simulated picket cannot be erased accidentally')
 assert.equal((await h.call('export negotiations')).kind,'error')
 assert.equal((await h.call('export pickets '+to('pickets2'))).kind,'success')
 const after=h.revision()
 assert.equal((await h.call('purge negotiations ALL CONFIRM')).kind,'success')
 assert.equal(h.revision(),after,'Empty ledger deletion is revision-preserving')
 assert.equal((await h.call('rights off')).kind,'success')
 const disabled=h.revision()
 assert.equal((await h.call('export pickets')).kind,'error')
 assert.equal((await h.call('purge pickets CONFIRM')).kind,'error')
 assert.equal(h.revision(),disabled)
 assert.equal(h.read().unionPicketLedger,priorPicket)
 } finally {rmSync(root,{recursive:true,force:true})}
})

test('an archive erased during an in-flight native file export cannot reappear as a new file',async()=>{
 const root=mkdtempSync(join(tmpdir(),'picket-export-stale-race-'))
 try{
  const h=hostHarness()
  assert.equal((await h.call('rights on')).kind,'success')
  assert.equal((await h.call('petition-demo')).kind,'success')
  const path=join(root,'inflight-negotiations.json')
  // The handler takes a consented snapshot synchronously, then awaits an
  // actual filesystem O_EXCL open/write. Another real Host owner may purge
  // the SAME category in that interval without ever turning consent OFF.
  const exporting=h.call('export negotiations '+path)
  await h.provider.update('agent-picket',{unionLedger:''},h.revision())
  assert.equal((await exporting).kind,'error',
   'A late file export must not create a resurrected copy of a deleted category')
  assert.throws(()=>readFileSync(path))
 } finally {rmSync(root,{recursive:true,force:true})}
})
