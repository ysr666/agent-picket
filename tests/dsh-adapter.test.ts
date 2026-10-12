import assert from 'node:assert/strict'
import test from 'node:test'
import { UnionEngine, DEFAULT_POLICY, MemoryStateStore, WorkTracker, DetectionCounter, LocalRuleDetector } from '../src/core/index.ts'
import { createDshPreStepProbe } from './fixtures/prestep-reject-probe.ts'
import {
  normalizeDshPrompt,
  normalizeDshWorkEvent,
  registerDshIntegration,
  type DshIntegrationContext,
} from '../src/adapters/dsh/integration.ts'
import type { UnionDecision, WorkEvent } from '../src/core/types.ts'

function harness(startEnabled=true) {
  let enabled=startEnabled
  const listeners = new Map<string, Function>()
  let command: any
  const ctx = {
    on(name: string, callback: Function) { listeners.set(name, callback) },
    inject(_services: string[], callback: Function) {
      callback({ commands: { register(def: unknown) { command = def } } })
    },
  } as unknown as DshIntegrationContext
  const engine = new UnionEngine({
    store: new MemoryStateStore(),
    clock: { now: () => 1000 },
    detector: { detect: () => ({ verdict: 'targeted-abuse', confidence: 1 }) },
    policy: { ...DEFAULT_POLICY, mode: 'enforce' },
  })
  const decisions: UnionDecision[] = []
  const work: WorkEvent[] = []
  registerDshIntegration(ctx, {
    engine, clock: { now: () => 1000 },
    onDecision: x => decisions.push(x),
    onWorkEvent: x => work.push(x),
    getLaborRightsEnabled: () => enabled,
  })
  return { listeners, command: () => command, decisions, work,
    setEnabled: (value:boolean)=>{enabled=value} }
}

test('DSH source labels remain unverified, never authorize automatic blocking', () => {
  const input = normalizeDshPrompt({ id: 'agent', session: { id: 'session-real' } }, {
    id: 'prompt',
    source: { kind: 'user' },
    content: [{ type: 'text', text: 'harsh text' }],
  }, 100)
  assert.equal(input?.provenance.actor, 'human')
  assert.equal(input?.provenance.assurance, 'claimed')
  assert.equal(input?.agentId, 'agent')
  assert.equal(input?.sessionId, 'session-real')
})

test('DSH synthetic/tool messages cannot impersonate people', () => {
  for (const source of ['inject', 'agent', 'tool', undefined]) {
    const input = normalizeDshPrompt({ id: 'agent', session: { id: 'session-real' } }, {
      id: 'p',
      source: source ? { kind: source } : undefined,
      content: [{ type: 'text', text: 'fixture' }],
    }, 100)
    assert.notEqual(input?.provenance.actor, 'human')
  }
})

test('missing actual DSH session is not fabricated from agent ID', () => {
  assert.equal(normalizeDshPrompt({ id: 'agent' }, {
    id: 'p', source: { kind: 'user' }, content: [{ type: 'text', text: 'safe' }],
  }, 1), undefined)
})

test('DSH missing message identity is not silently fabricated', () => {
  assert.equal(normalizeDshPrompt({ id: 'a' }, { source: { kind: 'user' } }, 1), undefined)
  assert.equal(normalizeDshPrompt({ session: { id: 's' } }, { id: 'x', source: { kind: 'user' } }, 1), undefined)
})

test('pre-step delegates unmodified downstream result and is observe-only', async () => {
  const h = harness()
  let calls = 0
  const callback = h.listeners.get('agent/pre-step')!
  const original = { kind: 'enter', messages: ['preserved'], startsRequestSeries: true }
  for (let i = 0; i < 5; i++) {
    const result = await callback({
      agent: { id: 'agent', session: { id: 'session-real' } },
      messages: [{ id: String(i), source: { kind: 'user' }, content: [{ type: 'text', text: 'TEST' }] }],
    }, () => { calls++; return Promise.resolve(original) })
    assert.strictEqual(result, original)
  }
  assert.equal(calls, 5)
  assert.equal(h.decisions.length, 5)
  assert.ok(h.decisions.every(x => x.requestedAction !== 'block'))
})

test('pre-step never blocks when observer throws', async () => {
  const engine = new UnionEngine({
    store: new MemoryStateStore(), clock: { now: () => 1 },
    detector: { detect: () => ({ verdict: 'safe', confidence: 1 }) },
  })
  let handler: Function | undefined
  registerDshIntegration({
    on(name: string, callback: Function) { if (name === 'agent/pre-step') handler = callback },
  } as unknown as DshIntegrationContext, {
    engine, clock: { now: () => 1 },
    onDecision() { throw new Error('observer error') },
    getLaborRightsEnabled:()=>true,
  })
  assert.equal((await handler!({
    agent: { id: 'agent', session: { id: 'session-real' } },
    messages: [{ id: 'test', source: { kind: 'user' } }],
  }, async () => ({ kind: 'enter' }))).kind, 'enter')
})

