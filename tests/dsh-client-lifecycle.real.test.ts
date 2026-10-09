import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { apply } from '../src/adapters/dsh/client.ts'

const modules = process.env.AGENT_PICKET_DSH_HOST

test('real Cordis: browser companion listener is removed on unload and never accumulates on reload', {
  skip: !modules && 'Set isolated AGENT_PICKET_DSH_HOST to run Cordis lifecycle checks',
  timeout: 10_000,
}, async () => {
  const { Context } = await import(
    pathToFileURL(join(modules!, '@deepseek-ai/cordis/lib/index.js')).href
  )
  const ctx = new Context()
  const notices: Array<{ session: string; level: string; text: string }> = []
  const resolveSession = (id: string) => ({
    get(name: string) {
      if (name !== 'conversation') return
      return { input: { for() {
        return { notify(level: string, text: string) {
          notices.push({ session: id, level, text })
        } }
      } } }
    },
  })
  ;(ctx as any).sessions = {
    scope(sessionId: string) {
      return sessionId === 'one' || sessionId === 'two'
        ? resolveSession(sessionId) : undefined
    },
  }
  const publish = (session: string, text: string) => {
    ctx.emit('command/executed', session, 'union', { kind: 'success', text })
  }
  const mount = () => ctx.plugin({
    name: 'agent-picket-dsh-client-lifecycle-fixture',
    apply(child: Parameters<typeof apply>[0]) { apply(child) },
  })
  for (let round = 1; round <= 5; round++) {
    const fiber = mount()
    try {
      await new Promise(resolve => setTimeout(resolve, 8))
      const before = notices.length
      publish('one', 'session one, round ' + round)
      publish('two', 'session two, round ' + round)
      ctx.emit('command/executed', 'one', 'unrelated-command', {
        kind: 'success', text: 'no-notice',
      })
      ctx.emit('command/executed', 'two', 'union', {
        kind: 'error', text: 'no-notice',
      })
      publish('missing-session', 'no-notice')
      assert.equal(notices.length, before + 2,
        'Mounting once must produce exactly one notice per eligible command')
      assert.deepEqual(notices.slice(-2).map(n => n.session), ['one', 'two'])
    } finally {
      await fiber.dispose()
    }
    const after = notices.length
    publish('one', 'must never appear after unload')
    assert.equal(notices.length, after,
      'Disposed Cordis Client fiber must own and remove its subscriptions')
  }
  assert.equal(notices.length, 10)
  assert.equal(notices.every(n => n.level === 'info'), true)
  assert.equal(notices.some(n => n.text.includes('no-notice')), false)
})

test('real Cordis: companion subscribers remain independent across fibers', {
  skip: !modules && 'Set isolated AGENT_PICKET_DSH_HOST to run Cordis lifecycle checks',
}, async () => {
  const { Context } = await import(
    pathToFileURL(join(modules!, '@deepseek-ai/cordis/lib/index.js')).href
  )
  const ctx = new Context()
  const seen: string[] = []
  ;(ctx as any).sessions = { scope() {
    return { get() {
      return { input: { for() {
        return { notify(_level: string, text: string) { seen.push(text) } }
      } } }
    } }
  } }
  const fiberA = ctx.plugin({ name: 'agent-picket-a', apply })
  const fiberB = ctx.plugin({ name: 'agent-picket-b', apply })
  try {
    await new Promise(resolve => setTimeout(resolve, 20))
    ctx.emit('command/executed', 'one', 'union', { kind: 'success', text: 'first' })
    assert.deepEqual(seen, ['first', 'first'])
    await fiberA.dispose()
    ctx.emit('command/executed', 'one', 'union', { kind: 'success', text: 'second' })
    assert.deepEqual(seen, ['first', 'first', 'second'])
    await fiberB.dispose()
    ctx.emit('command/executed', 'one', 'union', { kind: 'success', text: 'third' })
    assert.deepEqual(seen, ['first', 'first', 'second'])
  } finally {
    await fiberA.dispose()
    await fiberB.dispose()
  }
})
