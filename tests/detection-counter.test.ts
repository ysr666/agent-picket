import assert from 'node:assert/strict'
import test from 'node:test'
import { DetectionCounter, LocalRuleDetector } from '../src/core/index.ts'
import type { HumanPrompt } from '../src/core/types.ts'

function prompt(id: string, content: string, sessionId = 'session'): HumanPrompt {
  return {
    id, agentId: 'agent', sessionId, receivedAtMs: 1,
    provenance: { actor: 'human', assurance: 'claimed' },
    segments: [{ kind: 'text', text: content }],
  }
}

test('counts only verdicts and does not save source strings', () => {
  const counter = new DetectionCounter(new LocalRuleDetector())
  counter.detect(prompt('1', '你就是个傻逼 confidential-123'))
  counter.detect(prompt('2', '请修复这个 bug'))
  counter.detect(prompt('3', 'are you even stupid?'))
  assert.deepEqual(counter.snapshot('agent', 'session'), {
    checked: 3, safe: 1, review: 1, targeted: 1,
  })
  assert.equal(JSON.stringify(counter).includes('confidential-123'), false)
})

test('replay and independent session remain idempotent within retention window', () => {
  const counter = new DetectionCounter(new LocalRuleDetector())
  counter.detect(prompt('1', 'you are an idiot'))
  counter.detect(prompt('1', 'you are an idiot'))
  counter.detect(prompt('1', 'you are an idiot', 'other'))
  assert.equal(counter.snapshot('agent', 'session').checked, 1)
  assert.equal(counter.snapshot('agent', 'other').checked, 1)
})

test('stats snapshots are copies and can be reset', () => {
  const counter = new DetectionCounter(new LocalRuleDetector())
  counter.detect(prompt('1', 'the tests are bad'))
  const s = counter.snapshot('agent', 'session') as { checked: number }
  s.checked = 999
  assert.equal(counter.snapshot('agent', 'session').checked, 1)
  counter.clear('agent', 'session')
  assert.equal(counter.snapshot('agent', 'session').checked, 0)
  assert.throws(() => new DetectionCounter(new LocalRuleDetector(), 0), /positive/)
})
