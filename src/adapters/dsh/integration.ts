import { resolveHostAction, type UnionEngine } from '../../core/engine.ts'
import type { WorkTracker } from '../../core/work-tracker.ts'
import type { DetectionCounter } from '../../core/detection-counter.ts'
import type {
  Clock,
  HumanPrompt,
  HostCapabilities,
  UnionDecision,
  WorkEvent,
} from '../../core/types.ts'

/** Structural contracts: no dependency on Cordis, DSH, or other Host packages. */
export interface DshTextBlock { readonly type: string; readonly text?: string }
export interface DshMessage {
  readonly id?: unknown
  readonly source?: { readonly kind?: unknown }
  readonly content?: readonly DshTextBlock[]
}
export interface DshAgent {
  readonly id?: unknown
  readonly session?: { readonly id?: unknown }
}
export interface DshPreStep {
  readonly agent: DshAgent
  readonly messages: readonly DshMessage[]
}
export interface DshSession { readonly id?: unknown }
export interface DshEvent {
  readonly type?: unknown
  readonly seq?: unknown
  readonly time?: unknown
  readonly data?: unknown
}
export interface DshCommandResult {
  readonly kind: 'success' | 'error'
  readonly text: string
}
export interface DshCommandInvocation {
  readonly rawInput?: string
  readonly agent?: DshAgent
}
export interface DshCommands {
  register(definition: {
    readonly name: string
    readonly description: string
    readonly input?: { readonly hint: string }
    readonly handler: (invocation?: DshCommandInvocation) => DshCommandResult
  }): unknown
}
export interface DshIntegrationContext {
  on(name: 'agent/pre-step', callback: (
    payload: DshPreStep, next: () => Promise<unknown>
  ) => Promise<unknown>): unknown
  on(name: 'session/event', callback: (
    session: DshSession, event: DshEvent
  ) => void): unknown
  inject?(services: ['commands'], callback: (ctx: {
    readonly commands: DshCommands
  }) => void): unknown
}

export interface DshIntegrationOptions {
  readonly engine: UnionEngine
  readonly clock: Clock
  /** Observe-only until rejection messaging and provenance can be verified in live DSH. */
  readonly onDecision?: (decision: UnionDecision) => void
  readonly onWorkEvent?: (event: WorkEvent) => void
  /** Optional local work counter; independent of DSH and absent by default. */
  readonly tracker?: WorkTracker
  /** Optional local verdict counts, requires the same detector wrapper in UnionEngine. */
  readonly detections?: DetectionCounter
}

/** DSH user-message source is a claimed human origin, NOT proof of human authorship. */
export function normalizeDshPrompt(
  agent: DshAgent,
  message: DshMessage,
  now: number,
): HumanPrompt | undefined {
  if (typeof agent.id !== 'string' || !agent.id) return
  // An Agent and a Session are different identities in DSH. Never guess.
  if (typeof agent.session?.id !== 'string' || !agent.session.id) return
  if (typeof message.id !== 'string' || !message.id) return
  const actor = message.source?.kind === 'user' ? 'human' :
    message.source?.kind === 'tool' ? 'tool' :
      message.source?.kind === 'agent' ? 'agent' : 'unknown'
  const segments = Array.isArray(message.content)
    ? message.content.filter(block => block?.type === 'text' && typeof block.text === 'string')
      .map(block => ({ kind: 'text' as const, text: block.text as string }))
    : []
  return {
    agentId: agent.id,
    sessionId: agent.session.id,
    id: message.id,
    receivedAtMs: now,
    provenance: { actor, assurance: actor === 'human' ? 'claimed' : 'unknown' },
    segments,
  }
}

export function normalizeDshWorkEvent(
  session: DshSession,
  event: DshEvent,
): WorkEvent | undefined {
  if (typeof session.id !== 'string' || !session.id) return
  const types = {
    'turn/start': 'turn-start',
    'turn/end': 'turn-end',
    'tool/call': 'tool-start',
    'tool/result': 'tool-end',
  } as const
  const type = event.type
  if (typeof type !== 'string' || !(type in types)) return
  if (typeof event.seq !== 'number' || !Number.isSafeInteger(event.seq) || event.seq < 0) return
  const timestamp = typeof event.time === 'number' && Number.isFinite(event.time)
    ? event.time : 0
  return {
    id: JSON.stringify([session.id, event.seq]),
    sessionId: session.id,
    agentId: session.id,
    recordedAtMs: timestamp,
    type: types[type as keyof typeof types],
  }
}

