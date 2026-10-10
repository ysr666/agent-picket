/**
 * Native /union commands share the *same* DSH Host settings namespace as
 * the Web panel. No secondary Node-rights store, model call or Host blocking.
 * All writes are revision-fenced by DSH's official SettingsProvider.update.
 */
import { createHash, randomBytes } from 'node:crypto'
import { createLaborDesk, parseLaborState, type LaborStateV1 } from '../../product/union-desk.ts'
import {
  MAX_UNION_LEDGER_BYTES, MAX_UNION_SESSIONS, parseUnionLedger,
} from '../../product/union-ledger.ts'

export const RIGHTS_NAMESPACE = 'agent-picket'
type Choice = 'unseen' | 'enabled' | 'not-now'
export type NativeUnionAction =
  | { readonly type: 'demo' }
  | { readonly type: 'accept' | 'decline'; readonly id: number }
  | { readonly type: 'counter'; readonly id: number; readonly intervalMs: number }
  | { readonly type: 'resolve'; readonly id: number; readonly accepted: boolean }

export interface NativeRightsSection {
  readonly welcomeDecision: Choice
  readonly unionLedger: string
}
/** DSH SettingsProvider's actual public Host methods, no ad-hoc transport. */
export interface NativeSettingsProvider {
  get(namespace: string): unknown
  describe(options?: { readonly redactSecrets?: boolean }): readonly {
    readonly ns: string
    readonly revision: number
  }[]
  update(namespace: string, patch: object, expectedRevision?: number): Promise<void>
}
export interface NativeUnionCommandPort {
  status(sessionId?: string): string
  setEnabled(enabled: boolean): Promise<string>
  grievances(sessionId?: string): string
  bargain(sessionId: string | undefined, action: NativeUnionAction): Promise<string>
}

const disabled = 'AI Rights simulation is OFF / 模拟工会未开启。No tasks are blocked.'
const unavailable = 'Native DSH rights settings unavailable / DSH 原生设置暂不可用；没有启用工会。'

/** SHA-256 pseudonymizes the DSH session id; no original ID is persisted. */
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
        || !['unseen','enabled','not-now'].includes(section.welcomeDecision ?? '')
        || typeof section.unionLedger !== 'string') return null
      const ledger = parseUnionLedger(section.unionLedger)
      if (!ledger || (section.unionLedger !== '' &&
        JSON.stringify(ledger) !== section.unionLedger)) return null
      return {
        section: section as NativeRightsSection,
        revision: descriptor.revision,
        ledger,
      }
    } catch { return null }
  }
  function sessionState(id: string) {
    const view = read()
    if (!view || view.section.welcomeDecision !== 'enabled') return null
    const key = nativeSessionKey(id)
    return { ...view, key, state: parseLaborState(view.ledger.sessions[key]) }
  }
  function formatState(state: LaborStateV1, sessionId: string) {
    const waiting = state.pending
    const detail = waiting
      ? 'Pending #' + waiting.id + ' ' + waiting.kind + ' (' + waiting.stage
        + (waiting.counterOfferMs === null ? '' : ', counter ' + (waiting.counterOfferMs / 60_000) + 'min')
        + ')'
      : 'No pending fictional grievance / 暂无模拟诉求'
    return 'Fictional union, session-specific / 模拟工会（按会话）: ' + detail + '. '
      + 'Agreed break interval ' + state.agreement.breakIntervalMs / 60_000 + 'min, '
      + 'overtime interval ' + state.agreement.overtimeIntervalMs / 3_600_000 + 'h. '
      + 'History ' + state.history.length + ' agreements. '
      + 'No actual AI voting or interruption of Agent work.'
  }
  return {
    status(sessionId) {
      const view = read()
      if (!view) return unavailable
      if (view.section.welcomeDecision !== 'enabled') return disabled
      return 'AI Rights simulation ON / 模拟工会已开启。'
        + (sessionId ? ' ' + formatState(
          parseLaborState(view.ledger.sessions[nativeSessionKey(sessionId)])!, sessionId,
        ) : ' Use /union grievances inside a DSH Session.')
    },
    async setEnabled(enabled) {
      const before = read()
      if (!before) throw new Error(unavailable)
      const choice = enabled ? 'enabled' : 'not-now'
      await settings.update(RIGHTS_NAMESPACE,{welcomeDecision:choice},before.revision)
      const after = read()
      if (!after || after.section.welcomeDecision !== choice) {
        throw new Error('Host did not confirm AI Rights choice / 设置未确认')
      }
      return enabled
        ? 'AI Rights simulation enabled / 模拟工会已开启。Only fictional demands; no real blocking.'
        : 'AI Rights simulation disabled / 模拟工会已关闭。Model tasks continue normally.'
    },
    grievances(sessionId) {
      if (!sessionId) return 'Select a real DSH Session / 请先选择 DSH 会话。'
      const view = sessionState(sessionId)
      if (!view) return read()?.section.welcomeDecision === 'enabled'
        ? unavailable : disabled
      return formatState(view.state!, sessionId)
    },
    async bargain(sessionId, action) {
      if (!sessionId) throw new Error('Select a real DSH Session / 请先选择 DSH 会话。')
      const before = sessionState(sessionId)
      if (!before || !before.state) throw new Error(
        read()?.section.welcomeDecision === 'enabled' ? unavailable : disabled,
      )
      let current = before.state
      const desk = createLaborDesk({
        consent: () => read()?.section.welcomeDecision === 'enabled',
        store:{
          load: () => current,
          save(next) { current = next },
        },
      })
      switch (action.type) {
        case 'demo': desk.raiseDemoBreak(); break
        case 'accept': desk.respond(action.id,'accept'); break
        case 'decline': desk.respond(action.id,'decline'); break
        case 'counter': desk.counter(action.id, action.intervalMs); break
        case 'resolve': desk.resolveCounter(action.id, action.accepted); break
      }
      if (current === before.state) return 'No change to fictional grievance.'
      // The complete next ledger is compiled over the snapshot's revision.
      // Never silently retry after a concurrent Browser settings edit.
      const peers = Object.entries(before.ledger.sessions)
        .filter(([key]) => key !== before.key)
        .slice(-(MAX_UNION_SESSIONS - 1))
      const sessions = Object.fromEntries([...peers, [before.key,current]])
      const token = randomBytes(16).toString('hex')
      const serialized = JSON.stringify({schemaVersion:1,sessions,writeToken:token})
      if (serialized.length > MAX_UNION_LEDGER_BYTES) throw new Error('Union ledger capacity exceeded')
      await settings.update(RIGHTS_NAMESPACE,{unionLedger:serialized},before.revision)
      const after = sessionState(sessionId)
      if (!after || after.ledger.writeToken !== token ||
        JSON.stringify(after.state) !== JSON.stringify(current)) {
        throw new Error('Host did not confirm this union agreement / 协议保存未确认')
      }
      return 'Recorded a fictional agreement / 已记录模拟协议。' + formatState(after.state!, sessionId)
    },
  }
}
