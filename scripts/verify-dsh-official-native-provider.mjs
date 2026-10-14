/**
 * Native, offline, no-model integration probe of the published DSH JSONL
 * SessionPersistence provider. Does NOT prove DSH Web/Desktop Goal enforcement.
 * Isolated under a temporary directory; no real profile or user data is read.
 * Installed published modules are resolved from .dsh-provider-probe.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const execFileAsync = promisify(execFile)
const probeRoot = join(process.cwd(), '.dsh-provider-probe')
const resolvePackage = createRequire(join(probeRoot, 'package.json'))
async function packageImport(name) {
  return import(pathToFileURL(resolvePackage.resolve(name)).href)
}
async function createProvider(root) {
  const { Context } = await packageImport('@deepseek-ai/cordis')
  const { default: JsonlSessionPersistence } = await packageImport('@deepseek-ai/dsh-session-persistence-jsonl')
  const ctx = new Context()
  await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
  assert.ok(ctx.get('sessionPersistence'), 'official JSONL service must be installed')
  // Exercise a THIRD-PARTY Cordis plugin's declarative service injection.
  // This is still not the full dsh Web/Desktop profile install path.
  let injected = false
  await ctx.plugin({
    name: 'picket-test-read-only-consumer',
    inject: ['sessionPersistence'],
    apply(child) {
      assert.ok(child.get('sessionPersistence'))
      injected = true
    },
  })
  assert.ok(injected, 'third-party Cordis inject must resolve the official provider')
  return ctx
}
async function inspect(root) {
  const ctx = await createProvider(root)
  try {
    const service = ctx.get('sessionPersistence')
    const listing = await service.list()
    assert.equal(listing.length, 2, 'only the two isolated synthetic sessions are listed')
    let complete = 0
    let incomplete = 0
    for (const entry of listing) {
      const handle = await service.open(entry.header.id, 'read')
      try {
        assert.equal(handle.access, 'read')
        const events = (await handle.read(0, 100)).events
        assert.deepEqual(events.map(e => e.seq), events.map((_, i) => i))
        const started = events.filter(e => e.type === 'turn/start')
        const ended = events.filter(e => e.type === 'turn/end')
        assert.equal(started.length, 1)
        if (ended.length === 1) {
          assert.equal(ended[0].data.reason.kind, 'completed')
          assert.equal(ended[0].data.turn, started[0].data.turn)
          complete++
        } else {
          assert.equal(ended.length, 0)
          incomplete++
        }
      } finally {
        await handle.close()
      }
    }
    assert.equal(complete, 1)
    assert.equal(incomplete, 1)
    return { provider: 'DSH published JSONL', coldRead: true, sessions: listing.length, complete, incomplete }
  } finally {
    await ctx.fiber.dispose()
  }
}
async function main() {
  const { SESSION_FORMAT_VERSION, SessionSeq, SessionId } = await packageImport('@deepseek-ai/dsh-session')
  const root = await mkdtemp(join(tmpdir(), 'picket-dsh-provider-'))
  try {
    const ctx = await createProvider(root)
    try {
      const service = ctx.get('sessionPersistence')
      // This validates direct official Context service availability. A third-party
      // package loaded by the DSH profile still requires its own Host test.
      const now = Date.now()
      for (const [suffix, withEnd] of [['complete', true], ['unfinished', false]]) {
        const id = SessionId('picket-offline-' + suffix)
        const h = await service.create({ id, version: SESSION_FORMAT_VERSION, createdAt: now, isSeeded: false })
        try {
          const events = [{ seq: SessionSeq(0), time: now - 1000, type: 'turn/start', data: { turn: 1 } }]
          if (withEnd) events.push({ seq: SessionSeq(1), time: now, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
          await h.append(events)
          await h.flush()
        } finally {
          await h.close()
        }
      }
      await service.flush()
    } finally {
      await ctx.fiber.dispose()
    }
    // A separate OS process starts a FRESH provider, rather than reusing an
    // in-memory session or one process's cache. Read-only; no model or API key.
    const { stdout } = await execFileAsync(process.execPath, [fileURLToPath(import.meta.url), '--cold', root], {
      maxBuffer: 16 * 1024,
    })
    const result = JSON.parse(stdout.trim())
    assert.deepEqual(result, { provider: 'DSH published JSONL', coldRead: true, sessions: 2, complete: 1, incomplete: 1 })
    process.stdout.write(JSON.stringify({ result: 'PASS', scope: 'published-provider-cold-process-only', ...result }) + '\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
if (process.argv[2] === '--cold') {
  const root = process.argv[3]
  if (typeof root !== 'string' || !root) throw Error('cold process requires isolated directory')
  process.stdout.write(JSON.stringify(await inspect(root)) + '\n')
} else {
  await main()
}