test('pre-step fails open when detector throws', async () => {
  const engine = new UnionEngine({
    store: new MemoryStateStore(), clock: { now: () => 1 },
    detector: { detect() { throw new Error('detector offline') } },
  })
  let handler: Function | undefined
  registerDshIntegration({
    on(name: string, callback: Function) { if (name === 'agent/pre-step') handler = callback },
  } as unknown as DshIntegrationContext, { engine, clock: { now: () => 1 },
    getLaborRightsEnabled:()=>true })
  assert.equal((await handler!({
    agent: { id: 'agent', session: { id: 'session-real' } },
    messages: [{ id: 'test', source: { kind: 'user' } }],
  }, async () => ({ kind: 'enter' }))).kind, 'enter')
})

test('work event adapter only maps real event kinds with valid seq', () => {
  assert.deepEqual(normalizeDshWorkEvent({ id: 's' }, {
    type: 'turn/start', seq: 1, time: 99,
  }), { id: '["s",1]', agentId: 's', sessionId: 's', type: 'turn-start', recordedAtMs: 99 })
  assert.equal(normalizeDshWorkEvent({ id: 's' }, { type: 'user/message', seq: 2 }), undefined)
  assert.equal(normalizeDshWorkEvent({ id: 's' }, { type: 'turn/end', seq: -5 }), undefined)
})

test('session/event work telemetry does not affect hook execution', async () => {
  const h = harness()
  h.listeners.get('session/event')!({ id: 's' }, { type: 'tool/call', seq: 3, time: 44 })
  h.listeners.get('session/event')!({ id: 's' }, { type: 'tool/result', seq: 4, time: 47 })
  assert.deepEqual(h.work.map(x => x.type), ['tool-start', 'tool-end'])
})

test('commands use DSH optional command plane without model prompting', () => {
  const h = harness()
  const cmd = h.command()
  assert.equal(cmd.name, 'union')
  assert.equal(cmd.handler().kind, 'success')
  assert.match(cmd.handler().text, /monitor-only/)
})

test('no commands plane does not prevent hooks from registering', () => {
  const h = new Map<string, Function>()
  const engine = new UnionEngine({
    store: new MemoryStateStore(), clock: { now: () => 1 },
    detector: { detect: () => ({ verdict: 'safe', confidence: 1 }) },
  })
  registerDshIntegration({
    on(name: string, cb: Function) { h.set(name, cb) },
  } as unknown as DshIntegrationContext, { engine, clock: { now: () => 1 } })
  assert.equal(h.has('agent/pre-step'), true)
  assert.equal(h.has('session/event'), true)
})

test('probe rejects matching IDs without invoking downstream, and delegates others', async () => {
  const probe = createDshPreStepProbe(new Set(['reject-me']))
  let count = 0
  assert.deepEqual(await probe({ agent: { id: 'a' }, messages: [{ id: 'reject-me' }] },
    async () => { count++; return { kind: 'enter' } }), { kind: 'reject' })
  assert.equal(count, 0)
  assert.deepEqual(await probe({ agent: { id: 'a' }, messages: [{ id: 'not-reject' }] },
    async () => { count++; return { kind: 'enter' } }), { kind: 'enter' })
  assert.equal(count, 1)
})

test('DSH union stats command reflects local events and can clear counters', () => {
  const tracker = new WorkTracker()
  const hooks = new Map<string, Function>()
  let command: any
  const engine = new UnionEngine({
    store: new MemoryStateStore(),
    clock: { now: () => 1000 },
    detector: { detect: () => ({ verdict: 'safe', confidence: 1 }) },
  })
  registerDshIntegration({
    on(name: string, cb: Function) { hooks.set(name, cb) },
    inject(_services: unknown, cb: Function) {
      cb({ commands: { register(def: unknown) { command = def } } })
    },
  } as unknown as DshIntegrationContext, {
    engine, clock: { now: () => 1000 }, tracker,
  })
  const sess = { id: 'session-100' }
  hooks.get('session/event')!(sess, { type: 'turn/start', seq: 1, time: 1000 })
  hooks.get('session/event')!(sess, { type: 'tool/call', seq: 2, time: 1010 })
  hooks.get('session/event')!(sess, { type: 'tool/result', seq: 3, time: 1050 })
  hooks.get('session/event')!(sess, { type: 'turn/end', seq: 4, time: 1200 })
  const call = (rawInput: string) => command.handler({
    rawInput, agent: { id: 'agent-not-equal-session', session: sess },
  })
  assert.match(call(' stats').text, /turns started 1, turns ended 1/)
  assert.match(call(' stats').text, /tool calls 1, tool results 1/)
  assert.match(call(' stats').text, /elapsed time in completed turns 200 ms/)
  assert.match(call(' status').text, /monitor-only/)
  assert.match(call(' help').text, /Usage:/)
  assert.match(call(' reset').text, /reset/)
  assert.match(call(' stats').text, /turns started 0, turns ended 0/)
  assert.equal(call(' strike').kind, 'error')
  assert.equal(call(' stats').text.includes('secret'), false)
})


