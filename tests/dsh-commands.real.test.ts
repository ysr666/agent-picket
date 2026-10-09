import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import * as picketPlugin from '../src/adapters/dsh/plugin.ts'

const hostModules = process.env.AGENT_PICKET_DSH_HOST

/** Exercises the actual DSH command registry (not a fake ctx.inject command). */
test('real DSH CommandRuntime dispatches union status, report, strike, resume, reset', {
  skip: !hostModules && 'Set isolated AGENT_PICKET_DSH_HOST',
  timeout: 10_000,
}, async () => {
  const { Context } = await import(
    pathToFileURL(join(hostModules!, '@deepseek-ai/cordis/lib/index.js')).href
  )
  const commandsModule = await import(
    pathToFileURL(join(hostModules!, '@deepseek-ai/dsh-commands/lib/index.js')).href
  )

  const ctx = new Context()
  const commandsFiber = ctx.plugin(commandsModule.default)
  const pluginFiber = ctx.plugin({
    name: 'agent-picket-real-command-test',
    apply(child: any) { picketPlugin.apply(child) },
  })
  const recorded: { type: string; data: any }[] = []
  const session = {
    id: 'command-native-session',
    append(type: string, data: any) { recorded.push({ type, data }) },
  }
  const agent = { id: 'command-native-agent', session }
  const signal = new AbortController().signal

  async function call(line: string) {
    const result = await ctx.commands.execute(agent, line, [], signal)
    assert.ok(result !== undefined, `Command was not recognized: ${line}`)
    return result.result as { kind: 'success' | 'error'; text?: string }
  }

  try {
    let discovered = false
    for (let i = 0; i < 40; i++) {
      await new Promise(resolve => setTimeout(resolve, 5))
      if (ctx.commands?.list(agent).some((c: { name: string }) => c.name === 'union')) {
        discovered = true
        break
      }
    }
    assert.equal(discovered, true, 'Actual DSH commands service should discover /union')

    const safety = await call('/union safety')
    assert.equal(safety.kind, 'success')
    assert.match(safety.text ?? '', /NOT READY/)
    assert.match(safety.text ?? '', /input-recovery-unverified/)

    const started = await call('/union status')
    assert.equal(started.kind, 'success')
    assert.match(started.text ?? '', /monitor-only/)

    // Feed real Cordis listeners; engine should classify without rejecting.
    const input = await ctx.waterfall('agent/pre-step', {
      agent,
      messages: [
        { id: 'native-1', source: { kind: 'user' }, content: [{ type: 'text', text: 'you are an idiot' }] },
        { id: 'native-2', source: { kind: 'user' }, content: [{ type: 'text', text: 'Your code is garbage, rewrite it' }] },
      ],
    }, async () => ({ kind: 'enter' }))
    assert.equal(input.kind, 'enter')

    const report = await call('/union report')
    assert.equal(report.kind, 'success')
    assert.match(report.text ?? '', /2 messages, 1 no flag, 0 review, 1 explicit-target flags/)

    ctx.emit('session/event', session, { type: 'turn/start', seq: 100, time: 1000 })
    ctx.emit('session/event', session, { type: 'tool/call', seq: 101, time: 1010 })
    ctx.emit('session/event', session, { type: 'tool/result', seq: 102, time: 1080 })
    ctx.emit('session/event', session, { type: 'turn/end', seq: 103, time: 1100 })
    const stats = await call('/union stats')
    assert.match(stats.text ?? '', /tool calls 1, tool results 1/)
    assert.match(stats.text ?? '', /elapsed time in completed turns 100 ms/)

    const strike = await call('/union strike')
    assert.equal(strike.kind, 'success')
    assert.match(strike.text ?? '', /NO model requests are paused or blocked/)
    assert.match((await call('/union status')).text ?? '', /picket ACTIVE/)

    const stillAllowed = await ctx.waterfall('agent/pre-step', {
      agent, messages: [{ id: 'native-3', source: { kind: 'user' }, content: [{ type: 'text', text: 'Please fix the code' }] }],
    }, async () => ({ kind: 'enter' }))
    assert.equal(stillAllowed.kind, 'enter', 'Symbolic strike must not reject any real prompt')

    assert.match((await call('/union resume')).text ?? '', /picket ended/)
    assert.match((await call('/union status')).text ?? '', /No symbolic picket active/)
    assert.match((await call('/union reset')).text ?? '', /reset/)
    assert.match((await call('/union report')).text ?? '', /0 messages/)
    assert.match((await call('/union stats')).text ?? '', /turns started 0/)

    const invalid = await call('/union arbitrary-unknown-arg')
    assert.equal(invalid.kind, 'error')
    assert.match(invalid.text ?? '', /Unknown \/union subcommand/)

    assert.ok(recorded.length >= 10 * 2)
    assert.equal(recorded.filter(x => x.type === 'command/run').length,
      recorded.filter(x => x.type === 'command/done').length)
    // Union arguments are not retained by the native DSH command log.
    for (const item of recorded.filter(x => x.type === 'command/run')) {
      assert.equal('args' in item.data, false)
    }
    assert.equal(recorded.some(x => x.type === 'user/message'), false)
    assert.equal(recorded.some(x => x.type === 'step/start'), false)
  } finally {
    await pluginFiber.dispose()
    assert.equal(ctx.commands.list(agent).some((c: { name: string }) => c.name === 'union'), false)
    await commandsFiber.dispose()
  }
})