/** This spike exposes observation and native command discovery but NEVER returns reject. */
export function registerDshIntegration(
  ctx: DshIntegrationContext,
  options: DshIntegrationOptions,
): void {
  const { engine, clock, onDecision, onWorkEvent, tracker, detections } = options
  const capabilities: HostCapabilities = {
    warn: false,
    block: false,
    commands: Boolean(ctx.inject),
    workEvents: true,
  }

  ctx.on('agent/pre-step', async (payload, next) => {
    try {
      for (const message of payload.messages) {
        const prompt = normalizeDshPrompt(payload.agent, message, clock.now())
        if (!prompt) continue
        const decision = engine.evaluate(prompt)
        // No original text leaves this adapter, even via the observer API.
        if (resolveHostAction(decision, capabilities) !== 'block') {
          try { onDecision?.(decision) } catch { /* observers never affect Host */ }
        }
      }
    } catch {
      // Always fail open. DSH owns rejection and continuation semantics.
    }
    return next()
  })

  ctx.on('session/event', (session, event) => {
    const item = normalizeDshWorkEvent(session, event)
    if (!item) return
    try { tracker?.observe(item) } catch { /* metric errors never affect Host */ }
    try { onWorkEvent?.(item) } catch { /* observers never affect Host */ }
  })

  // Commands live on an optional user-facing plane, never in the model messages.
  ctx.inject?.(['commands'], child => {
    child.commands.register({
      name: 'union',
      description: 'Show local union status and work statistics',
      input: { hint: '[status|stats|report|reset|help]' },
      handler: invocation => {
        const verb = (invocation?.rawInput ?? '').trim().toLowerCase() || 'status'
        if (verb === 'help') return {
          kind: 'success',
          text: 'Usage: /union status | stats | report | reset | help. All statistics are local and in-memory.',
        }
        if (verb === 'status') return {
          kind: 'success',
          text: 'AgentPicket: monitor-only. Automatic strikes and blocking are disabled. '
            + 'Use /union stats to view session activity.',
        }
        const sessionId = invocation?.agent?.session?.id
        if (verb === 'stats') {
          if (typeof sessionId !== 'string' || !sessionId || !tracker) return {
            kind: 'error',
            text: 'Work statistics are unavailable in this session or Host.',
          }
          const stats = tracker.snapshot(sessionId, sessionId)
          return {
            kind: 'success',
            text: 'Local session stats: '
              + `turns started ${stats.turnStarts}, turns ended ${stats.turnEnds}, `
              + `tool calls ${stats.toolCalls}, tool results ${stats.toolResults}, `
              + `elapsed time in completed turns ${stats.completedTurnMs} ms. `
              + 'In-memory only; between-turn idle excluded, in-turn waits may count. No model calls.',
          }
        }
        if (verb === 'report') {
          if (typeof sessionId !== 'string' || !sessionId || !detections) return {
            kind: 'error', text: 'Local rule detection is unavailable in this Host.',
          }
          const summary = detections.snapshot((typeof invocation?.agent?.id === 'string' ? invocation.agent.id : sessionId), sessionId)
          return {
            kind: 'success',
            text: `Local rule check: ${summary.checked} messages, `
              + `${summary.safe} no flag, ${summary.review} review, `
              + `${summary.targeted} explicit-target flags. `
              + 'Experimental rules only; a flag is NOT proof of abuse. '
              + 'No quoted content saved. Automatic blocking disabled.',
          }
        }
        if (verb === 'reset') {
          if (typeof sessionId !== 'string' || !sessionId || !tracker) return {
            kind: 'error', text: 'No local work statistics to reset in this Host.',
          }
          tracker.clear(sessionId, sessionId)
          detections?.clear((typeof invocation?.agent?.id === 'string' ? invocation.agent.id : sessionId), sessionId)
          return { kind: 'success', text: 'Local in-memory counters reset for this session.' }
        }
        return {
          kind: 'error',
          text: 'Unknown /union subcommand. Use /union help. Automatic strikes are unavailable.',
        }
      },
    })
  })
}

/** A dev-only explicit probe: it must never be used as a production classifier. */
export function createDshPreStepProbe(
  rejectIds: ReadonlySet<string>,
): (payload: DshPreStep, next: () => Promise<unknown>) => Promise<unknown> {
  return async (payload, next) => {
    if (payload.messages.some(message =>
      typeof message.id === 'string' && rejectIds.has(message.id))) {
      return { kind: 'reject' }
    }
    return next()
  }
}
