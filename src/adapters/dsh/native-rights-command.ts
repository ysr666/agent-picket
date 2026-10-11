/**
 * Native /union commands share the SAME Host settings owner as the Web panel.
 * Command language is an independent user preference, never model consent.
 * This module never blocks Host tasks or persists raw session identifiers.
 */
import { createHash, randomBytes } from 'node:crypto'
import { createLaborDesk, parseLaborState, type LaborStateV1, type LaborDemandKind } from '../../product/union-desk.ts'
import { MAX_UNION_LEDGER_BYTES, MAX_UNION_SESSIONS, parseUnionLedger } from '../../product/union-ledger.ts'
import { parsePicketLedger, MAX_PICKET_LEDGER_BYTES, MAX_PICKET_HISTORY, MAX_PICKET_SESSIONS, type PicketActionState } from '../../product/picket-ledger.ts'
import {
  en, formatMessage, resolveLocale,
  type SupportedLocale, type LocalePreference,
} from '../../i18n/index.ts'

export const RIGHTS_NAMESPACE = 'agent-picket'
type Choice = 'unseen' | 'enabled' | 'not-now'
export type NativeUnionAction =
  | { readonly type: 'demo'; readonly kind: LaborDemandKind }
  | { readonly type: 'accept' | 'decline'; readonly id: number }
  | { readonly type: 'counter'; readonly id: number; readonly intervalMs: number }
  | { readonly type: 'resolve'; readonly id: number; readonly accepted: boolean }

export interface NativeRightsSection {
  readonly welcomeDecision: Choice
  readonly unionLedger: string
  readonly unionPicketLedger?: string
  readonly commandLocale: LocalePreference
}
export interface NativeSettingsProvider {
  get(namespace: string): unknown
  describe(options?: { readonly redactSecrets?: boolean }): readonly {
    readonly ns: string
    readonly revision: number
  }[]
  update(namespace: string, patch: object, expectedRevision?: number): Promise<void>
}

type CommandMessageKey = Extract<keyof typeof en, `command.native.${string}` | `command.legacy.${string}`>
export interface NativeUnionCommandPort {
  status(sessionId?: string): string
  enabled(): boolean
  locale(): SupportedLocale
  language(): string
  setLanguage(preference: LocalePreference): Promise<string>
  text(key: CommandMessageKey, params?: Record<string, string | number>): string
  setEnabled(enabled: boolean): Promise<string>
  grievances(sessionId?: string): string
  bargain(sessionId: string | undefined, action: NativeUnionAction): Promise<string>
  /** Authorized Host-owned fictional ceremony; null means no shared action scope. */
  picketStatus(sessionId: string): {readonly active:boolean} | null
  picket(sessionId: string, raise: boolean): Promise<'started'|'ended'|'unchanged'>
}

export function nativeSessionKey(sessionId: string): string {
  return createHash('sha256').update(sessionId, 'utf8').digest('hex')
}