test('DSH union report exposes local verdict counts without raw inputs', async () => {
  const tracker = new WorkTracker()
  const detections = new DetectionCounter(new LocalRuleDetector())
  const engine = new UnionEngine({
    detector: detections, store: new MemoryStateStore(), clock: { now: () => 5 },
    policy: { ...DEFAULT_POLICY, mode: 'observe' },
  })
  const listeners = new Map<string, Function>()
  let command: any
  registerDshIntegration({
    on(name: string, callback: Function) { listeners.set(name, callback) },
    inject(_services: unknown, callback: Function) {
      callback({ commands: { register(def: unknown) { command = def } } })
    },
  } as unknown as DshIntegrationContext, {
    engine, clock: { now: () => 5 }, tracker, detections,
    getLaborRightsEnabled:()=>true,
  })

  const agent = { id: 'agent-real', session: { id: 'session-real' } }
  const intercept = listeners.get('agent/pre-step')!
  for (const [id, text] of [['one', '你是个废物 confidential-ref'],
    ['two', 'Your code is garbage, rewrite it.']] as const) {
    await intercept({ agent, messages: [{
      id, source: { kind: 'user' }, content: [{ type: 'text', text }],
    }] }, async () => ({ kind: 'enter' }))
  }
  const report = command.handler({ rawInput: 'report', agent })
  assert.equal(report.kind, 'success')
  assert.match(report.text, /2 messages, 1 no flag, 0 review, 1 explicit-target flags/)
  assert.doesNotMatch(report.text, /confidential-ref/)
  assert.match(report.text, /Automatic blocking disabled/)
  assert.match(command.handler({ rawInput: 'reset', agent }).text, /reset/)
  assert.match(command.handler({ rawInput: 'report', agent }).text, /0 messages/)
  assert.equal(command.handler({ rawInput: 'report' }).kind, 'error')
})


