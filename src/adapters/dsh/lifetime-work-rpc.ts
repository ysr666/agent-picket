/**
 * DSH 0.2+ optional Host-owned, authenticated, read-only work aggregates.
 * The official DSH Connection's exact Fetch-route registry owns browser
 * admission, Origin/Host trust fence and network transport.
 * Agent Picket never opens an HTTP listener or reads the browser's WAL.
 */
import type { DurableTotals } from '../node/durable-stats.ts'

export const LIFETIME_WORK_FETCH_PATH = '/api/agent-picket/lifetime/v1'

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
export interface HostConnectionFetch {
  register(route: {
    readonly path: string
    readonly methods: readonly ['GET']
    readonly requestBody: 'buffered'
    readonly fetch: (request: Request) => Promise<Response>
  }): () => Promise<void>
}
export interface LifetimeHostContext {
  inject?(deps: string[], cb: (ctx: {
    connection?: {fetch?: HostConnectionFetch}
    effect?(factory: () => () => void): unknown
  }) => void): unknown
  effect?(factory: () => () => void): unknown
}
const responseError = (code: string, status: number): Response =>
  Response.json({error:code},{status,headers:{'cache-control':'no-store'}})
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
function parseHorizon(request: Request): 7 | 30 | null {
  const url=new URL(request.url)
  if (url.searchParams.size!==1 || !url.searchParams.has('windowDays')) return null
  const value=url.searchParams.get('windowDays')
  return value==='7'?7:value==='30'?30:null
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
 * Fail-closed registration: needs the official 0.2+ Connection, correct Host
 * owner, and current Host permission. Exact GET routes are authenticated by
 * the official shared /api browser transport, unlike direct RPC handle()
 * channels which are only available on the in-process carrier.
 */
export function registerDshLifetimeWorkFetch(ctx: LifetimeHostContext, options: {
  readonly authorized: () => boolean
  readonly store: () => LifetimeWorkStore | undefined
  readonly now?: () => number
}): void {
  if (typeof ctx.inject !== 'function' || typeof ctx.effect !== 'function') return
  let stop: (() => Promise<void>) | undefined
  let disposed=false
  ctx.effect(() => () => { disposed=true; const fn=stop; stop=undefined; if(fn) void fn() })
  ctx.inject(['connection'], child => {
    if (disposed || stop || typeof child.connection?.fetch?.register !== 'function') return
    try {
      const registered=child.connection.fetch.register({
        path:LIFETIME_WORK_FETCH_PATH,methods:['GET'],requestBody:'buffered',
        async fetch(request:Request):Promise<Response> {
          if (disposed || request.signal.aborted) return responseError('unavailable',503)
          const days=parseHorizon(request)
          if (!days) return responseError('invalid_request',400)
          try {
            if (options.authorized()!==true) return responseError('not_authorized',403)
            const store=options.store()
            if (!store) return responseError('unavailable',503)
            const output=projectLifetimeWork(
              store.snapshot(),store.snapshotDays(31),days,(options.now??Date.now)())
            if (request.signal.aborted || options.authorized()!==true) {
              return responseError('not_authorized',403)
            }
            return Response.json(output,{status:200,headers:{'cache-control':'no-store'}})
          } catch { return responseError('unavailable',503) }
        },
      })
      stop=registered
      child.effect?.(() => () => {
        if (stop===registered) stop=undefined
        void registered()
      })
    } catch { /* Unsupported Host must not interrupt Agent model work. */ }
  })
}
