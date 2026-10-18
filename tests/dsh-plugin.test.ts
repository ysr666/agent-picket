import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, name } from '../src/adapters/dsh/plugin.ts'
import type { DshIntegrationContext } from '../src/adapters/dsh/integration.ts'

test('public plugin exports Cordis identity and remains fully monitor-only', async () => {
  assert.equal(name, 'agent-picket')
  const handlers = new Map<string, Function>()
  let command: any
  const ctx = {
    on(type: string, cb: Function) { handlers.set(type, cb) },
    inject(_services: unknown, cb: Function) {
      cb({ commands: { register(def: unknown) { command = def } } })
    },
  } as unknown as DshIntegrationContext
  apply(ctx)
  assert.equal(typeof handlers.get('agent/pre-step'), 'function')
  assert.equal(typeof handlers.get('session/event'), 'function')

  let continued = 0
  const agent = { id: 'agent', session: { id: 'one-session' } }
  for (let i=0; i<4; i++) {
    const result = await handlers.get('agent/pre-step')!({
      agent,
      messages: [{
        id: String(i), source: { kind: 'user' },
        content: [{ type: 'text', text: 'you are an idiot' }],
      }],
    }, async () => { continued++; return { kind: 'enter' } })
    assert.deepEqual(result, { kind: 'enter' })
  }
  assert.equal(continued, 4)
  const invoke = (rawInput: string) => command.handler({ rawInput, agent })
  assert.equal(invoke('report').kind,'error',
    'A plugin with no Host consent provider never invokes the classifier')
  assert.match(invoke('status').text, /monitor-only/)
  const safety = invoke('safety')
  assert.equal(safety.kind, 'success')
  assert.match(safety.text, /NOT READY/)
  assert.match(safety.text, /human-source-unverified/)
  assert.match(safety.text, /input-recovery-unverified/)
  const symbolic=invoke('strike')
  assert.equal(symbolic.kind,'error',
    'No official Host consent writer means no production symbolic action')
  assert.match(symbolic.text,/unavailable/)
  assert.match(invoke('status').text,/No symbolic picket active/)
  // A manual status flag MUST NOT change the actual pre-step continuation.
  const after=await handlers.get('agent/pre-step')!({
    agent, messages:[{id:'after-symbolic',source:{kind:'user'},content:[
      {type:'text',text:'Please fix the next bug.'},
    ]}],
  },async()=>({kind:'enter'}))
  assert.deepEqual(after,{kind:'enter'})
  assert.equal(invoke('resume').kind,'error')
  assert.match(invoke('status').text,/No symbolic picket active/)

  handlers.get('session/event')!({ id: 'one-session' }, { type: 'turn/start', seq: 1, time: 100 })
  handlers.get('session/event')!({ id: 'one-session' }, { type: 'turn/end', seq: 2, time: 150 })
  assert.match(invoke('stats').text, /elapsed time in completed turns 50 ms/)
  invoke('reset')
  assert.equal(invoke('report').kind,'error')
  assert.match(invoke('stats').text, /turns started 0/)
})

test('plugin apply can mount in headless Host without commands plane', async () => {
  let handler: Function | undefined
  apply({ on(name: string, cb: Function) { if(name==='agent/pre-step') handler = cb } } as DshIntegrationContext)
  const result = await handler!({ agent: { id:'a',session: {id:'s'} }, messages: [] }, async ()=>({kind:'enter'}))
  assert.deepEqual(result,{kind:'enter'})
})

test('production wires only the official Goal service; v1 consent cannot activate physical enforcement',async()=>{
  const oldPreview=process.env.AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW
  const oldStats=process.env.AGENT_PICKET_STATS
  const inspected:string[]=[]
  const handlers=new Map<string,Function[]>()
  try{
    delete process.env.AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW
    process.env.AGENT_PICKET_STATS='off'
    const ctx={
      inject(deps:string[],_register:Function){inspected.push(deps.join(','))},
      on(event:string,callback:Function){handlers.set(event,[...(handlers.get(event)??[]),callback])},
    } as unknown as DshIntegrationContext
    apply(ctx)
    assert.equal(inspected.includes('goals,agents'),false,
      'Legacy DurableStats-based Goal enforcement cannot be registered in production')
    assert.equal(inspected.filter(x=>x==='goals,agents,sessionPersistence').length,1,
      'Production must have the same official Goal hook, gated by NEW v2 Host consent')
    assert.equal(handlers.has('agent/turn-stopping'),false,
      'No invisible post-turn Goal strike listener in default production')
    const normal=handlers.get('agent/pre-step')
    assert.ok(normal?.length,
      'Observation-only pre-step still records events without rejecting user submissions')
    let called=0
    const output=await normal![0]!({agent:{id:'a',session:{id:'s'}},messages:[{
      id:'human-1',source:{kind:'user'},content:[
        {type:'text',text:'user words must never be swallowed'},
        {type:'image',data:'synthetic-image-ref'},
      ],
    }]},async()=>{called++;return {kind:'enter'}})
    assert.deepEqual(output,{kind:'enter'})
    assert.equal(called,1,'No hidden input refusal, copy, or replay on the ordinary human path')
  }finally{
    if(oldPreview===undefined)delete process.env.AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW
    else process.env.AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW=oldPreview
    if(oldStats===undefined)delete process.env.AGENT_PICKET_STATS
    else process.env.AGENT_PICKET_STATS=oldStats
  }
})

test('the opt-in Goal prototype registers ONLY official persisted Session work, never private stats',()=>{
  const oldPreview=process.env.AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW
  const oldStats=process.env.AGENT_PICKET_STATS
  const registrations:string[]=[]
  try{
    process.env.AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW='on'
    process.env.AGENT_PICKET_STATS='off'
    apply({
      inject(deps:string[],_cb:Function){registrations.push(deps.join(','))},
      on(_event:string,_cb:Function){},
    } as unknown as DshIntegrationContext)
    assert.equal(registrations.filter(x=>x==='goals,agents,sessionPersistence').length,1,
      'Only the isolated official SessionPersistence proof may register Goal preview')
    assert.equal(registrations.includes('goals,agents'),false,
      'An official preview must not also enable the old DurableStats Goal listener')
  }finally{
    if(oldPreview===undefined)delete process.env.AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW
    else process.env.AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW=oldPreview
    if(oldStats===undefined)delete process.env.AGENT_PICKET_STATS
    else process.env.AGENT_PICKET_STATS=oldStats
  }
})