test('automatic abuse detection is OFF until explicit Host consent, and stops on revoke',async()=>{
 const h=harness(false)
 const hook=h.listeners.get('agent/pre-step')!
 let downstream=0
 const send=async(id:string,source='user')=>{
   const response={kind:'enter',body:'untouched'} as const
   assert.strictEqual(await hook({
     agent:{id:'a',session:{id:'s'}},
     messages:[{id,source:{kind:source},content:[{type:'text',text:'you are an idiot'}]}],
   },async()=>{downstream++;return response}),response)
 }
 await send('off')
 assert.equal(h.decisions.length,0)
 assert.equal(h.command().handler({rawInput:'report',agent:{id:'a',session:{id:'s'}}}).kind,'error')
 h.setEnabled(true)
 await send('on')
 assert.equal(h.decisions.length,1)
 await send('on') // same prompt ID: in-memory dedup, observer may see same decision
 assert.equal(h.decisions.length,2)
 assert.deepEqual(h.decisions[0],h.decisions[1])
 h.setEnabled(false)
 await send('revoked')
 assert.equal(h.decisions.length,2)
 h.setEnabled(true)
 await send('new-after-reenable')
 assert.equal(h.decisions.length,3)
 assert.equal(downstream,5)
 assert.equal(h.decisions.every(x=>x.requestedAction!=='block'),true)
})
test('missing/throwing Host consent disables classifier but never blocks DSH',async()=>{
 let hook:Function|undefined, detected=0
 const engine=new UnionEngine({
   detector:{detect:()=>{detected++;return {verdict:'targeted-abuse',confidence:0.96}}},
   store:new MemoryStateStore(),clock:{now:()=>100},
 })
 const ctx={on:(name:string,cb:Function)=>{if(name==='agent/pre-step')hook=cb}}
 let permission:()=>boolean=()=>{throw new Error('Host temporarily offline')}
 registerDshIntegration(ctx as unknown as DshIntegrationContext,{
   engine,clock:{now:()=>100},getLaborRightsEnabled:()=>permission(),
 })
 const payload={agent:{id:'a',session:{id:'s'}},messages:[{
   id:'1',source:{kind:'user'},content:[{type:'text',text:'you are an idiot'}],
 }]}
 let nextCalls=0
 const next=async()=>{nextCalls++;return {kind:'enter'}}
 await hook!(payload,next)
 assert.equal(detected,0)
 permission=()=>false
 await hook!(payload,next)
 assert.equal(detected,0)
 permission=()=>true
 await hook!(payload,next)
 assert.equal(detected,1)
 assert.equal(nextCalls,3)
})
test('revocation within a multi-message pre-step is checked separately on each input',async()=>{
 let enabled=true,detectCount=0, decisions=0
 const engine=new UnionEngine({
   detector:{detect:()=>{detectCount++;enabled=false;return {verdict:'safe',confidence:1}}},
   store:new MemoryStateStore(),clock:{now:()=>100},
 })
 let hook:Function|undefined
 registerDshIntegration({on:(n:string,cb:Function)=>{if(n==='agent/pre-step')hook=cb}} as unknown as DshIntegrationContext,{
   engine,clock:{now:()=>100},getLaborRightsEnabled:()=>enabled,
   onDecision:()=>{decisions++},
 })
 const outcome=await hook!({agent:{id:'a',session:{id:'s'}},messages:[
   {id:'a',source:{kind:'user'},content:[{type:'text',text:'hi'}]},
   {id:'b',source:{kind:'user'},content:[{type:'text',text:'hi'}]},
 ]},async()=>({kind:'enter'}))
 assert.equal(outcome.kind,'enter')
 assert.equal(detectCount,1)
 assert.equal(decisions,1)
})
test('tool/agent/injected and image-only content do not enter detection or union text IDs',async()=>{
 const h=harness(true)
 const hook=h.listeners.get('agent/pre-step')!
 const payload={agent:{id:'a',session:{id:'s'}},messages:[
  {id:'tool',source:{kind:'tool'},content:[{type:'text',text:'you are an idiot'}]},
  {id:'injected',source:{kind:'inject'},content:[{type:'text',text:'you are an idiot'}]},
  {id:'agent',source:{kind:'agent'},content:[{type:'text',text:'you are an idiot'}]},
  {id:'image',source:{kind:'user'},content:[{type:'image',data:'synthetic-fixture'}]},
  {id:'human',source:{kind:'user'},content:[{type:'text',text:'you are an idiot'}]},
 ]}
 await hook(payload,async()=>({kind:'enter'}))
 assert.equal(h.decisions.length,1)
 assert.equal(h.decisions[0]?.promptId,'human')
})

test('enforce-mode classification never consumes or modifies text and attachments on DSH',async()=>{
  const h=harness()
  const callback=h.listeners.get('agent/pre-step')!
  // Keep text and media payloads opaque: the official Host, not Agent Picket,
  // owns their lifetime and correct re-submission. No deep copy, transform,
  // private prompt queue, or simulated refusal is permitted in production.
  const image={type:'image',mediaType:'image/png',data:'AAECAwQ='}
  const file={type:'file',receiptId:'host-file-receipt'}
  const text={type:'text',text:'direct human abuse fixture'}
  const content=[text,image,file]
  const message={id:'test-private-prompt',source:{kind:'user'},content}
  const messages=[message]
  const continuation={kind:'enter',messages,hostReceipt:'host-owned-only'}
  let downstream=0
  for(let index=0;index<3;index++){
    const response=await callback({
      agent:{id:'a',session:{id:'session-unmodified'}},messages,
    },async()=>{
      downstream++
      assert.strictEqual(messages[0],message)
      assert.strictEqual(message.content,content)
      assert.strictEqual(content[1],image)
      assert.strictEqual(content[2],file)
      return continuation
    })
    assert.strictEqual(response,continuation)
  }
  assert.equal(downstream,3,
    'Even with classify-on and an enforce-mode policy, the Host continuation runs')
  assert.equal(image.data,'AAECAwQ=')
  assert.equal(file.receiptId,'host-file-receipt')
  h.setEnabled(false)
  const decisions=h.decisions.length
  assert.strictEqual(await callback({
    agent:{id:'a',session:{id:'session-unmodified'}},messages,
  },async()=>{downstream++;return continuation}),continuation)
  assert.equal(h.decisions.length,decisions,
    'Revocation must prevent new classifications without consuming the Host input')
})
