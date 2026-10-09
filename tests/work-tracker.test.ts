import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkTracker } from '../src/core/index.ts'
import type { WorkEvent } from '../src/core/types.ts'

function event(id: string, type: WorkEvent['type'], time: number, sessionId='s'): WorkEvent {
  return { id, type, recordedAtMs: time, agentId: 'agent', sessionId }
}

test('counts real turn and tool event boundaries, not idle time', () => {
  const stats = new WorkTracker()
  for (const e of [
    event('1','turn-start',100),event('2','tool-start',120),
    event('3','tool-end',160),event('4','turn-end',200),
    event('5','turn-start',20_000),event('6','turn-end',20_050),
  ]) assert.equal(stats.observe(e), true)
  assert.deepEqual(stats.snapshot('agent','s'), {
    turnStarts: 2, turnEnds: 2, toolCalls: 1, toolResults: 1,
    completedTurnMs: 150,
  })
})

test('replayed events do not duplicate metrics', () => {
  const t = new WorkTracker()
  const start = event('1','turn-start',123)
  assert.equal(t.observe(start), true)
  assert.equal(t.observe(start), false)
  assert.equal(t.snapshot('agent','s').turnStarts, 1)
})

test('session and agent identity are part of metrics namespace', () => {
  const t = new WorkTracker()
  t.observe(event('1','tool-start',1))
  t.observe(event('1','tool-start',1,'other'))
  assert.equal(t.snapshot('agent','s').toolCalls, 1)
  assert.equal(t.snapshot('agent','other').toolCalls, 1)
  assert.equal(t.snapshot('different-agent','s').toolCalls, 0)
})

test('invalid time, IDs, and event types do not change state', () => {
  const t = new WorkTracker()
  assert.equal(t.observe(event('id','turn-start',NaN)), false)
  assert.equal(t.observe(event('','turn-start',1)), false)
  assert.equal(t.observe({ ...event('id','turn-start',1), type: 'garbage' as any }), false)
  assert.equal(t.snapshot('agent','s').turnStarts, 0)
})

test('unpaired ends cannot invent elapsed work time', () => {
  const t = new WorkTracker()
  t.observe(event('1','turn-end',100))
  t.observe(event('2','turn-start',1000))
  t.observe(event('3','turn-end',900))
  assert.equal(t.snapshot('agent','s').completedTurnMs, 0)
})

test('snapshot is a copy and local data can be cleared', () => {
  const t = new WorkTracker()
  t.observe(event('1','tool-start',1))
  const snapshot = t.snapshot('agent','s') as { toolCalls: number }
  snapshot.toolCalls = 777
  assert.equal(t.snapshot('agent','s').toolCalls, 1)
  assert.equal(t.clear('agent','s'), true)
  assert.equal(t.snapshot('agent','s').toolCalls, 0)
})

test('bounded dedup memory and invalid settings', () => {
  const t = new WorkTracker({ rememberedEventIds: 2 })
  for (let i=0; i<10; i++) t.observe(event(String(i),'tool-start',i))
  assert.equal(t.snapshot('agent','s').toolCalls, 10)
  assert.throws(() => new WorkTracker({ rememberedEventIds: 0 }), /positive integer/)
})
