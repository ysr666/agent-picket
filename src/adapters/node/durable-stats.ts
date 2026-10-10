import { createHmac, randomBytes } from 'node:crypto'
import {
  closeSync, existsSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type { DetectionResult, HumanPrompt, WorkEvent } from '../../core/types.ts'

/**
 * Opt-in, single-process local accounting. No raw prompts, Session IDs or event
 * IDs are persisted: HMACs are *pseudonymous*, not anonymous, and the secret is
 * stored locally. This is explicitly NOT a telemetry service.
 */
export interface DurableTotals {
  readonly turnStarts: number
  readonly turnEnds: number
  readonly toolCalls: number
  readonly toolResults: number
  /** Includes only pairs observed during this process lifetime. */
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
  readonly totals: DurableTotals
  /** UTC daily rollups, no Session IDs, no user text. */
  readonly daily: Readonly<Record<string, DurableTotals>>
  readonly seen: readonly string[]
}
const ZERO: Readonly<DurableTotals> = Object.freeze({
  turnStarts: 0, turnEnds: 0, toolCalls: 0, toolResults: 0,
  completedTurnMs: 0, checked: 0, safe: 0, review: 0, targeted: 0,
})
const KEYS = Object.keys(ZERO) as (keyof DurableTotals)[]
const FILE = 'aggregate.v1.json'
const LOCK = 'aggregate.v1.lock'
const MAX_FINGERPRINTS = 16_384
const MAX_DAYS = 366
const MAX_FILE_BYTES = 2_000_000
const eventTypes = new Set(['turn-start', 'turn-end', 'tool-start', 'tool-end'])
const verdicts = new Set(['safe', 'suspected-abuse', 'targeted-abuse'])

function assertData(input: unknown): DiskLedger {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid ledger')
  const d = input as Partial<DiskLedger>
  if (d.version !== 1 || typeof d.secret !== 'string' ||
    !/^[a-f0-9]{64}$/.test(d.secret) ||
    !d.totals || typeof d.totals !== 'object' ||
    !d.daily || typeof d.daily !== 'object' || Array.isArray(d.daily) ||
    !Array.isArray(d.seen) || d.seen.length > MAX_FINGERPRINTS) {
    throw new Error('Unsupported or corrupt ledger')
  }
  for (const key of KEYS) {
    const value = d.totals[key]
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid counter')
  }
  const daily = Object.entries(d.daily)
  if (daily.length > MAX_DAYS) throw new Error('Daily rollups exceeded cap')
  for (const [day, counts] of daily) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)
      || Number.isNaN(new Date(day + 'T00:00:00Z').getTime())
      || !counts || typeof counts !== 'object') throw new Error('Invalid UTC day')
    for (const key of KEYS) {
      const number = counts[key]
      if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid daily counter')
    }
  }
  if (d.seen.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(id))) {
    throw new Error('Invalid dedup fingerprint')
  }
  if (new Set(d.seen).size !== d.seen.length) throw new Error('Duplicate fingerprints')
  return d as DiskLedger
}

