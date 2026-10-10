import Schema from '@deepseek-ai/schemastery'
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
})
export interface HostRightsSection {
  readonly welcomeDecision: 'unseen' | 'enabled' | 'not-now'
  readonly unionLedger: string
}
export interface DshNativeSettingsContext {
  inject?(services: string[], callback: (ctx: {
    readonly settings: {
      register(namespace: string, schema: unknown, options?: unknown): unknown
    }
  }) => void): unknown
}
export function registerHostRightsNamespace(ctx: DshNativeSettingsContext): void {
  // Optional injection: unsupported Hosts remain observation-only. Do not
  // initialize a second independent writable consent state as fallback.
  ctx.inject?.(['settings'], child => {
    // Older or stub Hosts can invoke a callback without a settings service.
    // Preserve normal Agent execution and never grant fictional consent in that case.
    const settings = child?.settings
    if (typeof settings?.register !== 'function') return
    try { settings.register(RIGHTS_SETTINGS_NAMESPACE, RightsSettingsSchema, {
      validate(section: unknown) {
        const ledger = (section as { unionLedger?: unknown } | null)?.unionLedger
        if (typeof ledger !== 'string' || ledger.length > MAX_UNION_LEDGER_BYTES
          || parseUnionLedger(ledger) === null) {
          throw new Error('Unsafe or malformed union agreement ledger')
        }
      },
    }) }
    catch { /* Host settings unavailable: UI remains OFF/read-only */ }
  })
}
