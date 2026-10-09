import assert from 'node:assert/strict'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const dshBin = process.env.AGENT_PICKET_DSH_BIN
const hostRoot = process.env.AGENT_PICKET_DSH_HOST

type Wire = { jsonrpc?: string; id?: number; method?: string; result?: unknown;
  error?: { code?: number; message?: string }; params?: any }

async function verifyOfflineAgentLoop(visionEntry?: string): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'picket-real-loop-'))
  const patch = join(root, 'loop.patch.yml')
  const log = join(root, 'probe-log.txt')
  const modulePath = resolve(fileURLToPath(new URL('./fixtures/dsh-loop-smoke.mjs', import.meta.url)))
  const visionRow = visionEntry ? `
    - id: vision-router-coexistence-test
      name: ${JSON.stringify(visionEntry)}
      inject:
        - tools
        - llm
      config:
        freeFallback: false
` : ''
  writeFileSync(patch, `- insert:
    - id: picket-offline-agentloop-test
      name: ${JSON.stringify(modulePath)}
      inject:
        - llm
        - tools
${visionRow}`)
  const env = {
    ...process.env,
    DSH_HOME: join(root, 'dsh-home'),
    AGENT_PICKET_DSH_HOST: hostRoot!,
    AGENT_PICKET_PROBE_LOG: log,
    // Prevent any accidental external provider requests even if fixture is misconfigured.
    HTTP_PROXY: 'http://127.0.0.1:9',
    HTTPS_PROXY: 'http://127.0.0.1:9',
    ALL_PROXY: 'http://127.0.0.1:9',
  }
  const child: ChildProcessWithoutNullStreams = spawn(dshBin!, [
    '--profile', 'sdk-minimal', '--patch', patch,
  ], { env, stdio: 'pipe' })

  const notices: Wire[] = []
  const pending = new Map<number, { resolve(v: Wire): void; reject(e: Error): void }>()
  const errors: string[] = []
  const lines = createInterface({ input: child.stdout })
  lines.on('line', line => {
    let frame: Wire
    try { frame = JSON.parse(line) as Wire } catch { errors.push('invalid-json'); return }
    if (typeof frame.id === 'number') {
      pending.get(frame.id)?.resolve(frame)
      pending.delete(frame.id)
    } else {
      notices.push(frame)
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', text => { errors.push(String(text).slice(0,500)) })

  async function request(id: number, method: string, params: object): Promise<Wire> {
    const response = new Promise<Wire>((resolve, reject) => pending.set(id, { resolve, reject }))
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    const frame = await response
    assert.equal(frame.error, undefined, `Request failed: ${JSON.stringify(frame)} errors=${errors.join('')}`)
    return frame
  }

  async function until(predicate: () => boolean, description: string): Promise<void> {
    for (let i = 0; i < 200; i++) {
      if (predicate()) return
      if (child.exitCode !== null) break
      await new Promise(resolve => setTimeout(resolve, 35))
    }
    assert.fail(`Timeout on ${description}: notices=${JSON.stringify(notices.slice(-8))} errors=${errors.join('')}`)
  }

  const sessionId = 'picket-offline-test-session'
  const eventsFor = (id: string) => notices
    .filter(x => x.method === 'session.event' && x.params?.sessionId === id)
    .map(x => x.params.event)
  const getSessionEvents = () => eventsFor(sessionId)
  const getEnds = () => getSessionEvents().filter(x => x?.type === 'turn/end')
  const logLines = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []

  try {
    const initialized = await request(1, 'initialize', {
      cwd: root, provider: 'picket-offline', model: 'offline-test-model',
    })
    assert.equal((initialized.result as any)?.serverInfo?.name, 'deepseek-harness-sdk-runtime')

    const rejected = await request(2, 'session/prompt', {
      sessionId, contentBlocks: [{ type: 'text', text: 'BLOCK TEST' }],
    })
    assert.equal(typeof (rejected.result as any)?.messageId, 'string')
    await until(() => getEnds().length >= 1, 'first blocked turn to settle')
    assert.deepEqual(getEnds().map(x => x.data.reason.kind), ['blocked'])
    assert.equal(getSessionEvents().some(x => x.type === 'step/start'), false)
    assert.equal(logLines().includes('model-call'), false)

    const allowed = await request(3, 'session/prompt', {
      sessionId, contentBlocks: [{ type: 'text', text: 'ALLOW TEST' }],
    })
    assert.equal(typeof (allowed.result as any)?.messageId, 'string')
    await until(() => getEnds().length >= 2, 'second successful turn to settle')

    assert.deepEqual(getEnds().map(x => x.data.reason.kind), ['blocked', 'completed'])
    assert.equal(getSessionEvents().filter(x => x.type === 'step/start').length, 1)
    assert.equal(getSessionEvents().filter(x => x.type === 'user/message').length, 1)
    assert.equal(getSessionEvents().filter(x => x.type === 'assistant/message').length, 1)
    assert.equal(logLines().filter(x => x === 'pre-step-reject').length, 1)
    assert.equal(logLines().filter(x => x === 'model-call').length, 1)
    assert.equal(logLines().filter(x => x === 'work:turn-start').length, 2)
    assert.equal(logLines().filter(x => x === 'work:turn-end').length, 2)

    // The SDK does not promise a model-facing message or user-readable reason for 'blocked'.
    const blockEnd = getEnds()[0]
    assert.equal(blockEnd.data.reason.kind, 'blocked')
    assert.equal(JSON.stringify(blockEnd.data).includes('arbitration'), false)

    const toolRequest = await request(4, 'session/prompt', {
      sessionId, contentBlocks: [{ type:'text', text:'TOOL TEST' }],
    })
    assert.equal(typeof (toolRequest.result as any)?.messageId, 'string')
    await until(() => getEnds().length >= 3, 'third turn with one real local tool execution')
    assert.deepEqual(getEnds().map(x => x.data.reason.kind), ['blocked', 'completed', 'completed'])
    assert.equal(getSessionEvents().filter(x => x.type === 'tool/call').length, 1)
    assert.equal(getSessionEvents().filter(x => x.type === 'tool/result').length, 1)
    assert.equal(logLines().filter(x => x === 'tool-executed').length, 1)
    assert.equal(logLines().filter(x => x === 'work:tool-start').length, 1)
    assert.equal(logLines().filter(x => x === 'work:tool-end').length, 1)
    assert.equal(logLines().filter(x => x === 'model-call').length, 3)

    // Concurrent JSON-RPC submissions must not corrupt or combine session streams.
    const firstParallelSession = 'picket-parallel-a'
    const secondParallelSession = 'picket-parallel-b'
    const [parallelA, parallelB] = await Promise.all([
      request(6, 'session/prompt', {
        sessionId: firstParallelSession,
        contentBlocks: [{ type: 'text', text: 'PARALLEL A' }],
      }),
      request(7, 'session/prompt', {
        sessionId: secondParallelSession,
        contentBlocks: [{ type: 'text', text: 'PARALLEL B' }],
      }),
    ])
    assert.equal(typeof (parallelA.result as any)?.messageId, 'string')
    assert.equal(typeof (parallelB.result as any)?.messageId, 'string')
    await until(
      () => eventsFor(firstParallelSession).some(x => x.type === 'turn/end')
        && eventsFor(secondParallelSession).some(x => x.type === 'turn/end'),
      'two concurrent sessions finish independently',
    )
    for (const parallelSession of [firstParallelSession, secondParallelSession]) {
      const events = eventsFor(parallelSession)
      assert.deepEqual(events.filter(x => x.type === 'turn/end')
        .map(x => x.data.reason.kind), ['completed'])
      assert.equal(events.filter(x => x.type === 'user/message').length, 1)
      assert.equal(events.filter(x => x.type === 'assistant/message').length, 1)
      assert.equal(events.filter(x => x.type === 'tool/call').length, 0)
    }
    assert.equal(getEnds().length, 3, 'original session must not receive concurrent events')
    assert.equal(logLines().filter(x => x === 'model-call').length, 5)
    assert.equal(logLines().filter(x => x === 'work:turn-start').length, 5)
    assert.equal(logLines().filter(x => x === 'work:turn-end').length, 5)
    assert.equal(logLines().filter(x => x === 'decision:observe-mode').length >= 5, true)

    const shutdown = await request(5, 'shutdown', {})
    assert.deepEqual(shutdown.result, {})
  } finally {
    lines.close()
    if (child.exitCode === null) child.kill('SIGTERM')
    await new Promise<void>(resolve => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', () => resolve())
      setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL') }, 1200).unref()
    })
    for (const entry of pending.values()) entry.reject(new Error('test stopped'))
    pending.clear()
    rmSync(root, { recursive: true, force: true })
  }
}

test('real DSH AgentLoop rejects one input without an LLM call and later recovers', {
  skip: !(dshBin && hostRoot) && 'Set AGENT_PICKET_DSH_BIN and AGENT_PICKET_DSH_HOST',
  timeout: 25_000,
}, () => verifyOfflineAgentLoop())

test('real DSH AgentLoop coexists with released dsh-vision-router (opt-in)', {
  skip: !(dshBin && hostRoot && process.env.AGENT_PICKET_VISION_ENTRY)
    && 'Set AGENT_PICKET_VISION_ENTRY to the installed dsh-vision-router entry',
  timeout: 25_000,
}, () => verifyOfflineAgentLoop(process.env.AGENT_PICKET_VISION_ENTRY))
