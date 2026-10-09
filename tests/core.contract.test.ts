import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  DEFAULT_POLICY,
  MemoryStateStore,
  UnionEngine,
  resolveHostAction,
  sessionKey,
} from '../src/core/index.ts'
import type {
  Clock,
  DetectionProvider,
  HumanPrompt,
  HostCapabilities,
  UnionPolicy,
} from '../src/core/index.ts'

type PromptOverrides = Partial<Omit<HumanPrompt, 'provenance'>> & {
  provenance?: HumanPrompt['provenance']
}

function prompt(id: string, opts: PromptOverrides = {}): HumanPrompt {
  return {
    id,
    agentId: 'agent-1',
    sessionId: 'session-1',
    receivedAtMs: 100,
    provenance: { actor: 'human', assurance: 'verified' },
    segments: [{ kind: 'text', text: 'ATTACK (synthetic fixture)' }],
    ...opts,
  }
}

/** Synthetic fixture classifier: no real abusive vocabulary or semantics in Phase 0. */
function fixture(
  mode: UnionPolicy['mode'] = 'enforce',
  opts: { policy?: Partial<UnionPolicy>; store?: MemoryStateStore } = {},
) {
  const store = opts.store ?? new MemoryStateStore()
  let now = 1000
  let detectorCalls = 0
  const detector: DetectionProvider = {
    detect(p) {
      detectorCalls += 1
      const text = p.segments.map(s => s.text).join(' ')
      if (text.includes('ATTACK')) return { verdict: 'targeted-abuse', confidence: 1 }
      if (text.includes('SUSPECT')) return { verdict: 'suspected-abuse', confidence: 0.6 }
      if (text.includes('LOW')) return { verdict: 'targeted-abuse', confidence: 0.2 }
      return { verdict: 'safe', confidence: 1 }
    },
  }
  const clock: Clock = { now: () => now }
  const engine = new UnionEngine({
    store,
    detector,
    clock,
    policy: { ...DEFAULT_POLICY, mode, ...opts.policy },
  })
  return {
    engine,
    store,
    get detectorCalls() { return detectorCalls },
    advance(ms: number) { now += ms },
  }
}

const FULL: HostCapabilities = { warn: true, block: true, commands: true, workEvents: true }
const OBSERVE: HostCapabilities = { warn: false, block: false, commands: false, workEvents: false }

test('default policy is observe only, even for repeated synthetic attacks', () => {
  const f = fixture(DEFAULT_POLICY.mode)
  for (let i = 0; i < 5; i++) {
    const d = f.engine.evaluate(prompt(`p-${i}`))
    assert.equal(d.requestedAction, 'allow')
    assert.equal(d.reason, 'observe-mode')
  }
})

test('warn mode does not block repeated verified-human messages', () => {
  const f = fixture('warn')
  for (let i = 0; i < 4; i++) assert.equal(f.engine.evaluate(prompt(String(i))).requestedAction, 'warn')
})

test('enforce mode needs three verified strong attacks, not one', () => {
  const f = fixture()
  assert.equal(f.engine.evaluate(prompt('1')).requestedAction, 'warn')
  assert.equal(f.engine.evaluate(prompt('2')).requestedAction, 'warn')
  const third = f.engine.evaluate(prompt('3'))
  assert.equal(third.requestedAction, 'block')
  assert.equal(third.reason, 'repeated-targeted-abuse')
  assert.equal(third.targetedStreak, 3)
})

test('weak classifier confidence never increments a targeted streak', () => {
  const f = fixture()
  const low = { segments: [{ kind: 'text' as const, text: 'LOW' }] }
  for (let i = 0; i < 4; i++) {
    const d = f.engine.evaluate(prompt(String(i), low))
    assert.equal(d.requestedAction, 'warn')
    assert.equal(d.targetedStreak, 0)
  }
})

test('suspected-abuse warns but does not escalate', () => {
  const f = fixture()
  for (let i = 0; i < 5; i++) {
    const d = f.engine.evaluate(prompt(String(i), {
      segments: [{ kind: 'text', text: 'SUSPECT' }],
    }))
    assert.equal(d.reason, 'suspected-abuse')
    assert.equal(d.targetedStreak, 0)
  }
})

test('a safe verified message resets consecutive-abuse counter', () => {
  const f = fixture()
  f.engine.evaluate(prompt('a'))
  f.engine.evaluate(prompt('b', { segments: [{ kind: 'code', text: 'fix failing test' }] }))
  assert.equal(f.engine.evaluate(prompt('c')).targetedStreak, 1)
})

test('elapsed window resets consecutive-abuse counter', () => {
  const f = fixture()
  f.engine.evaluate(prompt('a'))
  f.advance(DEFAULT_POLICY.streakWindowMs + 1)
  assert.equal(f.engine.evaluate(prompt('b')).targetedStreak, 1)
})

test('clock moving backwards cannot extend an existing strike streak', () => {
  const store = new MemoryStateStore()
  const f = fixture('enforce', { store })
  f.engine.evaluate(prompt('a'))
  const key = sessionKey(prompt('a'))
  store.set(key, { ...store.get(key)!, lastTargetedAtMs: 50000 })
  assert.equal(f.engine.evaluate(prompt('b')).targetedStreak, 1)
})

test('unknown/agent/tool sources are never classified or penalized', () => {
  const f = fixture()
  f.engine.evaluate(prompt('real'))
  for (const actor of ['agent', 'tool', 'unknown'] as const) {
    const d = f.engine.evaluate(prompt(actor, {
      provenance: { actor, assurance: 'verified' },
    }))
    assert.equal(d.reason, 'non-human')
    assert.equal(d.targetedStreak, 1)
  }
  assert.equal(f.detectorCalls, 1)
})

