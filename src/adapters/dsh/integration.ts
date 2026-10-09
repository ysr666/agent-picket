import { resolveHostAction, type UnionEngine } from '../../core/engine.ts'
import { formatMessage, resolveLocale, type SupportedLocale } from '../../i18n/index.ts'
import type { WorkTracker } from '../../core/work-tracker.ts'
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
  /** The Host owns locale preference; this callback reads it without storing it. */
  readonly getLocale?: (invocation?: DshCommandInvocation) => unknown
  /** Optional authorized Host-owned nonblocking consent controller. */
  readonly rights?: {
    snapshot(): { readonly record: { readonly laborRightsEnabled: boolean } }
    setEnabled(enabled: boolean): unknown
  }
  /** Optional simulated union state engine; does not control Agent tasks. */
  readonly laborDesk?: {
    snapshot(): { readonly state: { readonly pending: { readonly id: number; readonly kind: 'break' | 'overtime' } | null } | null }
    respond(id: number, choice: 'accept' | 'decline'): unknown
  }
  /** Resolve a desk for the exact agent/session; missing identity cannot borrow another session. */
  readonly laborDeskFor?: (invocation?: DshCommandInvocation) => DshIntegrationOptions['laborDesk']
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
  const { engine, clock, onDecision, onWorkEvent, tracker } = options
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

  // Native commands do not become model messages. Locale selection is read-only.
  const localeFor = (invocation?: DshCommandInvocation): SupportedLocale => {
    let preference: unknown
    try { preference = options.getLocale?.(invocation) } catch { /* Host preference failure */ }
    return resolveLocale({ preference })
  }
  ctx.inject?.(['commands'], child => {
    child.commands.register({
      name: 'union',
      description: formatMessage(localeFor(), 'command.description'),
      input: { hint: '[status|stats|reset|help]' },
      handler: invocation => {
        const locale = localeFor(invocation)
        const [verb = 'status', arg = '', extra = ''] =
          ((invocation?.rawInput ?? '').trim().toLowerCase() || 'status').split(/\s+/)
        if (verb === 'help') return {
          kind: 'success',
          text: formatMessage(locale, 'command.help')
            + (options.rights ? formatMessage(locale, 'command.rightsHelpExtra') : ''),
        }
        if (verb === 'status') {
          let rightsText = ''
          if (options.rights) {
            try {
              rightsText = ' ' + formatMessage(locale,
                options.rights.snapshot().record.laborRightsEnabled
                  ? 'command.rightsStatusOn' : 'command.rightsStatusOff')
            } catch {
              rightsText = ' ' + formatMessage(locale, 'command.rightsUnavailable')
            }
          }
          return { kind: 'success', text: formatMessage(locale, 'command.status') + rightsText }
        }
        if (verb === 'rights') {
          if (!options.rights) return {
            kind: 'error', text: formatMessage(locale, 'command.rightsUnavailable'),
          }
          if (arg !== '' && arg !== 'status' && arg !== 'on' && arg !== 'off') return {
            kind: 'error', text: formatMessage(locale, 'command.rightsUsage'),
          }
          try {
            if (arg === 'on' || arg === 'off') {
              options.rights.setEnabled(arg === 'on')
              return {
                kind: 'success',
                text: formatMessage(locale, arg === 'on' ? 'command.rightsOn' : 'command.rightsOff'),
              }
            }
            return {
              kind: 'success',
              text: formatMessage(locale,
                options.rights.snapshot().record.laborRightsEnabled
                  ? 'command.rightsStatusOn' : 'command.rightsStatusOff'),
            }
          } catch {
            return { kind: 'error', text: formatMessage(locale, 'command.rightsSaveError') }
          }
        }
        if (verb === 'grievances' || verb === 'accept' || verb === 'decline') {
          let consentGranted = false
          try { consentGranted = options.rights?.snapshot().record.laborRightsEnabled === true }
          catch { return { kind: 'error', text: formatMessage(locale, 'command.rightsUnavailable') } }
          if (!consentGranted) return {
            kind: 'error', text: formatMessage(locale, 'command.grievancesOff'),
          }
          let desk: DshIntegrationOptions['laborDesk']
          try { desk = options.laborDeskFor?.(invocation) ?? options.laborDesk } catch { /* unavailable */ }
          if (!desk) return {
            kind: 'error', text: formatMessage(locale, 'command.grievancesUnavailable'),
          }
          if (verb === 'grievances') {
            const pending = desk.snapshot().state?.pending
            if (!pending) return {
              kind: 'success', text: formatMessage(locale, 'command.grievancesNone'),
            }
            const kind = formatMessage(locale, pending.kind === 'break'
              ? 'union.kind.break' : 'union.kind.overtime')
            return {
              kind: 'success', text: formatMessage(locale, 'command.grievancesPending', {
                kind, id: pending.id,
              }),
            }
          }
          const id = Number(arg)
          if (!arg || extra || !Number.isSafeInteger(id) || id < 1) return {
            kind: 'error', text: formatMessage(locale, 'command.grievancesError'),
          }
          try {
            desk.respond(id, verb)
            return {
              kind: 'success', text: formatMessage(locale, 'command.grievancesDone', {
                id, outcome: verb,
              }),
            }
          } catch {
            return { kind: 'error', text: formatMessage(locale, 'command.grievancesError') }
          }
        }
        const sessionId = invocation?.agent?.session?.id
        if (verb === 'stats') {
          if (typeof sessionId !== 'string' || !sessionId || !tracker) return {
            kind: 'error',
            text: formatMessage(locale, 'command.statsUnavailable'),
          }
          const stats = tracker.snapshot(sessionId, sessionId)
          return {
            kind: 'success',
            text: formatMessage(locale, 'command.stats', {
              turnStarts: stats.turnStarts,
              turnEnds: stats.turnEnds,
              toolCalls: stats.toolCalls,
              toolResults: stats.toolResults,
              completedTurnMs: stats.completedTurnMs,
            }),
          }
        }
        if (verb === 'reset') {
          if (typeof sessionId !== 'string' || !sessionId || !tracker) return {
            kind: 'error', text: formatMessage(locale, 'command.resetUnavailable'),
          }
          tracker.clear(sessionId, sessionId)
          return { kind: 'success', text: formatMessage(locale, 'command.resetDone') }
        }
        return {
          kind: 'error',
          text: formatMessage(locale, 'command.unknown'),
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
