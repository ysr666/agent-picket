import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  appendFileSync, chmodSync, existsSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { DurableStats } from '../src/adapters/node/durable-stats.ts'
import type { WorkEvent } from '../src/core/types.ts'

const entry = resolve(import.meta.dirname, '../src/adapters/node/durable-stats.ts')
const mkEvent = (id: string): WorkEvent => ({
  type: 'tool-start', id, agentId: 'agent-secret', sessionId: 'session-secret',
  recordedAtMs: 1_760_000_000_000,
})
function withDir(cb: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'ap-wal-'))
  try { cb(dir) }
  finally { rmSync(dir, { recursive: true, force: true }) }
}
function spawnKilledWriter(dir: string): ReturnType<typeof spawnSync> {
  const source = [
    `import { DurableStats } from ${JSON.stringify(entry)}`,
    `const stats=new DurableStats(${JSON.stringify(dir)})`,
    "stats.recordWork({id:'KILLED_CHILD_EVENT',type:'tool-start',agentId:'a',sessionId:'s',recordedAtMs:1760000000000})",
    "process.kill(process.pid,'SIGKILL')",
  ].join('\n')
  return spawnSync(process.execPath, ['--experimental-strip-types',
    '--input-type=module', '--eval', source],
  { encoding: 'utf8', timeout: 5000 })
}

test('crash simulation: SIGKILL owner leaves lock; verified-dead PID recovers and replays journal', () => withDir(dir => {
  const killed=spawnKilledWriter(dir)
  assert.equal(killed.signal, 'SIGKILL', String(killed.stderr))
  assert.ok(existsSync(join(dir,'aggregate.v1.lock')))
  const stats=new DurableStats(dir)
  try {
    assert.equal(stats.snapshot().toolCalls,1)
    assert.equal(stats.recordWork({
      type:'tool-start',id:'KILLED_CHILD_EVENT',agentId:'a',sessionId:'s',
      recordedAtMs:1760000000000,
    }),false,'A replayed command cannot double-count after crash')
    assert.equal(stats.recordWork(mkEvent('new-event')),true)
  } finally { stats.close() }
  const reopened=new DurableStats(dir)
  assert.equal(reopened.snapshot().toolCalls,2)
  reopened.close()
  assert.equal(existsSync(join(dir,'aggregate.v1.lock')),false)
  assert.equal(existsSync(join(dir,'aggregate.v1.recovery')),false)
}))

test('live owner cannot be stolen, same PID reused is intentionally treated as alive', () => withDir(dir => {
  const a=new DurableStats(dir)
  try {
    assert.throws(() => new DurableStats(dir),/live owner/)
    assert.equal(existsSync(join(dir,'aggregate.v1.recovery')),false)
    const lock=JSON.parse(readFileSync(join(dir,'aggregate.v1.lock'),'utf8'))
    assert.equal(lock.pid,process.pid)
    assert.equal(lock.host,hostname())
    assert.equal(typeof lock.token,'string')
  } finally { a.close() }
}))

test('unrecognized old-format lock is NOT automatically deleted', () => withDir(dir => {
  writeFileSync(join(dir,'aggregate.v1.lock'),'deadbeeflegacy',{mode:0o600})
  assert.throws(()=>new DurableStats(dir),/Legacy\/unreadable lock/)
  assert.equal(readFileSync(join(dir,'aggregate.v1.lock'),'utf8'),'deadbeeflegacy')
}))

test('a final torn journal line is safely removed, preserving all complete fsynced events', () => withDir(dir => {
  const a=new DurableStats(dir)
  try { a.recordWork(mkEvent('first')) }
  finally { a.close() }
  const journal=join(dir,'aggregate.v1.journal')
  appendFileSync(journal,'{"seq":2,"fp":"PARTIAL_CRASH_TEST"')
  const b=new DurableStats(dir)
  try {
    assert.equal(b.snapshot().toolCalls,1)
    assert.equal(b.recordWork(mkEvent('second')),true)
    assert.equal(readFileSync(journal,'utf8').includes('PARTIAL_CRASH_TEST'),false)
  } finally { b.close() }
  const c=new DurableStats(dir)
  assert.equal(c.snapshot().toolCalls,2)
  c.close()
}))

test('tampered fully committed journal row is rejected, never silently reset', () => withDir(dir => {
  const a=new DurableStats(dir)
  try { a.recordWork(mkEvent('first')) }
  finally { a.close() }
  const journal=join(dir,'aggregate.v1.journal')
  const original=readFileSync(journal,'utf8')
  const corrupt=original.replace('"toolCalls":1','"toolCalls":2')
  assert.notEqual(original,corrupt)
  writeFileSync(journal,corrupt,{mode:0o600})
  assert.throws(()=>new DurableStats(dir),/Corrupt journal digest/)
  assert.equal(readFileSync(journal,'utf8'),corrupt)
  assert.equal(existsSync(join(dir,'aggregate.v1.lock')),false)
}))