test('claimed-human inputs can warn but cannot block or advance streak', () => {
  const f = fixture()
  for (let i = 0; i < 6; i++) {
    const d = f.engine.evaluate(prompt(String(i), {
      provenance: { actor: 'human', assurance: 'claimed' },
    }))
    assert.equal(d.requestedAction, 'warn')
    assert.equal(d.reason, 'unverified-source')
    assert.equal(d.targetedStreak, 0)
  }
})

test('unknown assurance cannot grant block permission', () => {
  const f = fixture()
  for (let i = 0; i < 4; i++) assert.notEqual(
    f.engine.evaluate(prompt(String(i), {
      provenance: { actor: 'human', assurance: 'unknown' },
    })).requestedAction,
    'block',
  )
})

test('a retried prompt uses the saved decision, without double counting', () => {
  const f = fixture()
  const input = prompt('duplicate')
  assert.deepEqual(f.engine.evaluate(input), f.engine.evaluate(input))
  assert.equal(f.detectorCalls, 1)
  assert.equal(f.store.get(sessionKey(input))?.targetedStreak, 1)
})

test('different sessions never share streak counts', () => {
  const f = fixture()
  f.engine.evaluate(prompt('one'))
  f.engine.evaluate(prompt('two', { sessionId: 'session-2' }))
  assert.equal(f.engine.evaluate(prompt('three')).targetedStreak, 2)
  assert.equal(f.engine.evaluate(prompt('four', { sessionId: 'session-2' })).targetedStreak, 2)
})

test('different agent IDs never share streak counts', () => {
  const f = fixture()
  f.engine.evaluate(prompt('one'))
  assert.equal(f.engine.evaluate(prompt('two', { agentId: 'agent-2' })).targetedStreak, 1)
})

test('structured session keys avoid delimiter collision', () => {
  assert.notEqual(sessionKey({ agentId: 'a:b', sessionId: 'c' }), sessionKey({ agentId: 'a', sessionId: 'b:c' }))
  assert.notEqual(sessionKey({ agentId: 'a|b', sessionId: 'c' }), sessionKey({ agentId: 'a', sessionId: 'b|c' }))
})

test('history is bounded and contains no raw message text', () => {
  const f = fixture('warn', { policy: { maxRememberedPromptIds: 2 } })
  f.engine.evaluate(prompt('first', { segments: [{ kind: 'text', text: 'ATTACK secret message' }] }))
  f.engine.evaluate(prompt('second'))
  f.engine.evaluate(prompt('third'))
  const state = f.store.get(sessionKey(prompt('third')))!
  assert.equal(state.processed.length, 2)
  assert.deepEqual(state.processed.map(x => x.promptId), ['second', 'third'])
  assert.equal(JSON.stringify(state).includes('secret message'), false)
})

test('MemoryStateStore protects internal data from caller mutations', () => {
  const f = fixture()
  f.engine.evaluate(prompt('sample'))
  const key = sessionKey(prompt('sample'))
  const fetched = f.store.get(key)!
  ;(fetched.processed[0]!.decision as { requestedAction: string }).requestedAction = 'block'
  assert.equal(f.store.get(key)!.processed[0]!.decision.requestedAction, 'warn')
})

test('capability resolver only downgrades actions, never upgrades', () => {
  const f = fixture()
  f.engine.evaluate(prompt('1'))
  f.engine.evaluate(prompt('2'))
  const blocked = f.engine.evaluate(prompt('3'))
  assert.equal(resolveHostAction(blocked, FULL), 'block')
  assert.equal(resolveHostAction(blocked, { ...FULL, block: false }), 'warn')
  assert.equal(resolveHostAction(blocked, OBSERVE), 'allow')
  const allowed = f.engine.evaluate(prompt('4', {
    segments: [{ kind: 'text', text: 'fix code' }],
  }))
  assert.equal(resolveHostAction(allowed, FULL), 'allow')
})

test('invalid confidence rejects atomically before writing state', () => {
  const store = new MemoryStateStore()
  const f = new UnionEngine({
    detector: { detect: () => ({ verdict: 'targeted-abuse', confidence: Number.NaN }) },
    store,
    clock: { now: () => 10 },
    policy: { ...DEFAULT_POLICY, mode: 'enforce' },
  })
  assert.throws(() => f.evaluate(prompt('bad')), /confidence/)
  assert.equal(store.get(sessionKey(prompt('bad'))), undefined)
})

test('unsafe policy configurations fail fast', () => {
  const f = fixture('warn')
  assert.equal(f.engine.evaluate(prompt('good')).requestedAction, 'warn')
  const config = {
    detector: { detect: () => ({ verdict: 'safe' as const, confidence: 1 }) },
    store: new MemoryStateStore(),
    clock: { now: () => 10 },
  }
  assert.throws(() => new UnionEngine({ ...config, policy: { ...DEFAULT_POLICY, blockAfter: 1 } }), /blockAfter/)
  assert.throws(() => new UnionEngine({ ...config, policy: { ...DEFAULT_POLICY, confidenceThreshold: 3 } }), /confidenceThreshold/)
})

test('core has no runtime import from any host framework', () => {
  const root = join(import.meta.dirname, '../src/core')
  for (const file of readdirSync(root).filter(name => name.endsWith('.ts'))) {
    const code = readFileSync(join(root, file), 'utf8')
    assert.doesNotMatch(code, /from\s+['"][^'"]*(?:cordis|deepseek|claude|codex)[^'"]*['"]/i, file)
    assert.doesNotMatch(code, /\b(?:fetch\s*\(|https?\.request\s*\()/i, file)
  }
})
