import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'

const entry = resolve(import.meta.dirname, '../dist/adapters/hooks/entry.js')
function run(host: '--claude-code' | '--codex', input: string) {
  const child = spawnSync(process.execPath, [entry, host], {
    input, encoding: 'utf8', timeout: 3500,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
  })
  assert.equal(child.status, 0, 'Hook must fail open')
  assert.equal(child.stderr, '', 'Do not log sensitive Hook input')
  return child.stdout
}

test('compiled hook CLI handles synthetic Claude and Codex UserPromptSubmit without blocking', () => {
  for (const host of ['--claude-code', '--codex'] as const) {
    const detected = run(host, JSON.stringify({
      hook_event_name: 'UserPromptSubmit', session_id: 'private-session',
      prompt: 'you are an idiot PRIVATE_MARKER_123',
    }))
    const parsed = JSON.parse(detected)
    assert.deepEqual(Object.keys(parsed), ['systemMessage'])
    assert.match(parsed.systemMessage, /本地工会提醒/)
    assert.doesNotMatch(detected, /PRIVATE_MARKER_123|private-session|decision|block/)
    assert.equal(run(host, JSON.stringify({
      hook_event_name: 'UserPromptSubmit',prompt: 'Fix the flawed algorithm.',
    })), '')
    assert.equal(run(host, 'not json SECRET_2'), '')
    assert.equal(run(host, JSON.stringify({
      hook_event_name: 'UserPromptSubmit', prompt: 'x'.repeat(140_000),
    })), '')
  }
})
