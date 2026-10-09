import assert from 'node:assert/strict'
import test from 'node:test'
import { createHookOutput, evaluateHookEvent, removePastedContent } from '../src/adapters/hooks/evaluate.ts'

const payload = (prompt: string) => ({ hook_event_name: 'UserPromptSubmit', prompt,
  session_id: 'should-not-be-logged', transcript_path: '/private/my-history.jsonl' })

test('Claude and Codex share one conservative, stateless observer with no block decision', () => {
  for (const host of ['claude-code', 'codex'] as const) {
    const event = payload('you are an idiot SECRET_2918')
    const result = evaluateHookEvent(host, event)
    assert.equal(result?.verdict, 'explicit-target')
    assert.match(result?.notice ?? '', /请求照常提交/)
    const output = createHookOutput(host, event)
    assert.ok(output?.systemMessage)
    assert.deepEqual(Object.keys(output), ['systemMessage'])
    assert.equal(JSON.stringify(output).includes('SECRET_2918'), false)
    assert.equal(JSON.stringify(output).includes('should-not-be-logged'), false)
    assert.equal(JSON.stringify(output).includes('my-history'), false)
    assert.equal(JSON.stringify(output).includes('decision'), false)
  }
})

test('Quoted code, critical code review, pasted content and uncertain claims do not notify', () => {
  for (const host of ['claude-code', 'codex'] as const) {
    for (const sentence of [
      'Your code is garbage, rewrite it.',
      '你做的这个方案很差，重来',
      '翻译 you are an idiot',
      'The log says: "you are an idiot"',
      '### Source\n' + '\x60\x60\x60' + '\n you are an idiot\n' + '\x60\x60\x60',
      'are you even stupid?',
    ]) {
      assert.equal(createHookOutput(host,payload(sentence)), undefined,
        'Only high-confidence explicitly targeted rules trigger notices')
    }
  }
  const pasted = 'Please explain this snippet:\n<pasted_content id="123">\nyou are an idiot\n</pasted_content>'
  assert.equal(createHookOutput('claude-code', payload(pasted)), undefined)
  assert.equal(removePastedContent(pasted).includes('idiot'), false)
})

test('Bad event identities, oversized input and unrelated tool output are not classified', () => {
  for (const host of ['claude-code', 'codex'] as const) {
    for (const invalid of [
      null, undefined, {}, [], { hook_event_name: 'PostToolUse', prompt: 'you are an idiot' },
      { hook_event_name: 'UserPromptSubmit', tool_response: 'you are an idiot' },
      payload(''), payload('x'.repeat(24_001)),
    ]) {
      assert.equal(evaluateHookEvent(host, invalid), undefined)
      assert.equal(createHookOutput(host, invalid), undefined)
    }
  }
})
