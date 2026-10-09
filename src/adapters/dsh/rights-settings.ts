import Schema from '@deepseek-ai/schemastery'

/**
 * DSH Host-native durable, version-fenced user settings. One authoritative
 * field is sufficient: "enabled" means opt-in fictional simulation ONLY.
 * We intentionally do not register any automatic task-blocking permission.
 */
export const RIGHTS_SETTINGS_NAMESPACE = 'agent-picket'
export const RightsSettingsSchema = Schema.object({
  welcomeDecision: Schema.union(['unseen', 'enabled', 'not-now']).default('unseen'),
})
export interface HostRightsSection {
  readonly welcomeDecision: 'unseen' | 'enabled' | 'not-now'
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
    child.settings.register(RIGHTS_SETTINGS_NAMESPACE, RightsSettingsSchema)
  })
}