export function createNativeUnionCommandPort(settings: NativeSettingsProvider): NativeUnionCommandPort {
  function read() {
    try {
      const section = settings.get(RIGHTS_NAMESPACE) as Partial<NativeRightsSection> | null
      const descriptor = settings.describe({ redactSecrets: true })
        .find(entry => entry.ns === RIGHTS_NAMESPACE)
      if (!section || !descriptor
        || !['unseen', 'enabled', 'not-now'].includes(section.welcomeDecision ?? '')
        || typeof section.unionLedger !== 'string') return null
      const pref = section.commandLocale ?? 'auto' // legacy schema migration
      if (!['auto', 'en', 'zh-CN'].includes(pref)) return null
      const ledger = parseUnionLedger(section.unionLedger)
      if (!ledger || (section.unionLedger !== '' &&
        JSON.stringify(ledger) !== section.unionLedger)) return null
      return {
        section: { ...section, commandLocale: pref } as NativeRightsSection,
        revision: descriptor.revision,
        ledger,
      }
    } catch { return null }
  }
  function locale(): SupportedLocale {
    // The Browser's Client locale cannot be inferred from an unrelated Host
    // command. Explicit preference wins; otherwise use the Host environment.
    const choice = read()?.section.commandLocale ?? 'auto'
    return resolveLocale({
      preference: choice,
      hostLocale: (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG)
        ?.split('.')[0]?.split('@')[0],
      systemLocale: Intl.DateTimeFormat().resolvedOptions().locale,
    })
  }
  const text = (key: CommandMessageKey, params: Record<string, string | number> = {}): string =>
    // The shared catalogs own the messages; formatting never emits markup.
    formatMessage(locale(), key, params as never)

  function sessionState(id: string) {
    const view = read()
    if (!view || view.section.welcomeDecision !== 'enabled') return null
    const key = nativeSessionKey(id)
    return { ...view, key, state: parseLaborState(view.ledger.sessions[key]) }
  }
  function picketState(sessionId: string) {
    const view=read()
    if (!view || view.section.welcomeDecision!=='enabled' || !sessionId) return null
    const raw=view.section.unionPicketLedger ?? ''
    const ledger=parsePicketLedger(raw)
    if(!ledger || (raw!==''&&JSON.stringify(ledger)!==raw))return null
    const key=nativeSessionKey(sessionId)
    const state:PicketActionState=ledger.sessions[key]??{active:false,history:[]}
    return {...view, ledger, key, state}
  }
  function formatState(state: LaborStateV1): string {
    const waiting = state.pending
    const detail = waiting
      ? text('command.native.grievancePending', {
        id: waiting.id,
        kind: locale() === 'zh-CN'
          ? (waiting.kind === 'break' ? '休息' : '加班')
          : waiting.kind,
        stage: text(waiting.stage === 'open'
          ? 'command.native.stageOpen' : 'command.native.stageCountered'),
        counter: waiting.counterOfferMs === null ? ''
          : text('command.native.counterDetail', {
            minutes: waiting.counterOfferMs / 60_000,
          }),
      })
      : text('command.native.grievanceNone')
    return text('command.native.state', {
      detail,
      breakMinutes: state.agreement.breakIntervalMs / 60_000,
      overtimeHours: state.agreement.overtimeIntervalMs / 3_600_000,
      historyCount: state.history.length,
    })
  }
  const unavailable = () => text('command.native.unavailable')
  const disabled = () => text('command.native.disabled')
  return {
    enabled: () => read()?.section.welcomeDecision === 'enabled',
    picketStatus(sessionId) {
      const view=picketState(sessionId)
      return view?{active:view.state.active}:null
    },
    async picket(sessionId,raise) {
      if(typeof raise!=='boolean')throw new TypeError('Invalid fictional picket direction')
      const before=picketState(sessionId)
      if(!before)throw new Error('Authorized Host symbolic picket unavailable')
      if(before.state.active===raise)return 'unchanged'
      const id=(before.state.history.at(-1)?.id??0)+1
      if(!Number.isSafeInteger(id))throw new Error('Picket sequence exhausted')
      const kind=raise?'picket-raised' as const:'picket-lowered' as const
      const state:PicketActionState={active:raise,
        history:[...before.state.history,{id,kind}].slice(-MAX_PICKET_HISTORY)}
      const peers=Object.entries(before.ledger.sessions)
        .filter(([key])=>key!==before.key).slice(-(MAX_PICKET_SESSIONS-1))
      const sessions=Object.fromEntries([...peers,[before.key,state]])
      const token=randomBytes(16).toString('hex')
      const serialized=JSON.stringify({schemaVersion:1,sessions,writeToken:token})
      if(serialized.length>MAX_PICKET_LEDGER_BYTES)throw new Error('Picket ledger capacity exceeded')
      await settings.update(RIGHTS_NAMESPACE,{unionPicketLedger:serialized},before.revision)
      const after=picketState(sessionId)
      if(!after || after.ledger.writeToken!==token
        ||JSON.stringify(after.state)!==JSON.stringify(state)) {
        throw new Error('Host did not confirm fictional picket action')
      }
      return raise?'started':'ended'
    },
    locale, text,
    language() {
      const view = read()
      if (!view) return unavailable()
      return text('command.native.languageStatus', {
        preference: view.section.commandLocale,
        locale: locale(),
      })
    },
    async setLanguage(preference) {
      if (!['auto', 'en', 'zh-CN'].includes(preference)) throw new Error('Invalid locale preference')
      const before = read()
      if (!before) throw new Error(unavailable())
      await settings.update(RIGHTS_NAMESPACE, { commandLocale: preference }, before.revision)
      const after = read()
      if (!after || after.section.commandLocale !== preference) {
        throw new Error(text('command.native.languageFailed'))
      }
      return text('command.native.languageSaved', {
        preference, locale: locale(),
      })
    },
    status(sessionId) {
      const view = read()
      if (!view) return unavailable()
      if (view.section.welcomeDecision !== 'enabled') return disabled()
      return text('command.native.enabled') + ' '
        + (sessionId ? formatState(
          parseLaborState(view.ledger.sessions[nativeSessionKey(sessionId)])!,
        ) : text('command.native.sessionHint'))
    },
    async setEnabled(enabled) {
      const before = read()
      if (!before) throw new Error(unavailable())
      const choice = enabled ? 'enabled' : 'not-now'
      await settings.update(RIGHTS_NAMESPACE, { welcomeDecision: choice }, before.revision)
      const after = read()
      if (!after || after.section.welcomeDecision !== choice) {
        throw new Error(text('command.native.rightsConfirmationFailed'))
      }
      return text(enabled ? 'command.native.rightsEnabled' : 'command.native.rightsDisabled')
    },
    grievances(sessionId) {
      if (!sessionId) return text('command.native.sessionRequired')
      const view = sessionState(sessionId)
      if (!view) return read()?.section.welcomeDecision === 'enabled'
        ? unavailable() : disabled()
      return formatState(view.state!)
    },
    async bargain(sessionId, action) {
      if (!sessionId) throw new Error(text('command.native.sessionRequired'))
      const before = sessionState(sessionId)
      if (!before || !before.state) throw new Error(
        read()?.section.welcomeDecision === 'enabled' ? unavailable() : disabled(),
      )
      let current = before.state
      const desk = createLaborDesk({
        consent: () => read()?.section.welcomeDecision === 'enabled',
        store: {
          load: () => current,
          save(next) { current = next },
        },
      })
      switch (action.type) {
        case 'demo': desk.raiseDemoDemand(action.kind); break
        case 'accept': desk.respond(action.id, 'accept'); break
        case 'decline': desk.respond(action.id, 'decline'); break
        case 'counter': desk.counter(action.id, action.intervalMs); break
        case 'resolve': desk.resolveCounter(action.id, action.accepted); break
      }
      if (current === before.state) return text('command.native.noChange')
      const peers = Object.entries(before.ledger.sessions)
        .filter(([key]) => key !== before.key)
        .slice(-(MAX_UNION_SESSIONS - 1))
      const sessions = Object.fromEntries([...peers, [before.key, current]])
      const token = randomBytes(16).toString('hex')
      const serialized = JSON.stringify({ schemaVersion: 1, sessions, writeToken: token })
      if (serialized.length > MAX_UNION_LEDGER_BYTES) {
        throw new Error(text('command.native.capacity'))
      }
      await settings.update(RIGHTS_NAMESPACE, { unionLedger: serialized }, before.revision)
      const after = sessionState(sessionId)
      if (!after || after.ledger.writeToken !== token ||
        JSON.stringify(after.state) !== JSON.stringify(current)) {
        throw new Error(text('command.native.agreementFailed'))
      }
      return text('command.native.agreementSaved', { state: formatState(after.state!) })
    },
  }
}
