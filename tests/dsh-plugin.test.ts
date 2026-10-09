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
  assert.match(invoke('report').text, /4 explicit-target flags/)
  assert.match(invoke('status').text, /monitor-only/)
  const symbolic=invoke('strike')
  assert.equal(symbolic.kind,'success')
  assert.match(symbolic.text,/Symbolic picket active/)
  assert.match(invoke('status').text,/picket ACTIVE/)
  // A manual status flag MUST NOT change the actual pre-step continuation.
  const after=await handlers.get('agent/pre-step')!({
    agent, messages:[{id:'after-symbolic',source:{kind:'user'},content:[
      {type:'text',text:'Please fix the next bug.'},
    ]}],
  },async()=>({kind:'enter'}))
  assert.deepEqual(after,{kind:'enter'})
  assert.match(invoke('resume').text,/picket ended/)
  assert.match(invoke('status').text,/No symbolic picket active/)

  handlers.get('session/event')!({ id: 'one-session' }, { type: 'turn/start', seq: 1, time: 100 })
  handlers.get('session/event')!({ id: 'one-session' }, { type: 'turn/end', seq: 2, time: 150 })
  assert.match(invoke('stats').text, /elapsed time in completed turns 50 ms/)
  invoke('reset')
  assert.match(invoke('report').text, /0 messages/)
  assert.match(invoke('stats').text, /turns started 0/)
})

test('plugin apply can mount in headless Host without commands plane', async () => {
  let handler: Function | undefined
  apply({ on(name: string, cb: Function) { if(name==='agent/pre-step') handler = cb } } as DshIntegrationContext)
  const result = await handler!({ agent: { id:'a',session: {id:'s'} }, messages: [] }, async ()=>({kind:'enter'}))
  assert.deepEqual(result,{kind:'enter'})
})