export class DurableStats {
  readonly #dir: string
  readonly #lockToken = randomBytes(16).toString('hex')
  readonly #classificationEnabled: boolean
  #data: DiskLedger
  #closed = false
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
    const lock = join(directory, LOCK)
    const fd = openSync(lock, 'wx', 0o600)
    try {
      writeFileSync(fd, this.#lockToken)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    try {
      const ledger = join(directory, FILE)
      if (existsSync(ledger)) {
        const meta = lstatSync(ledger)
        if (!meta.isFile() || (meta.mode & 0o077) !== 0 || meta.size > MAX_FILE_BYTES) {
          throw new Error('Invalid or publicly accessible ledger file')
        }
        this.#data = assertData(JSON.parse(readFileSync(ledger, 'utf8')))
      } else {
        this.#data = { version: 1, secret: randomBytes(32).toString('hex'),
          totals: { ...ZERO }, daily: {}, seen: [] }
        this.#save(this.#data)
      }
    } catch (error) {
      this.close()
      throw error
    }
  }

  #fingerprint(kind: 'work' | 'detection' | 'session', values: readonly string[]): string {
    return createHmac('sha256', Buffer.from(this.#data.secret, 'hex'))
      .update(JSON.stringify([kind, ...values])).digest('base64url')
  }

  #save(data: DiskLedger): void {
    const filename = join(this.#dir, FILE)
    const temp = join(this.#dir, 'aggregate.v1-' + randomBytes(8).toString('hex') + '.tmp')
    let fd: number | undefined
    try {
      fd = openSync(temp, 'wx', 0o600)
      writeFileSync(fd, JSON.stringify(data))
      fsyncSync(fd)
      closeSync(fd)
      fd = undefined
      renameSync(temp, filename)
    } finally {
      if (fd !== undefined) closeSync(fd)
      if (existsSync(temp)) unlinkSync(temp)
    }
  }

  #commit(fingerprint: string, changes: Partial<Totals>, atMs: number): boolean {
    if (this.#closed) throw new Error('Ledger closed')
    if (this.#data.seen.includes(fingerprint)) return false
    if (!Number.isFinite(atMs) || atMs < 0 || atMs > 8_640_000_000_000_000) {
      throw new Error('Invalid event time')
    }
    const day = new Date(atMs).toISOString().slice(0, 10)
    const totals: Totals = { ...this.#data.totals }
    const dayTotals: Totals = { ...(this.#data.daily[day] ?? ZERO) }
    for (const key of KEYS) {
      const add = changes[key] ?? 0
      const next = totals[key] + add
      if (!Number.isSafeInteger(add) || add < 0 || !Number.isSafeInteger(next)) {
        throw new Error('Counter overflow')
      }
      const dailyNext = dayTotals[key] + add
      if (!Number.isSafeInteger(dailyNext)) throw new Error('Daily counter overflow')
      totals[key] = next
      dayTotals[key] = dailyNext
    }
    const daily: Record<string, DurableTotals> = { ...this.#data.daily, [day]: dayTotals }
    const keys = Object.keys(daily).sort()
    for (const oldDay of keys.slice(0, Math.max(0, keys.length - MAX_DAYS))) delete daily[oldDay]
    const next: DiskLedger = {
      ...this.#data,
      totals,
      daily,
      seen: [...this.#data.seen, fingerprint].slice(-MAX_FINGERPRINTS),
    }
    this.#save(next) // write + flush + atomic rename before advancing memory
    this.#data = next
    return true
  }

  recordWork(event: WorkEvent): boolean {
    if (!event.id || !event.agentId || !event.sessionId ||
      !eventTypes.has(event.type) || !Number.isFinite(event.recordedAtMs) ||
      event.recordedAtMs < 0) return false
    const digest = this.#fingerprint('work', [event.agentId, event.sessionId, event.id])
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
    const accepted = this.#commit(digest, changes, event.recordedAtMs)
    if (accepted) {
      if (event.type === 'turn-start') this.#pendingTurnStarts.set(turn, event.recordedAtMs)
      if (event.type === 'turn-end') this.#pendingTurnStarts.delete(turn)
    }
    return accepted
  }

  get classificationEnabled(): boolean { return this.#classificationEnabled }

  recordDetection(prompt: HumanPrompt, result: DetectionResult): boolean {
    if (!this.#classificationEnabled) return false
    if (!prompt.id || !prompt.agentId || !prompt.sessionId ||
      !Number.isFinite(prompt.receivedAtMs) || prompt.receivedAtMs < 0 ||
      prompt.provenance.actor !== 'human' || !verdicts.has(result.verdict)) return false
    const fingerprint = this.#fingerprint('detection',
      [prompt.agentId, prompt.sessionId, prompt.id])
    return this.#commit(fingerprint, {
      checked: 1,
      safe: Number(result.verdict === 'safe'),
      review: Number(result.verdict === 'suspected-abuse'),
      targeted: Number(result.verdict === 'targeted-abuse'),
    }, prompt.receivedAtMs)
  }

  snapshot(): DurableTotals {
    return { ...this.#data.totals }
  }

  snapshotDays(limit = 7): ReadonlyArray<{ day: string; totals: DurableTotals }> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 31) {
      throw new Error('Daily summary limit must be 1..31')
    }
    return Object.keys(this.#data.daily).sort().slice(-limit)
      .map(day => ({ day, totals: { ...this.#data.daily[day]! } }))
  }

  reset(): void {
    if (this.#closed) throw new Error('Ledger closed')
    const next: DiskLedger = {
      version: 1, secret: randomBytes(32).toString('hex'),
      totals: { ...ZERO }, daily: {}, seen: [],
    }
    this.#save(next)
    this.#data = next
    this.#pendingTurnStarts.clear()
  }

  /** The Cordis owner must call this on disposal, allowing later Host restart. */
  close(): void {
    if (this.#closed) return
    this.#closed = true
    const lock = join(this.#dir, LOCK)
    try {
      if (readFileSync(lock, 'utf8') === this.#lockToken) unlinkSync(lock)
    } catch { /* no stats I/O failure may break the Host lifecycle */ }
  }
}
