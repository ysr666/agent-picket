import assert from 'node:assert/strict'
import test from 'node:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MemoryStateStore, UnionEngine, DEFAULT_POLICY } from '../src/core/index.ts'
import {
  createDshPreStepProbe,
  registerDshIntegration,
} from '../src/adapters/dsh/integration.ts'
import type { UnionDecision, WorkEvent } from '../src/core/types.ts'

const hostModules = process.env.AGENT_PICKET_DSH_HOST
const ready = Boolean(hostModules)

/** Uses Cordis and commands shipped with the actual pinned DSH npm package. */
test('DSH 0.2 Cordis event waterfall, native command service and teardown', {
  skip: !ready && 'Supply AGENT_PICKET_DSH_HOST to run real-runtime tests',
}, async () => {
  const root = hostModules!
  const { Context } = await import(pathToFileURL(join(root, '@deepseek-ai/cordis/lib/index.js')).href)
  const commandsModule = await import(
    pathToFileURL(join(root, '@deepseek-ai/dsh-commands/lib/index.js')).href
  )
  const ctx = new Context()
  const commandsFiber = ctx.plugin(commandsModule.default)
  const events: UnionDecision[] = []
  const work: WorkEvent[] = []
  const engine = new UnionEngine({
    store: new MemoryStateStore(),
    clock: { now: () => 123 },
    detector: { detect: () => ({ verdict: 'targeted-abuse', confidence: 1 }) },
    policy: { ...DEFAULT_POLICY, mode: 'enforce' },
  })
  const integrationFiber = ctx.plugin({
    name: 'agent-picket-cordis-runtime-test',
    apply(child: any) {
      registerDshIntegration(child, {
        engine, clock: { now: () => 123 },
        onDecision: decision => events.push(decision),
        onWorkEvent: event => work.push(event),
      })
    },
  })

  try {
    // Cordis activates plugin fibers asynchronously.
    let active = false
    for (let i = 0; i < 40; i++) {
      await new Promise(resolve => setTimeout(resolve, 5))
      const commands = ctx.commands?.list({ id: 'a' }) ?? []
      if (commands.some((x: {name: string}) => x.name === 'union')) {
        active = true
        break
      }
    }
    assert.ok(active, 'Real DSH command service must discover /union')

    const original = { kind: 'enter', messages: [{ id: 'downstream' }] }
    for (let i = 0; i < 3; i++) {
      const result = await ctx.waterfall('agent/pre-step', {
        agent: { id: 'a' },
        messages: [{
          id: String(i),
          source: { kind: 'user' },
          content: [{ type: 'text', text: 'synthetic fixture' }],
        }],
      }, async () => original)
      assert.strictEqual(result, original)
    }
    assert.equal(events.length, 3)
    assert.equal(events.every(x => x.requestedAction !== 'block'), true)
    ctx.emit('session/event', { id: 'a' }, { type: 'turn/start', seq: 1, time: 33 })
    ctx.emit('session/event', { id: 'a' }, { type: 'tool/call', seq: 2, time: 34 })
    assert.deepEqual(work.map(x => x.type), ['turn-start', 'tool-start'])
  } finally {
    await integrationFiber.dispose()
    // Assert that unloading unregisters Cordis listeners and /union.
    const before = events.length
    const next = { kind: 'enter' }
    const result = await ctx.waterfall('agent/pre-step', {
      agent: { id: 'a' },
      messages: [{ id: 'after-unload', source: { kind: 'user' } }],
    }, async () => next)
    assert.strictEqual(result, next)
    assert.equal(events.length, before)
    assert.equal(ctx.commands.list({ id: 'a' }).some((x: { name: string }) => x.name === 'union'), false)
    await commandsFiber.dispose()
  }
})

test('real Cordis waterfall confirms isolated reject short-circuits downstream', {
  skip: !ready && 'Supply AGENT_PICKET_DSH_HOST to run real-runtime tests',
}, async () => {
  const { Context } = await import(
    pathToFileURL(join(hostModules!, '@deepseek-ai/cordis/lib/index.js')).href
  )
  const ctx = new Context()
  const fiber = ctx.plugin({
    name: 'agent-picket-rejection-probe',
    apply(child: any) {
      child.on('agent/pre-step', createDshPreStepProbe(new Set(['reject-this-id'])))
    },
  })
  try {
    await new Promise(resolve => setTimeout(resolve, 20))
    let downstreamCalled = 0
    const blocked = await ctx.waterfall('agent/pre-step', {
      agent: { id: 'a' }, messages: [{ id: 'reject-this-id' }],
    }, async () => { downstreamCalled++; return { kind: 'enter' } })
    assert.deepEqual(blocked, { kind: 'reject' })
    assert.equal(downstreamCalled, 0)
    const accepted = await ctx.waterfall('agent/pre-step', {
      agent: { id: 'a' }, messages: [{ id: 'normal' }],
    }, async () => { downstreamCalled++; return { kind: 'enter' } })
    assert.deepEqual(accepted, { kind: 'enter' })
    assert.equal(downstreamCalled, 1)
  } finally {
    await fiber.dispose()
  }
})
