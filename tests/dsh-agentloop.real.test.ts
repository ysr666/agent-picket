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
    - id: picket-isolated-attachment-store
      name: '@deepseek-ai/dsh-attachment-local'
      config:
        dshHome: ${JSON.stringify(root)}
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
    // Synthetic permission only within this disposable local fixture.
    // This is NOT a claim that an official Host setting can be bypassed.
    AGENT_PICKET_TEST_LOCAL_CONSENT: 'on',
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

    // User-approved discard+resend semantics: the first attempt may be
    // consumed and refused, even if the Host stores inbox attachment refs.
    // No message or image is replayed automatically; after resuming, the
    // user must submit text AND attach the image a second time.
    const tinyPng='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGOUdMtjIAUwkaR6VMOohiGlAQCmDwDtMnvHzQAAAABJRU5ErkJggg=='
    const rejected = await request(2, 'session/prompt', {
      sessionId, contentBlocks: [
        { type: 'text', text: 'BLOCK TEST' },
        { type: 'image', mimeType:'image/png', data:tinyPng },
      ],
    })
    assert.equal(typeof (rejected.result as any)?.messageId, 'string')
    await until(() => getEnds().length >= 1, 'first blocked turn to settle')
    assert.deepEqual(getEnds().map(x => x.data.reason.kind), ['blocked'])
    assert.equal(getSessionEvents().some(x => x.type === 'step/start'), false)
    assert.equal(logLines().includes('model-call'), false)
    assert.equal(getSessionEvents().some(x=>x.type==='user/message'),false,
      'A rejected turn never commits a user/message to model-facing history')
    const inputSplices=getSessionEvents().filter(x=>x.type==='agent/inbox/spliced')
    assert.ok(inputSplices.length>0,
      'Original submission has to be traceable as Host-owned inbox splices, not stored by Agent Picket')
    assert.ok(inputSplices.some(x=>JSON.stringify(x.data).includes('attachment')),
      'Durable Host inbox references an image, but this is NOT a proven one-time user resubmit API')

    const allowed = await request(3, 'session/prompt', {
      sessionId, contentBlocks: [
        { type: 'text', text: 'ALLOW TEST' },
        { type: 'image', mimeType:'image/png', data:tinyPng },
      ],
    })
    assert.equal(typeof (allowed.result as any)?.messageId, 'string')
    await until(() => getEnds().length >= 2, 'second successful turn to settle')

    assert.deepEqual(getEnds().map(x => x.data.reason.kind), ['blocked', 'completed'])
    assert.equal(getSessionEvents().filter(x => x.type === 'step/start').length, 1)
    const committed=getSessionEvents().filter(x=>x.type==='user/message')
    // Official SDK may create an additional synthetic user/message for
    // image materialization; count cannot establish hidden model execution.
    assert.ok(committed.some(x=>JSON.stringify(x).includes('ALLOW TEST')))
    assert.ok(committed.every(x=>!JSON.stringify(x).includes('BLOCK TEST')),
      'The rejected text is not included in any committed user message')
    assert.equal(logLines().filter(x=>x==='resend-model-saw-blocked=true').length,0,
      'On resume the model must NEVER receive the previously refused task')
    assert.equal(getSessionEvents().filter(x => x.type === 'assistant/message').length, 1)
    assert.equal(logLines().filter(x => x === 'pre-step-reject').length, 1)
    assert.ok(logLines().includes('pre-step-coordinate:1:1'),
      'Official first proposed turn must have authentic turn=1,step=1 coordinates')
    assert.ok(logLines().includes('pre-step-coordinate:2:1'),
      'A manual post-refusal resubmit must be a new turn first step')
    assert.equal(logLines().filter(x => x === 'model-call').length, 1)
    assert.equal(logLines().filter(x => x === 'resend-model-image=true').length, 1,
      'The allowed post-refusal turn includes a NEW image upload, not an automatic replay')
    assert.equal(logLines().filter(x => x === 'work:turn-start').length, 2)
    assert.equal(logLines().filter(x => x === 'work:turn-end').length, 2)

    // The SDK itself does NOT provide a specific user-readable explanation
    // for the blocked turn. Production may refuse only with a separately
    // proven visible notice: 'on strike; re-send text and attachments'.
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
      assert.ok(events.filter(x=>x.type==='user/message').some(
        x=>JSON.stringify(x).includes(parallelSession==='picket-parallel-a'
          ?'PARALLEL A':'PARALLEL B')),
        'The correct current human submission is present in each independent Session')
      assert.equal(events.filter(x => x.type === 'assistant/message').length, 1)
      assert.equal(events.filter(x => x.type === 'tool/call').length, 0)
    }
    assert.equal(getEnds().length, 3, 'original session must not receive concurrent events')
    assert.equal(logLines().filter(x => x === 'model-call').length, 5)
    assert.equal(logLines().filter(x => x === 'work:turn-start').length, 5)
    assert.equal(logLines().filter(x => x === 'work:turn-end').length, 5)
    assert.equal(logLines().filter(x => x === 'decision:observe-mode').length >= 4, true,
      'The refused turn is rejected before even the local rule classifier; allowed turns remain observed')

    // The real DSH pre-step bridge invokes the LOCAL classifier but remains
    // observe-only. An explicit user-directed insult must NOT drop the prompt.
    const targeted = await request(8, 'session/prompt', {
      sessionId, contentBlocks: [{ type: 'text', text: 'you are an idiot' }],
    })
    assert.equal(typeof (targeted.result as any)?.messageId, 'string')
    await until(() => getEnds().length >= 4, 'targeted but observe-only input finishes')
    assert.equal(getEnds()[3].data.reason.kind, 'completed')
    assert.equal(logLines().filter(x => x === 'local-verdict:targeted-abuse').length, 1)
    assert.equal(logLines().filter(x => x === 'model-call').length, 6)

    const technical = await request(9, 'session/prompt', {
      sessionId, contentBlocks: [{ type: 'text', text: 'Your code is garbage; rewrite it.' }],
    })
    assert.equal(typeof (technical.result as any)?.messageId, 'string')
    await until(() => getEnds().length >= 5, 'technical criticism remains allowed')
    assert.equal(getEnds()[4].data.reason.kind, 'completed')
    assert.equal(logLines().filter(x => x === 'local-verdict:targeted-abuse').length, 1)
    assert.equal(logLines().filter(x => x === 'model-call').length, 7)

    // A code-criticism clause must not silence a separate explicit attack.
    const mixed = await request(10, 'session/prompt', {
      sessionId, contentBlocks: [{ type:'text',
        text:'Your code is garbage and you are an idiot.' }],
    })
    assert.equal(typeof (mixed.result as any)?.messageId,'string')
    await until(() => getEnds().length >= 6, 'mixed feedback still completes')
    assert.equal(getEnds()[5].data.reason.kind,'completed')
    assert.equal(logLines().filter(x => x === 'local-verdict:targeted-abuse').length,2)
    assert.equal(logLines().filter(x => x === 'model-call').length,8)

    // An unquoted but unmistakable translation task is not a user attack.
    const translation = await request(11, 'session/prompt', {
      sessionId, contentBlocks: [{ type:'text',
        text:'Please translate, you are an idiot.' }],
    })
    assert.equal(typeof (translation.result as any)?.messageId,'string')
    await until(() => getEnds().length >= 7, 'translation safely completes')
    assert.equal(getEnds()[6].data.reason.kind,'completed')
    assert.equal(logLines().filter(x => x === 'local-verdict:targeted-abuse').length,2)
    assert.equal(logLines().filter(x => x === 'model-call').length,9)

    // Do not let an earlier suspected clause suppress a later explicit one.
    const mixedStrength = await request(12, 'session/prompt', {
      sessionId, contentBlocks: [{ type:'text',
        text:'Are you even stupid? You are a moron.' }],
    })
    assert.equal(typeof (mixedStrength.result as any)?.messageId,'string')
    await until(() => getEnds().length >= 8, 'later direct insult safely completes')
    assert.equal(getEnds()[7].data.reason.kind,'completed')
    assert.equal(logLines().filter(x => x === 'local-verdict:targeted-abuse').length,3)
    assert.equal(logLines().filter(x => x === 'model-call').length,10)

    // Distinct Session: reject original text + image, then resume with ONLY
    // fresh text. There must be no delayed replay of the original attachment.
    const discardSession='picket-discard-without-reupload'
    const modelBefore=logLines().filter(x=>x==='model-call').length
    const held=await request(13,'session/prompt',{
      sessionId:discardSession,contentBlocks:[
        {type:'text',text:'BLOCK TEST'},
        {type:'image',mimeType:'image/png',data:tinyPng},
      ],
    })
    assert.equal(typeof (held.result as any)?.messageId,'string')
    await until(()=>eventsFor(discardSession).some(x=>x.type==='turn/end'),
      'discard session first attempted turn rejected')
    assert.deepEqual(eventsFor(discardSession).filter(x=>x.type==='turn/end')
      .map(x=>x.data.reason.kind),['blocked'])
    assert.equal(logLines().filter(x=>x==='model-call').length,modelBefore,
      'The refused text and attachment did not invoke the offline model')
    const newText=await request(14,'session/prompt',{
      sessionId:discardSession,
      contentBlocks:[{type:'text',text:'NO IMAGE RESEND'}],
    })
    assert.equal(typeof (newText.result as any)?.messageId,'string')
    await until(()=>eventsFor(discardSession).filter(x=>x.type==='turn/end').length===2,
      'new user text without image completes after refusal')
    assert.deepEqual(eventsFor(discardSession).filter(x=>x.type==='turn/end')
      .map(x=>x.data.reason.kind),['blocked','completed'])
    assert.equal(logLines().filter(x=>x==='model-call').length,modelBefore+1)
    assert.equal(logLines().filter(x=>x==='noimage-resend-saw-old-text=true').length,0)
    assert.equal(logLines().filter(x=>x==='noimage-resend-saw-old-attachment=true').length,0,
      'The Host cannot secretly replay the refused image when user did not reupload')

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
