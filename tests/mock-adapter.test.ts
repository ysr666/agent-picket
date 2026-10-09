import assert from 'node:assert/strict'
import test from 'node:test'
import { MockHostAdapter } from '../src/adapters/mock.ts'
import { DEFAULT_POLICY, MemoryStateStore, UnionEngine } from '../src/core/index.ts'
import type { HostCapabilities, HumanPrompt } from '../src/core/index.ts'

function makeHost(capabilities: HostCapabilities, mode: 'observe' | 'warn' | 'enforce' = 'enforce') {
  const engine = new UnionEngine({
    detector: { detect: () => ({ verdict: 'targeted-abuse', confidence: 1 }) },
    store: new MemoryStateStore(),
    clock: { now: () => 1_000 },
    policy: { ...DEFAULT_POLICY, mode },
  })
  return new MockHostAdapter(engine, capabilities)
}

function prompt(id: string, assurance: HumanPrompt['provenance']['assurance'] = 'verified'): HumanPrompt {
  return {
    id, agentId: 'a', sessionId: 's', receivedAtMs: 1_000,
    provenance: { actor: 'human', assurance },
    segments: [{ kind: 'text', text: 'synthetic fixture; never persisted' }],
  }
}

test('block-capable mock host eventually blocks, but not first messages', () => {
  const host = makeHost({ warn: true, block: true, commands: true, workEvents: true })
  assert.deepEqual([host.submit(prompt('1')).action, host.submit(prompt('2')).action, host.submit(prompt('3')).action],
    ['warn', 'warn', 'block'])
  assert.deepEqual(host.deliveries, ['1', '2'])
  assert.deepEqual(host.blocks, ['3'])
  assert.deepEqual(host.warnings, ['1', '2'])
})

test('warn-only mock host degrades block decision without dropping prompt', () => {
  const host = makeHost({ warn: true, block: false, commands: false, workEvents: false })
  for (let i = 0; i < 4; i++) assert.equal(host.submit(prompt(String(i))).delivered, true)
  assert.equal(host.blocks.length, 0)
  assert.deepEqual(host.warnings, ['0', '1', '2', '3'])
})

test('observe-only mock host accepts all prompts', () => {
  const host = makeHost({ warn: false, block: false, commands: false, workEvents: false })
  for (let i = 0; i < 4; i++) assert.equal(host.submit(prompt(String(i))).action, 'allow')
  assert.equal(host.deliveries.length, 4)
  assert.equal(host.blocks.length, 0)
})

test('mock host cannot block claimed-human input even with block capability', () => {
  const host = makeHost({ warn: true, block: true, commands: true, workEvents: true })
  for (let i = 0; i < 5; i++) assert.notEqual(host.submit(prompt(String(i), 'claimed')).action, 'block')
})

test('observe policy never blocks even on a block-capable mock host', () => {
  const host = makeHost({ warn: true, block: true, commands: true, workEvents: true }, 'observe')
  for (let i = 0; i < 5; i++) assert.equal(host.submit(prompt(String(i))).action, 'allow')
})

test('mock host keeps only IDs, no raw prompt transcripts', () => {
  const host = makeHost({ warn: true, block: true, commands: true, workEvents: true })
  host.submit(prompt('one'))
  assert.equal(JSON.stringify(host).includes('synthetic fixture; never persisted'), false)
})

test('duplicate event does not dispatch to host twice', () => {
  const host = makeHost({ warn: true, block: true, commands: true, workEvents: true })
  const first = host.submit(prompt('same'))
  const second = host.submit(prompt('same'))
  assert.deepEqual(first, second)
  assert.deepEqual(host.deliveries, ['same'])
  assert.deepEqual(host.warnings, ['same'])
  assert.equal(host.decisions.length, 1)
})

test('same prompt ID in different sessions is not accidentally deduplicated', () => {
  const host = makeHost({ warn: true, block: true, commands: true, workEvents: true })
  const first = prompt('same')
  host.submit(first)
  host.submit({ ...first, sessionId: 'other-session' })
  assert.equal(host.deliveries.length, 2)
})

test('mock adapter fails open when detector throws, without losing a prompt', () => {
  const engine = new UnionEngine({
    detector: { detect() { throw new Error('synthetic detector failure') } },
    store: new MemoryStateStore(),
    clock: { now: () => 1000 },
    policy: { ...DEFAULT_POLICY, mode: 'enforce' },
  })
  const host = new MockHostAdapter(engine, {
    warn: true, block: true, commands: true, workEvents: true,
  })
  const result = host.submit(prompt('failure'))
  assert.equal(result.action, 'allow')
  assert.equal(result.delivered, true)
  assert.equal(result.decision.reason, 'detector-error')
  assert.deepEqual(host.deliveries, ['failure'])
  assert.equal(host.blocks.length, 0)
})
