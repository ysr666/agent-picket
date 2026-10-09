import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, inject } from '../src/adapters/dsh/client.ts'

test('Web companion advertises only native browser services', () => {
  assert.deepEqual(inject, ['sessions', 'commandUi'])
})

test('client companion forwards only completed union results to native notice', () => {
  let callback: Function | undefined
  const notices: { level: string; text: string }[] = []
  const scope = {
    get(name: string) {
      return name === 'conversation' ? {
        input: { for() { return { notify(level: string, text: string) {
          notices.push({ level, text })
        } } } },
      } : undefined
    },
  }
  apply({
    on(name, cb) {
      assert.equal(name, 'command/executed')
      callback = cb
    },
    sessions: { scope(sessionId) {
      return sessionId === 's' ? scope : undefined
    } },
  } as Parameters<typeof apply>[0])
  assert.ok(callback)
  callback('s', 'union', { kind: 'success', text: 'Safety NOT READY' })
  assert.deepEqual(notices, [{ level: 'info', text: 'Safety NOT READY' }])
  callback('s', 'unrelated', { kind: 'success', text: 'ignored' })
  callback('s', 'union', { kind: 'error', text: 'keep command draft' })
  callback('s', 'union', { kind: 'success' })
  callback('gone', 'union', { kind: 'success', text: 'session closed' })
  assert.equal(notices.length, 1)
})

test('client companion notifications are best effort and never affect command admission', () => {
  let callback: Function | undefined
  apply({
    on(_name: 'command/executed', cb: Function) { callback = cb },
    sessions: { scope() { return {
      get() { throw new Error('session disposed') },
    } } },
  } as unknown as Parameters<typeof apply>[0])
  assert.doesNotThrow(() => callback?.('s', 'union', {
    kind: 'success', text: 'do not block commands',
  }))
})
