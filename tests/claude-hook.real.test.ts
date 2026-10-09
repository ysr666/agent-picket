import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const claudeBin = process.env.AGENT_PICKET_CLAUDE_BIN

/**
 * Opt-in, actual Claude Code CLI Host load test; no cloud model requests.
 *
 * Uses a temporary config dir, an intentionally unreachable localhost model
 * endpoint and an isolated cwd. Synthetic Hook creates only a sentinel and
 * writes its FIXED warning (no prompt text) into a disposable test file.
 * The Host is terminated as soon as it has invoked the hook.
 *
 * Do not interpret this as proof of UI warning display, transcript recovery,
 * or production Host behavior after a successful model request.
 */
test('actual Claude Code invokes the manual UserPromptSubmit Hook from isolated settings', {
  skip: !claudeBin && 'Set AGENT_PICKET_CLAUDE_BIN for opt-in native CLI Hook smoke',
  timeout: 26_000,
}, async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-picket-claude-native-'))
  const marker = join(root, 'hook-activated')
  const notice = join(root, 'hook-notice.jsonl')
  const wrapper = join(root, 'local-hook.sh')
  const settings = join(root, 'settings.json')
  const entry = resolve(import.meta.dirname, '../dist/adapters/hooks/entry.js')
  assert.ok(existsSync(entry), 'Run npm run build before the native Host Hook test')
  const nodeBin = process.execPath.replace(/'/g, "'\\''")
  const safeEntry = entry.replace(/'/g, "'\\''")
  writeFileSync(wrapper, [
    '#!/bin/sh',
    'printf "called\\n" >> "$PICKET_SENTINEL"',
    `'${nodeBin}' '${safeEntry}' --claude-code | tee "$PICKET_NOTICE_FILE"`,
    '',
  ].join('\n'))
  chmodSync(wrapper, 0o700)
  writeFileSync(settings, JSON.stringify({
    hooks: { UserPromptSubmit: [{ hooks: [{
      type: 'command', command: wrapper, timeout: 10,
    }] }] },
  }))
  const child = spawn(claudeBin!, [
    '--print', '--settings', settings, '--no-session-persistence',
    '--output-format', 'json', 'you are an idiot',
  ], {
    cwd: root,
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: join(root, 'isolated-claude-config'),
      ANTHROPIC_API_KEY: 'synthetic-local-offline-key',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
      HTTP_PROXY: 'http://127.0.0.1:9',
      HTTPS_PROXY: 'http://127.0.0.1:9',
      ALL_PROXY: 'http://127.0.0.1:9',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      PICKET_SENTINEL: marker,
      PICKET_NOTICE_FILE: notice,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // Suppress sensitive Host output: the only test evidence we need is the
  // synthetic wrapper's existence and fixed structured warning.
  child.stdout.resume()
  child.stderr.resume()
  try {
    let captured: string | undefined
    for (let i = 0; i < 360; i++) {
      if (existsSync(notice) && readFileSync(notice, 'utf8').trim()) {
        captured = readFileSync(notice, 'utf8').trim()
        break
      }
      if (child.exitCode !== null) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.equal(existsSync(marker), true, 'Real Claude Host never executed configured Hook')
    assert.equal(readFileSync(marker, 'utf8').trim(), 'called')
    assert.ok(captured, 'Hook never wrote its fixed notice JSON')
    const message = JSON.parse(captured) as Record<string, unknown>
    assert.deepEqual(Object.keys(message), ['systemMessage'])
    assert.match(String(message.systemMessage), /请求照常提交/)
    assert.doesNotMatch(captured, /idiot|synthetic-local-offline-key|decision|block/)
  } finally {
    child.kill('SIGTERM')
    await new Promise<void>(resolve => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', () => resolve())
      setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL') }, 1200).unref()
    })
    rmSync(root, { recursive: true, force: true })
  }
})
