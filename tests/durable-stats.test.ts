import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { DurableStats } from '../src/adapters/node/durable-stats.ts'
import { completedUtcDayWork } from '../src/adapters/dsh/goal-work-enforcement.ts'
import type { HumanPrompt, WorkEvent } from '../src/core/types.ts'

function withPrivateDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'agentpicket-stats-'))
  try { run(dir) }
  finally { rmSync(dir, { recursive: true, force: true }) }
}
const event = (id: string, type: WorkEvent['type'], at = 10): WorkEvent =>
  ({ id, type, recordedAtMs: at, agentId: 'AGENT_SECRET_1', sessionId: 'SESSION_SECRET_2' })
const prompt = (id: string, text: string): HumanPrompt =>
  ({ id, agentId: 'AGENT_SECRET_1', sessionId: 'SESSION_SECRET_2',
    receivedAtMs: 100, provenance: { actor: 'human', assurance: 'claimed' },
    segments: [{ kind: 'text', text }] })

test('default stores WORK counts only, no prompt metadata, private file permissions', () => withPrivateDir(dir => {
  const ledger = new DurableStats(dir)
  try {
    assert.equal(ledger.classificationEnabled, false)
    assert.equal(ledger.recordWork(event('EVENT_SECRET_1', 'turn-start', 100)), true)
    assert.equal(ledger.recordWork(event('EVENT_SECRET_1', 'turn-start', 100)), false)
    assert.equal(ledger.recordWork(event('EVENT_SECRET_2', 'tool-start', 105)), true)
    assert.equal(ledger.recordWork(event('EVENT_SECRET_3', 'tool-end', 125)), true)
    assert.equal(ledger.recordWork(event('EVENT_SECRET_4', 'turn-end', 180)), true)
    assert.equal(ledger.recordDetection(prompt('MESSAGE_SECRET_7','you are an idiot RAW_SECRET_5'),{
      verdict: 'targeted-abuse', confidence: 0.99,
    }), false)
    const stats = ledger.snapshot()
    assert.equal(stats.turnStarts, 1)
    assert.equal(stats.turnEnds, 1)
    assert.equal(stats.toolCalls, 1)
    assert.equal(stats.toolResults, 1)
    assert.equal(stats.completedTurnMs, 80)
    assert.equal(stats.checked, 0)
    assert.deepEqual(ledger.snapshotDays().map(x => x.day), ['1970-01-01'])
    assert.equal(ledger.snapshotDays()[0]!.totals.completedTurnMs,80)
    const raw = readFileSync(join(dir, 'aggregate.v1.json'), 'utf8')
    for(const secret of ['AGENT_SECRET_1','SESSION_SECRET_2','EVENT_SECRET_1',
      'MESSAGE_SECRET_7','RAW_SECRET_5','idiot']) {
      assert.equal(raw.includes(secret),false,'Data written to disk: '+secret)
    }
    assert.equal(statSync(dir).mode & 0o777, 0o700)
    assert.equal(statSync(join(dir, 'aggregate.v1.json')).mode & 0o777,0o600)
    assert.equal(statSync(join(dir, 'aggregate.v1.lock')).mode & 0o777,0o600)
  } finally { ledger.close() }
  assert.equal(existsSync(join(dir,'aggregate.v1.lock')),false)
}))

test('cross-restart deduplication and conservative in-process turn timing', () => withPrivateDir(dir => {
  const a = new DurableStats(dir)
  a.recordWork(event('start','turn-start',100))
  a.close()
  const b = new DurableStats(dir)
  try {
    assert.equal(b.recordWork(event('start','turn-start',100)),false)
    assert.equal(b.recordWork(event('end','turn-end',300)),true)
    assert.equal(b.snapshot().completedTurnMs,0)
    assert.equal(b.snapshot().turnStarts,1)
    assert.equal(b.snapshot().turnEnds,1)
    const copy = b.snapshot() as { turnStarts: number }
    copy.turnStarts = 9999
    assert.equal(b.snapshot().turnStarts,1)
  } finally { b.close() }
}))

test('opted-in classification counts still omit content and deduplicate across restarts', () => withPrivateDir(dir => {
  const a = new DurableStats(dir,{classificationEnabled:true})
  assert.equal(a.recordDetection(prompt('prompt-one','you are an idiot very-private-test'), {
    verdict: 'targeted-abuse', confidence:.96,
  }),true)
  a.close()
  const b = new DurableStats(dir,{classificationEnabled:true})
  try {
    assert.equal(b.recordDetection(prompt('prompt-one','you are an idiot very-private-test'),{
      verdict:'targeted-abuse',confidence:.96,
    }),false)
    assert.equal(b.snapshot().checked,1)
    assert.equal(b.snapshot().targeted,1)
    assert.equal(readFileSync(join(dir,'aggregate.v1.json'),'utf8').includes('very-private-test'),false)
  } finally { b.close() }
}))

test('simultaneous writers cannot corrupt stats; deliberate erase rotates pseudonymous key', () => withPrivateDir(dir => {
  const a = new DurableStats(dir)
  try {
    assert.throws(() => new DurableStats(dir),/live owner|EEXIST/)
    a.recordWork(event('event-one','tool-start',2))
    const before = JSON.parse(readFileSync(join(dir,'aggregate.v1.json'),'utf8'))
    a.reset()
    const after = JSON.parse(readFileSync(join(dir,'aggregate.v1.json'),'utf8'))
    assert.notEqual(before.secret,after.secret)
    assert.equal(after.seen.length,0)
    assert.equal(a.snapshot().toolCalls,0)
    assert.equal(a.recordWork(event('event-one','tool-start',2)),true)
  } finally { a.close() }
  const next = new DurableStats(dir)
  assert.equal(next.snapshot().toolCalls,1)
  next.close()
}))

