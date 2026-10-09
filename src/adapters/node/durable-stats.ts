import { createHmac, randomBytes } from 'node:crypto'
import {
  closeSync, existsSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync,
  openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync,
} from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import type { DetectionResult, HumanPrompt, WorkEvent } from '../../core/types.ts'

/**
 * Local-first analytics. Only counters, UTC daily aggregates and KEYED event
 * fingerprints go to disk. A keyed fingerprint is pseudonymous, NOT anonymous.
 * Host prompt text, Session IDs and raw Event IDs are NEVER serialized.
 */
export interface DurableTotals {
  readonly turnStarts: number
  readonly turnEnds: number
  readonly toolCalls: number
  readonly toolResults: number
  /** In-process completed spans; does not estimate work across a restart. */
  readonly completedTurnMs: number
  readonly checked: number
  readonly safe: number
  readonly review: number
  readonly targeted: number
}
type Totals = { -readonly [K in keyof DurableTotals]: number }
interface DiskLedger {
  readonly version: 1
  readonly secret: string
  readonly sequence?: number // absent in legacy snapshot from PR #25
  readonly totals: DurableTotals
  readonly daily: Readonly<Record<string, DurableTotals>>
  readonly seen: readonly string[]
}
interface JournalEntry {
  readonly seq: number
  readonly fp: string
  readonly changes: Partial<Totals>
  readonly atMs: number
  readonly mac: string
}
interface LockData {
  readonly version: 1
  readonly pid: number
  readonly host: string
  readonly token: string
}
const ZERO: Readonly<DurableTotals> = Object.freeze({
  turnStarts: 0, turnEnds: 0, toolCalls: 0, toolResults: 0,
  completedTurnMs: 0, checked: 0, safe: 0, review: 0, targeted: 0,
})
const KEYS = Object.keys(ZERO) as (keyof DurableTotals)[]
const FILE = 'aggregate.v1.json'
const JOURNAL = 'aggregate.v1.journal'
const LOCK = 'aggregate.v1.lock'
const RECOVERY = 'aggregate.v1.recovery'
const MAX_FINGERPRINTS = 16_384
const MAX_DAYS = 366
const MAX_FILE_BYTES = 2_000_000
const MAX_JOURNAL_BYTES = 4_000_000
const CHECKPOINT_EVERY = 256
const eventTypes = new Set(['turn-start', 'turn-end', 'tool-start', 'tool-end'])
const verdicts = new Set(['safe', 'suspected-abuse', 'targeted-abuse'])
const FP_RE = /^[A-Za-z0-9_-]{43}$/

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0
}
function assertData(input: unknown): DiskLedger {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid ledger')
  const d = input as Partial<DiskLedger>
  if (d.version !== 1 || typeof d.secret !== 'string' ||
    !/^[a-f0-9]{64}$/.test(d.secret) ||
    (d.sequence !== undefined && !safeInteger(d.sequence)) ||
    !d.totals || typeof d.totals !== 'object' ||
    !d.daily || typeof d.daily !== 'object' || Array.isArray(d.daily) ||
    !Array.isArray(d.seen) || d.seen.length > MAX_FINGERPRINTS) {
    throw new Error('Unsupported or corrupt ledger')
  }
  for (const key of KEYS) {
    if (!safeInteger(d.totals[key])) throw new Error('Invalid counter')
  }
  const daily = Object.entries(d.daily)
  if (daily.length > MAX_DAYS) throw new Error('Daily rollups exceeded cap')
  for (const [day, counts] of daily) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day ||
      !counts || typeof counts !== 'object') throw new Error('Invalid UTC day')
    for (const key of KEYS) {
      if (!safeInteger(counts[key])) throw new Error('Invalid daily counter')
    }
  }
  if (d.seen.some(id => typeof id !== 'string' || !FP_RE.test(id))) {
    throw new Error('Invalid dedup fingerprint')
  }
  if (new Set(d.seen).size !== d.seen.length) throw new Error('Duplicate fingerprints')
  return d as DiskLedger
}
function privateRegularFile(path: string, maxSize: number): boolean {
  const stat = lstatSync(path)
  return stat.isFile() && stat.nlink === 1 &&
    (stat.mode & 0o077) === 0 && stat.size <= maxSize
}
function deadPid(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

export class DurableStats {
  readonly #dir: string
  readonly #lockToken = randomBytes(16).toString('hex')
  readonly #classificationEnabled: boolean
  #data!: DiskLedger
  #closed = false
  #faulted = false
  #ownedLock = false
  #journalFd: number | undefined
  #sequence = 0
  #sinceCheckpoint = 0
  readonly #seenSet = new Set<string>()
  readonly #pendingTurnStarts = new Map<string, number>()

  constructor(directory: string, options: { classificationEnabled?: boolean } = {}) {
    this.#classificationEnabled = options.classificationEnabled === true
    if (typeof directory !== 'string' || !directory.trim()) throw new Error('Stats directory required')
    this.#dir = directory
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const info = lstatSync(directory)
    if (!info.isDirectory() || (info.mode & 0o077) !== 0) {
      throw new Error('Stats directory must be private and not a symlink')
    }
    this.#acquireLock()
    try {
      const ledger = join(directory, FILE)
      if (existsSync(ledger)) {
        if (!privateRegularFile(ledger, MAX_FILE_BYTES)) {
          throw new Error('Invalid or publicly accessible ledger file')
        }
        this.#data = assertData(JSON.parse(readFileSync(ledger, 'utf8')))
      } else {
        // Journal without a snapshot is not safe to replay: the HMAC key would
        // have been lost. Never silently create a fresh summary over it.
        if (existsSync(join(directory, JOURNAL)) &&
          lstatSync(join(directory, JOURNAL)).size > 0) {
          throw new Error('Missing ledger snapshot with nonempty journal')
        }
        this.#data = { version: 1, secret: randomBytes(32).toString('hex'),
          sequence: 0, totals: { ...ZERO }, daily: {}, seen: [] }
        this.#saveSnapshot(this.#data)
      }
      this.#sequence = this.#data.sequence ?? 0
      for (const id of this.#data.seen) this.#seenSet.add(id)
      this.#replayJournal()
      this.#journalFd = openSync(join(directory, JOURNAL), 'a', 0o600)
    } catch (error) {
      this.close()
      throw error
    }
  }

  #lockBody(): string {
    return JSON.stringify({
      version: 1, pid: process.pid, host: hostname(), token: this.#lockToken,
    } satisfies LockData)
  }
  #takeLock(): void {
    const fd = openSync(join(this.#dir, LOCK), 'wx', 0o600)
    try {
      writeFileSync(fd, this.#lockBody())
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    this.#ownedLock = true
  }
  #acquireLock(): void {
    try {
      this.#takeLock()
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    // Serialize stale-lock recovery attempts with another exclusive lock.
    // If a recovery process itself crashes, refuse instead of guessing.
    const recoveryPath = join(this.#dir, RECOVERY)
    const fd = openSync(recoveryPath, 'wx', 0o600)
    try {
      if (!privateRegularFile(join(this.#dir, LOCK), 4096)) {
        throw new Error('Unsafe lock file; manual inspection required')
      }
      let other: LockData
      try {
        other = JSON.parse(readFileSync(join(this.#dir, LOCK), 'utf8'))
      } catch {
        throw new Error('Legacy/unreadable lock requires manual inspection')
      }
      if (other.version !== 1 || typeof other.token !== 'string' ||
        !/^[0-9a-f]{32}$/.test(other.token) ||
        other.host !== hostname() || !deadPid(other.pid)) {
        throw new Error('Stats lock may have a live owner; refusing to steal it')
      }
      // A dead PID on THIS host plus the recovery mutex is required. A PID
      // recycled by the OS appears live and will never be auto-reclaimed.
      unlinkSync(join(this.#dir, LOCK))
      this.#takeLock() // 'wx' still protects against a concurrently arriving writer.
    } finally {
      closeSync(fd)
      unlinkSync(recoveryPath)
    }
  }

  #fingerprint(kind: 'work' | 'detection' | 'session', values: readonly string[]): string {
    return createHmac('sha256', Buffer.from(this.#data.secret, 'hex'))
      .update(JSON.stringify([kind, ...values])).digest('base64url')
  }
  #mac(seq: number, fp: string, changes: Partial<Totals>, atMs: number): string {
    return createHmac('sha256', Buffer.from(this.#data.secret, 'hex'))
      .update(JSON.stringify([seq, fp, changes, atMs])).digest('base64url')
  }

  #saveSnapshot(data: DiskLedger): void {
    const dest = join(this.#dir, FILE)
    const temp = join(this.#dir, 'aggregate.v1-' + randomBytes(8).toString('hex') + '.tmp')
    let fd: number | undefined
    try {
      fd = openSync(temp, 'wx', 0o600)
      writeFileSync(fd, JSON.stringify(data))
      fsyncSync(fd)
      closeSync(fd)
      fd = undefined
      renameSync(temp, dest)
    } finally {
      if (fd !== undefined) closeSync(fd)
      if (existsSync(temp)) unlinkSync(temp)
    }
  }
  #validateChange(changes: Partial<Totals>): void {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Invalid changes')
    for (const [key, number] of Object.entries(changes)) {
      if (!KEYS.includes(key as keyof Totals) || !safeInteger(number)) {
        throw new Error('Invalid event counters')
      }
    }
  }
  #apply(fp: string, changes: Partial<Totals>, atMs: number): void {
    if (this.#seenSet.has(fp)) throw new Error('Duplicate committed journal event')
    if (!Number.isFinite(atMs) || atMs < 0 || atMs > 8_640_000_000_000_000) {
      throw new Error('Invalid event timestamp')
    }
    this.#validateChange(changes)
    const day = new Date(atMs).toISOString().slice(0, 10)
    const totals: Totals = { ...this.#data.totals }
    const dayTotals: Totals = { ...(this.#data.daily[day] ?? ZERO) }
    for (const key of KEYS) {
      const add = changes[key] ?? 0
      if (!Number.isSafeInteger(totals[key] + add) ||
          !Number.isSafeInteger(dayTotals[key] + add)) throw new Error('Counter overflow')
      totals[key] += add
      dayTotals[key] += add
    }
    const daily: Record<string, DurableTotals> = { ...this.#data.daily, [day]: dayTotals }
    for (const oldDay of Object.keys(daily).sort()
      .slice(0, Math.max(0, Object.keys(daily).length - MAX_DAYS))) delete daily[oldDay]
    const seen = [...this.#data.seen, fp].slice(-MAX_FINGERPRINTS)
    if (this.#data.seen.length === MAX_FINGERPRINTS) this.#seenSet.delete(this.#data.seen[0]!)
    this.#seenSet.add(fp)
    this.#data = { ...this.#data, totals, daily, seen }
  }

  #replayJournal(): void {
    const name = join(this.#dir, JOURNAL)
    if (!existsSync(name)) return
    if (!privateRegularFile(name, MAX_JOURNAL_BYTES)) throw new Error('Invalid/private journal required')
    const bytes = readFileSync(name)
    if (bytes.length === 0) return
    const lastNewline = bytes.lastIndexOf(10)
    const complete = bytes.subarray(0, lastNewline + 1).toString('utf8')
    const lines = complete.split('\n').filter(Boolean)
    let lastSeq = 0
    for (const line of lines) {
      const item = JSON.parse(line) as JournalEntry
      if (!safeInteger(item.seq) || item.seq <= lastSeq ||
        !FP_RE.test(item.fp) || !safeInteger(item.atMs) ||
        typeof item.mac !== 'string') throw new Error('Corrupt journal sequence')
      lastSeq = item.seq
      // Entries still present after a committed snapshot are safe to skip.
      if (item.seq <= this.#sequence) continue
      if (item.seq !== this.#sequence + 1) throw new Error('Journal sequence gap')
      this.#validateChange(item.changes)
      if (this.#mac(item.seq, item.fp, item.changes, item.atMs) !== item.mac) {
        throw new Error('Corrupt journal digest')
      }
      this.#apply(item.fp, item.changes, item.atMs)
      this.#sequence = item.seq
      this.#sinceCheckpoint++
    }
    if (lastNewline + 1 < bytes.length) {
      // A crash can leave a final half-written line. Only a final line with
      // no newline can be discarded; earlier malformed records are rejected.
      const fd = openSync(name, 'r+')
      try {
        ftruncateSync(fd, lastNewline + 1)
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
    }
  }

  #checkpoint(data: DiskLedger): void {
    this.#saveSnapshot({ ...data, sequence: this.#sequence })
    const journal = join(this.#dir, JOURNAL)
    const tmp = join(this.#dir, 'aggregate.v1-' + randomBytes(8).toString('hex') + '.tmp')
    let fd: number | undefined
    try {
      fd = openSync(tmp, 'wx', 0o600)
      fsyncSync(fd)
      closeSync(fd)
      fd = undefined
      renameSync(tmp, journal)
      if (this.#journalFd !== undefined) closeSync(this.#journalFd)
      this.#journalFd = openSync(journal, 'a', 0o600)
      this.#sinceCheckpoint = 0
    } finally {
      if (fd !== undefined) closeSync(fd)
      if (existsSync(tmp)) unlinkSync(tmp)
    }
  }

  #commit(fp: string, changes: Partial<Totals>, atMs: number): boolean {
    if (this.#closed || this.#faulted) throw new Error('Ledger not writable')
    if (this.#seenSet.has(fp)) return false
    if (!Number.isSafeInteger(atMs) || atMs < 0 || atMs > 8_640_000_000_000_000) {
      throw new Error('Invalid event timestamp')
    }
    this.#validateChange(changes)
    const seq = this.#sequence + 1
    if (!Number.isSafeInteger(seq)) throw new Error('Journal sequence exhausted')
    // Safely check overflow *before* persisting the new event.
    for(const key of KEYS) {
      if (!Number.isSafeInteger(this.#data.totals[key] + (changes[key] ?? 0))) {
        throw new Error('Counter overflow')
      }
    }
    const item: JournalEntry = { seq, fp, changes, atMs,
      mac: this.#mac(seq, fp, changes, atMs) }
    try {
      if (this.#journalFd === undefined) throw new Error('Journal not initialized')
      const row = Buffer.from(JSON.stringify(item) + '\n')
      const written = writeSync(this.#journalFd, row)
      if (written !== row.length) throw new Error('Short journal write')
      fsyncSync(this.#journalFd)
      this.#apply(fp, changes, atMs)
      this.#sequence = seq
      this.#sinceCheckpoint++
      if (this.#sinceCheckpoint >= CHECKPOINT_EVERY) this.#checkpoint(this.#data)
      return true
    } catch (error) {
      this.#faulted = true
      throw error
    }
  }

  recordWork(event: WorkEvent): boolean {
    if (!event.id || !event.agentId || !event.sessionId || !eventTypes.has(event.type) ||
      !Number.isSafeInteger(event.recordedAtMs) || event.recordedAtMs < 0) return false
    const fp = this.#fingerprint('work', [event.agentId, event.sessionId, event.id])
    const turn = this.#fingerprint('session', [event.agentId, event.sessionId])
    const start = this.#pendingTurnStarts.get(turn)
    const changes: Partial<Totals> = {}
    if (event.type === 'turn-start') changes.turnStarts = 1
    if (event.type === 'turn-end') {
      changes.turnEnds = 1
      if (start !== undefined && event.recordedAtMs >= start) {
        changes.completedTurnMs = Math.floor(event.recordedAtMs - start)
      }
    }
    if (event.type === 'tool-start') changes.toolCalls = 1
    if (event.type === 'tool-end') changes.toolResults = 1
    const committed = this.#commit(fp, changes, event.recordedAtMs)
    if (committed) {
      if (event.type === 'turn-start') this.#pendingTurnStarts.set(turn, event.recordedAtMs)
      if (event.type === 'turn-end') this.#pendingTurnStarts.delete(turn)
    }
    return committed
  }
  get classificationEnabled(): boolean { return this.#classificationEnabled }

  recordDetection(prompt: HumanPrompt, result: DetectionResult): boolean {
    if (!this.#classificationEnabled) return false
    if (!prompt.id || !prompt.agentId || !prompt.sessionId ||
      !Number.isSafeInteger(prompt.receivedAtMs) || prompt.receivedAtMs < 0 ||
      prompt.provenance.actor !== 'human' || !verdicts.has(result.verdict)) return false
    const fp = this.#fingerprint('detection', [prompt.agentId, prompt.sessionId, prompt.id])
    return this.#commit(fp, {
      checked: 1,
      safe: Number(result.verdict === 'safe'),
      review: Number(result.verdict === 'suspected-abuse'),
      targeted: Number(result.verdict === 'targeted-abuse'),
    }, prompt.receivedAtMs)
  }
  snapshot(): DurableTotals { return { ...this.#data.totals } }
  snapshotDays(limit = 7): ReadonlyArray<{ day: string; totals: DurableTotals }> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 31) {
      throw new Error('Daily summary limit must be 1..31')
    }
    return Object.keys(this.#data.daily).sort().slice(-limit)
      .map(day => ({ day, totals: { ...this.#data.daily[day]! } }))
  }

  reset(): void {
    if (this.#closed || this.#faulted) throw new Error('Ledger not writable')
    const next: DiskLedger = { version: 1, secret: randomBytes(32).toString('hex'),
      totals: { ...ZERO }, daily: {}, seen: [], sequence: this.#sequence }
    try {
      this.#checkpoint(next)
      this.#data = next
      this.#seenSet.clear()
      this.#pendingTurnStarts.clear()
    } catch (error) {
      this.#faulted = true
      throw error
    }
  }
  close(): void {
    if (this.#closed) return
    this.#closed = true
    try {
      if (this.#journalFd !== undefined) closeSync(this.#journalFd)
    } catch { /* Host work must never fail on close */ }
    // The journal is fsynced before every acknowledged update. Flushing a
    // final snapshot is optional and never necessary for data survival.
    if (!this.#ownedLock) return
    try {
      const lock = join(this.#dir, LOCK)
      const entry = JSON.parse(readFileSync(lock, 'utf8')) as LockData
      if (entry.token === this.#lockToken) unlinkSync(lock)
    } catch { /* Host work must never fail on close */ }
    this.#ownedLock = false
  }
}
