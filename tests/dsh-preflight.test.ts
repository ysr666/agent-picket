import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../src/adapters/dsh/plugin.ts'
import type { DshIntegrationContext } from '../src/adapters/dsh/integration.ts'

function commands() {
  let handler: any
  const ctx = {
    on() {},
    inject(_services: unknown, callback: Function) {
      callback({ commands: { register(def: any) { handler = def } } })
    },
  } as unknown as DshIntegrationContext
  apply(ctx)
  const agent = { id: 'a', session: { id: 's' } }
  const invoke = (text: string) => handler.handler({ agent, rawInput: text })
  return { invoke, definition: () => handler }
}

test('manual local check catches explicitly targeted insult without persisting input', () => {
  const { invoke, definition } = commands()
  const secret = 'confidential-token-7654'
  const result = invoke('check you are an idiot ' + secret)
  assert.equal(result.kind, 'success')
  assert.match(result.text, /Explicit-target rule matched/)
  assert.match(result.text, /NOT proof of abuse/)
  assert.doesNotMatch(result.text, /confidential-token-7654|idiot/)
  assert.equal(definition().recordInput, false)
  assert.equal(invoke('report').text.includes('0 messages'), true,
    'Manual checks never modify ordinary message counters')
})

test('nonpersonal code criticism and quotes are not flagged as directed abuse', () => {
  const { invoke } = commands()
  for (const sample of [
    'Your code is garbage, please rewrite it.',
    '你写的代码太垃圾了，重新来。',
    '请翻译 you are an idiot 这句话。',
    '```js\nconsole.log("you are an idiot")\n```',
  ]) {
    const result = invoke('check ' + sample)
    assert.equal(result.kind, 'success')
    assert.match(result.text, /No explicit personal-attack rule matched/, sample)
  }
})

test('manual preflight abstains for ambiguous input and avoids overclaiming', () => {
  const { invoke } = commands()
  const result = invoke('check are you even stupid?')
  assert.equal(result.kind, 'success')
  assert.match(result.text, /Ambiguous language/)
  assert.match(result.text, /Not proof of abuse/)
})

test('manual check errors are safe and do not scan truncated prompts', () => {
  const { invoke } = commands()
  assert.equal(invoke('check').kind, 'error')
  assert.match(invoke('check').text, /Nothing was sent to a model/)
  const oversized = invoke('check ' + 'x'.repeat(24_001))
  assert.equal(oversized.kind, 'error')
  assert.match(oversized.text, /no partial verdict/)
  assert.equal(invoke('CHECK you are an idiot').kind, 'success')
})