test('corrupt records and over-permissive storage fail without deleting other data', () => {
  withPrivateDir(dir => {
    const file = join(dir,'aggregate.v1.json')
    writeFileSync(file,'CORRUPT_KEEP_ME',{mode:0o600})
    assert.throws(() => new DurableStats(dir),/SyntaxError|JSON/)
    assert.equal(readFileSync(file,'utf8'),'CORRUPT_KEEP_ME')
    assert.equal(existsSync(join(dir,'aggregate.v1.lock')),false)
  })
  withPrivateDir(dir => {
    chmodSync(dir,0o755)
    assert.throws(() => new DurableStats(dir),/private/)
    assert.equal(existsSync(join(dir,'aggregate.v1.json')),false)
  })
})

test('untrusted non-work events and nonhuman classifications do not produce lasting counts', () => withPrivateDir(dir => {
  const a = new DurableStats(dir,{classificationEnabled:true})
  try {
    const invalid = {...event('invalid','tool-start'),'type':'unknown'} as unknown as WorkEvent
    assert.equal(a.recordWork(invalid),false)
    assert.equal(a.recordDetection({
      ...prompt('not-human','bad words'),
      provenance:{actor:'tool',assurance:'unknown'},
    },{verdict:'targeted-abuse',confidence:.95}),false)
    assert.equal(a.snapshot().checked,0)
    assert.equal(a.snapshot().toolCalls,0)
  } finally { a.close() }
}))

test('daily UTC summaries survive restart and remain totals-only', () => withPrivateDir(dir => {
  const a = new DurableStats(dir)
  const first=Date.parse('2026-10-09T23:59:59.000Z')
  const second=Date.parse('2026-10-10T00:00:10.000Z')
  a.recordWork(event('oct9','tool-start',first))
  a.recordWork(event('oct10','tool-end',second))
  assert.deepEqual(a.snapshotDays().map(v => v.day),['2026-10-09','2026-10-10'])
  a.close()
  const b = new DurableStats(dir)
  try {
    assert.equal(b.snapshotDays()[0]?.totals.toolCalls,1)
    assert.equal(b.snapshotDays()[1]?.totals.toolResults,1)
    assert.equal(b.recordWork(event('oct9','tool-start',first)),false)
    assert.equal(b.snapshotDays()[0]?.totals.toolCalls,1)
    assert.throws(()=>b.snapshotDays(50),/1..31/)
    const copy = b.snapshotDays()[0]!.totals as {toolCalls:number}
    copy.toolCalls = 100
    assert.equal(b.snapshotDays()[0]?.totals.toolCalls,1)
  } finally { b.close() }
}))

test('physical Goal counter accepts only a live owner of the original WAL and private lock', {
  skip: process.platform === 'win32' && 'Production NTFS backend remains fail closed',
}, () => withPrivateDir(dir => {
  const ledger=new DurableStats(dir)
  const start=Date.parse('2026-10-13T10:00:00.000Z')
  const end=start+8*3_600_000
  try {
    assert.equal(ledger.recordWork(event('trusted-start','turn-start',start)),true)
    assert.equal(ledger.recordWork(event('trusted-end','turn-end',end)),true)
    assert.equal(ledger.trustedWorkDays(31)?.at(-1)?.totals.completedTurnMs,8*3_600_000)
    // Replace just the filename, leaving an already-open valid WAL FD behind.
    // A stale in-memory eight hours must never become physical-strike proof.
    renameSync(join(dir,'aggregate.v1.journal'),join(dir,'moved.journal'))
    writeFileSync(join(dir,'aggregate.v1.journal'),'',{mode:0o600})
    assert.equal(ledger.trustedWorkDays(31),null)
    assert.equal(completedUtcDayWork(ledger.trustedWorkDays(31)??undefined,end+1),null,
      'Even a previously genuine 8h counter cannot trigger a Goal when its WAL is replaced')
    assert.equal(ledger.trustedWorkDays(31),null,'Storage remains faulted')
    assert.throws(()=>ledger.recordWork(event('later','tool-start',end+1)),/not writable/)
    assert.equal(ledger.snapshotDays(31).at(-1)?.totals.completedTurnMs,8*3_600_000,
      'Historical cached stats remain displayable but cannot trigger a real strike')
  } finally { ledger.close() }
}))
test('closed and owner-lock-mismatched work counter is untrusted, even with 8h cached', {
  skip: process.platform === 'win32' && 'Production NTFS backend remains fail closed',
}, () => withPrivateDir(dir => {
  const a=new DurableStats(dir)
  const start=Date.parse('2026-10-13T10:00:00.000Z')
  a.recordWork(event('begin','turn-start',start))
  a.recordWork(event('finish','turn-end',start+8*3_600_000))
  const lock=join(dir,'aggregate.v1.lock')
  const body=JSON.parse(readFileSync(lock,'utf8')) as Record<string,unknown>
  writeFileSync(lock,JSON.stringify({...body,token:'1'.repeat(32)}),{mode:0o600})
  assert.equal(a.trustedWorkDays(31),null,'Tampered owner lock is never enforcement proof')
  a.close()
  assert.equal(a.trustedWorkDays(31),null,'Closed ledger cannot authorize real strike')
  assert.equal(existsSync(lock),true,'Never remove a foreign lock')
}))
