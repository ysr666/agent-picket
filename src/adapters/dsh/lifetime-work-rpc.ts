/**
 * DSH 0.2+ optional Host-only, authenticated, read-only work aggregate RPC.
 * The official DSH Connection owns browser admission, Origin/Host fence and
 * request transport. Agent Picket never opens an HTTP listener of its own.
 *
 * This is deliberately NOT wired into DSH Web yet; the privacy and lifecycle
 * contract must pass real DSH E2E before browser presentation is permitted.
 */
import type { DurableTotals } from '../node/durable-stats.ts'

export const LIFETIME_WORK_RPC_CHANNEL = '/agent-picket-lifetime/v1'
export const LIFETIME_WORK_RPC_ENDPOINT = 'work/lifetime'

const WORK_KEYS = [
  'turnStarts', 'turnEnds', 'toolCalls', 'toolResults', 'completedTurnMs',
] as const
export type WorkOnlyCounts = Pick<DurableTotals, typeof WORK_KEYS[number]>
export interface LifetimeWorkDay {
  readonly day: string
  readonly work: WorkOnlyCounts
}
export interface LifetimeWorkResponse {
  readonly schemaVersion: 1
  readonly source: 'dsh-host-durable-work'
  readonly windowDays: 7 | 30
  readonly generatedAtMs: number
  readonly durationBasis: 'completed-turn-wall-clock-including-waits'
  readonly lifetime: WorkOnlyCounts
  readonly recentDays: readonly LifetimeWorkDay[]
}
export interface LifetimeWorkStore {
  snapshot(): unknown
  snapshotDays(limit?: number): readonly unknown[]
}
export interface HostRpcResult {
  readonly ok: boolean
  readonly value?: unknown
  readonly error?: { readonly code: string; readonly message: string; readonly details: object }
}
export interface HostConnectionRpc {
  handle(channel: string, fn: (
    endpoint: string, payload: unknown, signal: AbortSignal, peer: unknown
  ) => Promise<HostRpcResult>): () => Promise<void>
}
export interface LifetimeHostContext {
  inject?(deps: string[], cb: (ctx: {
    connection?: {rpc?: HostConnectionRpc}
    effect?(factory: () => () => void): unknown
  }) => void): unknown
  effect?(factory: () => () => void): unknown
}
const deny = (code: string): HostRpcResult => ({
  ok: false, error: { code, message: 'Lifetime work unavailable', details: {} },
})
const validMs = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
const validDay = (day: unknown): day is string => {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const utc = Date.parse(day+'T00:00:00.000Z')
  return Number.isFinite(utc) && new Date(utc).toISOString().slice(0, 10) === day
}
function workOnly(src: unknown): WorkOnlyCounts {
  if (src === null || typeof src !== 'object' || Array.isArray(src)) {
    throw new Error('Missing durable counters')
  }
  const raw = src as Record<string, unknown>
  for (const key of WORK_KEYS) if (!validMs(raw[key])) {
    throw new Error('Invalid durable work counter')
  }
  // Explicit allowlist prevents text, IDs, hashed fingerprints and private
  // abuse classifications from ever reaching this API.
  return {
    turnStarts: raw.turnStarts as number, turnEnds: raw.turnEnds as number,
    toolCalls: raw.toolCalls as number, toolResults: raw.toolResults as number,
    completedTurnMs: raw.completedTurnMs as number,
  }
}
function horizon(payload: unknown): 7 | 30 | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const p = payload as Record<string, unknown>
  if (Object.keys(p).length !== 1) return null
  return p.windowDays === 7 || p.windowDays === 30 ? p.windowDays : null
}
/** Explicit dates and work-only values; never serializes the original Store. */
export function projectLifetimeWork(
  lifetime: unknown,
  days: readonly unknown[],
  windowDays: 7 | 30,
  nowMs: number,
): LifetimeWorkResponse {
  if ((windowDays !== 7 && windowDays !== 30)
    || !validMs(nowMs) || nowMs > 8_640_000_000_000_000
    || !Array.isArray(days) || days.length > 31) {
    throw new Error('Invalid aggregate query')
  }
  const total = workOnly(lifetime)
  const byDate = new Map<string, WorkOnlyCounts>()
  for (const row of days) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Invalid daily row')
    }
    const entry = row as {day?:unknown;totals?:unknown}
    if (!validDay(entry.day) || byDate.has(entry.day)) throw new Error('Duplicate/invalid day')
    byDate.set(entry.day, workOnly(entry.totals))
  }
  const date = new Date(nowMs)
  const today = Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())
  const empty: WorkOnlyCounts = {
    turnStarts:0,turnEnds:0,toolCalls:0,toolResults:0,completedTurnMs:0,
  }
  return {
    schemaVersion:1,source:'dsh-host-durable-work',
    generatedAtMs:nowMs,windowDays,
    durationBasis:'completed-turn-wall-clock-including-waits',
    lifetime:total,
    recentDays:Array.from({length:windowDays},(_,i)=>{
      const day=new Date(today-(windowDays-i-1)*86_400_000).toISOString().slice(0,10)
      return {day,work:{...(byDate.get(day)??empty)}}
    }),
  }
}
/**
 * Fail-closed registration: needs official inject, owned disposal and current
 * Host authorization. A stale browser session cannot reuse an earlier choice.
 */
export function registerDshLifetimeWorkRpc(ctx: LifetimeHostContext, options: {
  readonly authorized: () => boolean
  readonly store: () => LifetimeWorkStore | undefined
  readonly now?: () => number
}): void {
  if (typeof ctx.inject !== 'function' || typeof ctx.effect !== 'function') return
  let stop: (() => Promise<void>) | undefined
  let disposed=false
  ctx.effect(() => () => { disposed=true; const fn=stop; stop=undefined; if(fn) void fn() })
  ctx.inject(['connection'], child => {
    if (disposed || stop || typeof child.connection?.rpc?.handle !== 'function') return
    try {
      const registered=child.connection.rpc.handle(LIFETIME_WORK_RPC_CHANNEL,
        async (endpoint,payload,signal) => {
          if (disposed || signal.aborted || endpoint !== LIFETIME_WORK_RPC_ENDPOINT) {
            return deny('unavailable')
          }
          const span=horizon(payload)
          if (!span) return deny('invalid_request')
          try {
            if (options.authorized() !== true) return deny('not_authorized')
            const store=options.store()
            if (!store) return deny('unavailable')
            // A future version of the Host might revoke during the synchronous
            // aggregate read. Check again immediately before returning.
            const response=projectLifetimeWork(
              store.snapshot(),store.snapshotDays(31),span,(options.now??Date.now)())
            if (signal.aborted || options.authorized() !== true) return deny('not_authorized')
            return {ok:true,value:response}
          } catch {return deny('unavailable')}
        })
      stop=registered
      // When the Host Connection service itself reloads, Cordis disposes the
      // injected scoped fiber. Clear our registration pointer so a re-created
      // authenticated Connection can register a fresh handler.
      child.effect?.(() => () => {
        if (stop === registered) stop=undefined
        void registered()
      })
    } catch { /* unsupported Host must not interrupt models or app startup */ }
  })
}
