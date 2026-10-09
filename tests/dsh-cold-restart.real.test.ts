import assert from 'node:assert/strict'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const bin = process.env.AGENT_PICKET_DSH_BIN
const host = process.env.AGENT_PICKET_DSH_HOST

interface Response {
  id?: number
  result?: unknown
  error?: { code: number; message: string }
}
async function sdkAttempt(
  home: string,
  patch: string,
  sessionId: string,
): Promise<Response> {
  const child: ChildProcessWithoutNullStreams = spawn(bin!, [
    '--profile', 'sdk-minimal', '--patch', patch,
  ], {
    env: {
      ...process.env, DSH_HOME: home, AGENT_PICKET_DSH_HOST: host!,
      HTTP_PROXY: 'http://127.0.0.1:9',
      HTTPS_PROXY: 'http://127.0.0.1:9',
      ALL_PROXY: 'http://127.0.0.1:9',
    },
    stdio: 'pipe',
  })
  const outstanding = new Map<number, (value: Response) => void>()
  const stderr: string[] = []
  const reader = createInterface({ input: child.stdout })
  reader.on('line', line => {
    let response: Response
    try { response = JSON.parse(line) as Response } catch { return }
    if (typeof response.id === 'number') outstanding.get(response.id)?.(response)
  })
  child.stderr.on('data', (data: Buffer) => { stderr.push(data.toString()) })
  const ask = (id: number, method: string, params: Record<string, unknown>) => {
    const result = new Promise<Response>(resolve => outstanding.set(id, resolve))
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    return result
  }
  try {
    const initialization = await ask(1, 'initialize', {
      cwd: home, provider: 'picket-offline', model: 'offline-test-model',
    })
    assert.equal(initialization.error, undefined, stderr.join(''))
    const first = await ask(2, 'session/prompt', {
      sessionId, contentBlocks: [{ type: 'text', text: 'ALLOW TEST' }],
    })
    // Shutdown flushes session data before stopping this isolated server.
    const shutdown = await ask(3, 'shutdown', {})
    assert.deepEqual(shutdown.result, {})
    return first
  } finally {
    reader.close()
    if (child.exitCode === null) child.kill('SIGTERM')
    await new Promise<void>(resolve => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', resolve)
      setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL') }, 1200).unref()
    })
  }
}

test('DSH SDK-minimal cold restart: existing session IDs cannot be re-created by session/prompt', {
  skip: !(bin && host) && 'Set isolated AGENT_PICKET_DSH_BIN and AGENT_PICKET_DSH_HOST',
  timeout: 20_000,
}, async () => {
  const root = mkdtempSync(join(tmpdir(), 'picket-cold-restart-'))
  const home = join(root, 'persistent-home')
  const patch = join(root, 'offline.patch.yml')
  const entry = resolve(fileURLToPath(new URL('./fixtures/dsh-loop-smoke.mjs', import.meta.url)))
  writeFileSync(patch, `- insert:
    - id: picket-cold-restart-llm
      name: ${JSON.stringify(entry)}
      inject:
        - llm
        - tools
`)
  try {
    const original = await sdkAttempt(home, patch, 'same-session')
    assert.equal(typeof (original.result as { messageId?: string })?.messageId, 'string')
    const existing = await sdkAttempt(home, patch, 'same-session')
    assert.equal(existing.error?.code, -32603)
    assert.match(existing.error?.message ?? '', /session.*already exists/)
    // This describes a limitation of the pinned SDK API; do not mistake
    // the rejected re-creation attempt for a successful resume.
    const fresh = await sdkAttempt(home, patch, 'fresh-session')
    assert.equal(typeof (fresh.result as { messageId?: string })?.messageId, 'string')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
