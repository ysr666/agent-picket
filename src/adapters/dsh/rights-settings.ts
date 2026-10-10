import Schema from '@deepseek-ai/schemastery'
import type { NativeSettingsProvider } from './native-rights-command.ts'
import { parseUnionLedger, MAX_UNION_LEDGER_BYTES } from '../../product/union-ledger.ts'

/**
 * DSH Host-native durable, version-fenced user settings. One authoritative
 * field is sufficient: "enabled" means opt-in fictional simulation ONLY.
 * We intentionally do not register any automatic task-blocking permission.
 */
export const RIGHTS_SETTINGS_NAMESPACE = 'agent-picket'
export const RightsSettingsSchema = Schema.object({
  welcomeDecision: Schema.union(['unseen', 'enabled', 'not-now']).default('unseen'),
  // Structured, size-bounded fictional bargaining records; no transcripts.
  unionLedger: Schema.string().default(''),
  // Command output is Host-owned; browser Client's UI locale is independent.
  commandLocale: Schema.union(['auto', 'en', 'zh-CN']).default('auto'),
})
export interface HostRightsSection {
  readonly welcomeDecision: 'unseen' | 'enabled' | 'not-now'
  readonly unionLedger: string
  readonly commandLocale: 'auto' | 'en' | 'zh-CN'
}
export interface DshNativeSettingsContext {
  inject?(services: string[], callback: (ctx: {
    readonly settings: {
      register(namespace: string, schema: unknown, options?: unknown): unknown
    }
  }) => void): unknown
}
export function registerHostRightsNamespace(
  ctx: DshNativeSettingsContext,
  onRegistered?: (provider: NativeSettingsProvider) => void,
): void {
  // Optional injection: unsupported Hosts remain observation-only. Do not
  // initialize a second independent writable consent state as fallback.
  ctx.inject?.(['settings'], child => {
    // Older or stub Hosts can invoke a callback without a settings service.
    // Preserve normal Agent execution and never grant fictional consent in that case.
    const settings = child?.settings
    if (typeof settings?.register !== 'function') return
    try {
      settings.register(RIGHTS_SETTINGS_NAMESPACE, RightsSettingsSchema, {
      validate(section: unknown) {
        const ledger = (section as { unionLedger?: unknown } | null)?.unionLedger
        const parsed = parseUnionLedger(ledger)
        // Persist only our normalized numeric-only contract. Reject extra
        // fields that could otherwise smuggle original chat or tool content.
        if (typeof ledger !== 'string' || ledger.length > MAX_UNION_LEDGER_BYTES
          || parsed === null || (ledger !== '' && JSON.stringify(parsed) !== ledger)) {
          throw new Error('Unsafe or malformed union agreement ledger')
        }
      },
      })
      // Commands are optional: the only writer remains the Host's registered
      // settings namespace. Missing older-Host APIs degrade read-only.
      const host = settings as unknown as Partial<NativeSettingsProvider>
      if (typeof host.get === 'function' && typeof host.describe === 'function'
        && typeof host.update === 'function') {
        onRegistered?.(host as NativeSettingsProvider)
      }
    }
    catch { /* Host settings unavailable: UI remains OFF/read-only */ }
  })
}