test('256-record checkpoint + subsequent WAL replay preserves exactly-once totals', () => withDir(dir => {
  const a=new DurableStats(dir)
  for(let i=0;i<270;i++) a.recordWork(mkEvent('tool-'+i))
  a.close()
  const snapshot=JSON.parse(readFileSync(join(dir,'aggregate.v1.json'),'utf8'))
  assert.equal(snapshot.sequence,256)
  assert.equal(snapshot.totals.toolCalls,256)
  const journal=readFileSync(join(dir,'aggregate.v1.journal'),'utf8')
  assert.equal(journal.split('\n').filter(Boolean).length,14)
  assert.equal(statSync(join(dir,'aggregate.v1.journal')).mode & 0o777,0o600)
  const b=new DurableStats(dir)
  try {
    assert.equal(b.snapshot().toolCalls,270)
    assert.equal(b.recordWork(mkEvent('tool-10')),false)
    assert.equal(b.recordWork(mkEvent('tool-269')),false)
    assert.equal(b.recordWork(mkEvent('tool-270')),true)
    const raw = readFileSync(join(dir,'aggregate.v1.journal'),'utf8')
    for(const secret of ['agent-secret','session-secret','tool-269']) {
      assert.equal(raw.includes(secret),false, 'Raw identifier leaked: '+secret)
    }
  } finally { b.close() }
}))

test('legacy PR #25 JSON snapshot without sequence is migrated on first checkpoint', () => withDir(dir => {
  const a=new DurableStats(dir)
  a.close()
  const file=join(dir,'aggregate.v1.json')
  const object=JSON.parse(readFileSync(file,'utf8'))
  delete object.sequence
  writeFileSync(file,JSON.stringify(object),{mode:0o600})
  const b=new DurableStats(dir)
  assert.equal(b.recordWork(mkEvent('legacy-safe')),true)
  b.close()
  const c=new DurableStats(dir)
  assert.equal(c.snapshot().toolCalls,1)
  c.close()
}))

test('overpermissive journal refuses loading, preserving source contents', () => withDir(dir => {
  const a=new DurableStats(dir)
  a.recordWork(mkEvent('file-perm'))
  a.close()
  const path=join(dir,'aggregate.v1.journal')
  const original=readFileSync(path,'utf8')
  chmodSync(path,0o644)
  assert.throws(()=>new DurableStats(dir),/Invalid\/private journal/)
  assert.equal(readFileSync(path,'utf8'),original)
  assert.equal(readdirSync(dir).includes('aggregate.v1.lock'),false)
}))

test('crash between committed snapshot and journal replacement never resurrects erased totals', () => withDir(dir => {
  const ledger=new DurableStats(dir)
  ledger.recordWork(mkEvent('must-be-erased'))
  ledger.close()
  const file=join(dir,'aggregate.v1.json')
  const snapshot=JSON.parse(readFileSync(file,'utf8'))
  // Reproduce the narrow crash window: new zeroed key + checkpoint persisted
  // but the old WAL still exists and contains pre-erase data.
  const resetSnapshot = {
    ...snapshot, sequence:1, secret:'ab'.repeat(32), seen:[],
    daily:{}, totals:Object.fromEntries(Object.keys(snapshot.totals).map(k=>[k,0])),
  }
  writeFileSync(file,JSON.stringify(resetSnapshot),{mode:0o600})
  const reopened=new DurableStats(dir)
  try {
    assert.equal(reopened.snapshot().toolCalls,0)
    assert.equal(reopened.recordWork(mkEvent('after-erase')),true)
    assert.equal(reopened.snapshot().toolCalls,1)
  } finally { reopened.close() }
  const third=new DurableStats(dir)
  assert.equal(third.snapshot().toolCalls,1)
  third.close()
}))

test('recovery mutex blocks any speculative stale-lock takeover', () => withDir(dir => {
  writeFileSync(join(dir,'aggregate.v1.lock'),
    JSON.stringify({version:1,pid:2147483647,host:hostname(),token:'aa'.repeat(16)}),
    {mode:0o600})
  writeFileSync(join(dir,'aggregate.v1.recovery'),'other-recovery-running',{mode:0o600})
  assert.throws(()=>new DurableStats(dir), /EEXIST/)
  assert.equal(existsSync(join(dir,'aggregate.v1.lock')),true)
  assert.equal(existsSync(join(dir,'aggregate.v1.recovery')),true)
}))
