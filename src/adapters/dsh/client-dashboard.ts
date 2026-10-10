/**
 * Browser-only, source-independent DSH event-window projection.
 * This module has NO runtime imports and is included verbatim into the DSH
 * packaged client factory. Never read or expose event.data / message text.
 */

export interface BrowserSessionEvent {
  readonly type?: unknown
  readonly seq?: unknown
  readonly time?: unknown
  readonly data?: unknown
}
export interface BrowserSessionEntry {
  readonly type?: unknown
  readonly event?: BrowserSessionEvent
}
export interface BrowserSessionWindow {
  readonly entries: readonly BrowserSessionEntry[]
  readonly hasMore: boolean
  readonly revision: number
}
export interface BrowserEventSource {
  getSnapshot(): BrowserSessionWindow
  subscribe(listener: () => void): () => void
}
export interface BrowserSessionBinding {
  readonly eventSource: BrowserEventSource
}
export interface BrowserSessionMetrics {
  readonly turnStarts: number
  readonly turnEnds: number
  readonly toolCalls: number
  readonly toolResults: number
  readonly completedTurnMs: number
}
export interface BrowserDashboardWindow {
  readonly schemaVersion: 1
  readonly source: 'dsh-client-event-window'
  /** Does not imply the Host's independent durable lifetime ledger is disabled. */
  readonly lifetime: null
  readonly lifetimeVisibility: 'not-exposed-by-client'
  readonly sessionWork: BrowserSessionMetrics | null
  /** hasMore = true means older Host history may be missing; never call it a full count. */
  readonly coverage: 'complete' | 'partial' | 'not-loaded' | 'unavailable'
  readonly revision: number | null
  readonly sourceEventCount: number
  readonly durationBasis: 'completed-turn-wall-clock-including-waits'
  readonly containsOriginalMessages: false
}
const emptyWork = (): BrowserSessionMetrics => ({
  turnStarts: 0, turnEnds: 0, toolCalls: 0, toolResults: 0,
  completedTurnMs: 0,
})

/** Freshly computes counts so replacement, prepend and replay never double-count. */
export function projectBrowserEventWindow(window: BrowserSessionWindow): BrowserDashboardWindow {
  const counts: { -readonly [K in keyof BrowserSessionMetrics]: number } = emptyWork()
  const seen = new Set<number>()
  let currentTurn: number | null = null
  let count = 0
  for (const entry of window.entries) {
    if (entry.type !== 'event') continue // transient model chunks are not durable work
    const evt = entry.event
    if (!evt || typeof evt.type !== 'string' || !Number.isSafeInteger(evt.seq)
      || (evt.seq as number) < 0 || seen.has(evt.seq as number)) continue
    seen.add(evt.seq as number)
    const time = typeof evt.time === 'number' && Number.isSafeInteger(evt.time)
      && evt.time >= 0 ? evt.time : null
    switch (evt.type) {
      case 'turn/start':
        counts.turnStarts++
        currentTurn = time
        count++
        break
      case 'turn/end':
        counts.turnEnds++
        if (currentTurn !== null && time !== null && time >= currentTurn) {
          counts.completedTurnMs += time - currentTurn
        }
        currentTurn = null
        count++
        break
      case 'tool/call':
        counts.toolCalls++
        count++
        break
      case 'tool/result':
        counts.toolResults++
        count++
        break
      default: break
    }
  }
  return {
    schemaVersion: 1,
    source: 'dsh-client-event-window',
    lifetime: null,
    lifetimeVisibility: 'not-exposed-by-client',
    sessionWork: counts,
    coverage: window.hasMore ? 'partial' : 'complete',
    revision: window.revision,
    sourceEventCount: count,
    durationBasis: 'completed-turn-wall-clock-including-waits',
    containsOriginalMessages: false,
  }
}

export interface BrowserDashboardSessions {
  /** Only already-retained bindings; never opens or mutates sessions. */
  binding(sessionId: string): BrowserSessionBinding | undefined
}
export interface BrowserDashboardBridge {
  getSnapshot(sessionId: string): BrowserDashboardWindow
  subscribe(sessionId: string, listener: (snapshot: BrowserDashboardWindow) => void): () => void
}

/**
 * A read-only Cordis Browser service. It uses Host-owned contiguous event
 * windows via the documented DSH ClientSessions.binding(id).eventSource.
 * It cannot access the Host's separate lifetime ledger, so null is explicit.
 */
export function createBrowserDashboardBridge(sessions: BrowserDashboardSessions): BrowserDashboardBridge {
  const unknown = (): BrowserDashboardWindow => ({
    schemaVersion: 1,
    source: 'dsh-client-event-window',
    lifetime: null,
    lifetimeVisibility: 'not-exposed-by-client',
    sessionWork: null,
    coverage: 'not-loaded',
    revision: null,
    sourceEventCount: 0,
    durationBasis: 'completed-turn-wall-clock-including-waits',
    containsOriginalMessages: false,
  })
  function getSnapshot(sessionId: string): BrowserDashboardWindow {
    if (typeof sessionId !== 'string' || !sessionId) return unknown()
    try {
      const window = sessions.binding(sessionId)?.eventSource.getSnapshot()
      return window ? projectBrowserEventWindow(window) : unknown()
    } catch { return { ...unknown(), coverage: 'unavailable' } }
  }
  function subscribe(sessionId: string, listener: (snapshot: BrowserDashboardWindow) => void): () => void {
    if (typeof sessionId !== 'string' || !sessionId || typeof listener !== 'function') {
      return () => {}
    }
    let stop: (() => void) | undefined
    let active = true
    try {
      const source = sessions.binding(sessionId)?.eventSource
      if (source) {
        stop = source.subscribe(() => {
          if (!active) return
          try { listener(getSnapshot(sessionId)) } catch { /* listener must not affect DSH */ }
        })
      }
    } catch { /* observer setup never mutates Host */ }
    return () => {
      if (!active) return
      active = false
      try { stop?.() } catch { /* best-effort UI observer cleanup */ }
    }
  }
  return { getSnapshot, subscribe }
}
