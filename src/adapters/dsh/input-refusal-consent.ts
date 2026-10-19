import type { NativeSettingsProvider } from './native-rights-command.ts'
import type { DshSettingsScope } from './client-rights-scope.ts'

/** This grants permission ONLY; it is not an active strike or a notice receipt.
 * An older first-run, Goal grant, or symbolic union membership never qualifies.
 * Production cannot refuse human messages merely because this grant exists.
 */
export interface HostInputRefusalGrant {
  readonly kind: 'agent-picket-input-discard-consent-v1'
  readonly hostAuthenticated: true
  readonly hostRevision: number
}

/** Re-read the one official Host namespace to detect cross-tab revocation.
 * No prompt content or attachment is needed, copied or inspected here.
 */
export function readHostInputRefusalGrant(
  settings: NativeSettingsProvider | undefined,
): HostInputRefusalGrant | null {
  try {
    if (!settings) return null
    const rows = () => settings.describe({ redactSecrets: true })
      .filter(row => row.ns === 'agent-picket')
    const first = rows()
    if (first.length !== 1 || !Number.isSafeInteger(first[0]!.revision)
      || first[0]!.revision < 0) return null
    const view = first[0]!
    const section = view.value === undefined ? settings.get('agent-picket') : view.value
    const active = (value: unknown) => value !== null && typeof value === 'object'
      && !Array.isArray(value)
      && (value as Record<string, unknown>).welcomeDecision === 'enabled'
      && (value as Record<string, unknown>).realInputStrikeConsent === 'discard-resend-v1'
    if (!active(section)) return null
    const second = rows()
    if (second.length !== 1 || second[0]!.revision !== view.revision
      || (second[0]!.value !== undefined && !active(second[0]!.value))) return null
    return { kind: 'agent-picket-input-discard-consent-v1',
      hostAuthenticated: true, hostRevision: view.revision }
  } catch { return null }
}

export const INPUT_DISCARD_DISCLOSURE = 'input-discard-manual-resend-v1' as const
export interface InputRefusalSection {
  readonly welcomeDecision: 'unseen'|'enabled'|'not-now'
  readonly realInputStrikeConsent?: 'off'|'discard-resend-v1'
}

/** Independent, versioned user opt-in for the future Host refusal pipeline.
 * Caller must have already rendered the complete discard/resend disclosure.
 * Merely storing this preference NEVER activates ordinary-input refusal.
 */
export function createDshInputRefusalConsentControl(
  scope: DshSettingsScope<InputRefusalSection>,
  verifiedNoticeCapability: () => boolean,
) {
  const snapshot = () => {
    try {
      const current = scope.getSnapshot()
      const valid = current.status === 'ready' && current.mode === 'host'
        && !!current.value
        && ['off','discard-resend-v1'].includes(
          current.value.realInputStrikeConsent ?? 'off')
      return {
        available: valid && verifiedNoticeCapability() === true,
        writable: valid && current.writable,
        authorized: valid && current.value!.welcomeDecision === 'enabled'
          && current.value!.realInputStrikeConsent === 'discard-resend-v1',
        enforcing: false as const,
      }
    } catch { return {available:false,writable:false,authorized:false,enforcing:false as const} }
  }
  return {
    snapshot,
    async choose(choice: 'off'|'discard-resend-v1',
      disclosure?: typeof INPUT_DISCARD_DISCLOSURE) {
      if (choice !== 'off' && choice !== 'discard-resend-v1')
        throw new TypeError('Unknown ordinary-input refusal preference')
      const before = scope.getSnapshot()
      if (before.status !== 'ready' || before.mode !== 'host'
        || !before.writable || before.revision === undefined
        || !before.value || !['off','discard-resend-v1'].includes(
          before.value.realInputStrikeConsent ?? 'off'))
        throw Error('Verified Host input-refusal settings unavailable')
      if (choice !== 'off' && (disclosure !== INPUT_DISCARD_DISCLOSURE
        || before.value.welcomeDecision !== 'enabled'
        || verifiedNoticeCapability() !== true))
        throw Error('Explicit discard-and-resend agreement and native notice proof required')
      // Even a synchronous notice witness can be invalidated by the UI before
      // the Host's revision-fenced write. The official settings scope owns CAS.
      const latest = scope.getSnapshot()
      if (latest.status !== 'ready' || latest.mode !== 'host'
        || !latest.writable || latest.revision !== before.revision
        || latest.value?.welcomeDecision !== before.value.welcomeDecision
        || latest.value?.realInputStrikeConsent !== before.value.realInputStrikeConsent
        || (choice !== 'off' && verifiedNoticeCapability() !== true))
        throw Error('Host input-refusal consent changed before write')
      await scope.set('realInputStrikeConsent',choice)
      const after = scope.getSnapshot()
      if (after.status !== 'ready' || after.mode !== 'host'
        || after.value?.realInputStrikeConsent !== choice
        || (choice !== 'off' && after.value?.welcomeDecision !== 'enabled'))
        throw Error('Host did not confirm input-refusal permission')
      return snapshot()
    },
  }
}
