import Schema from '@deepseek-ai/schemastery'
import type { NativeSettingsProvider } from './native-rights-command.ts'
import { parseUnionLedger, MAX_UNION_LEDGER_BYTES } from '../../product/union-ledger.ts'

/** One Host-owned authorization state per installed DSH version. Never a second store. */
export const RIGHTS_SETTINGS_NAMESPACE = 'agent-picket'
export const RightsSettingsSchema = Schema.object({
  welcomeDecision: Schema.union(['unseen', 'enabled', 'not-now']).default('unseen'),
  unionLedger: Schema.string().default(''),
  commandLocale: Schema.union(['auto', 'en', 'zh-CN']).default('auto'),
})

function requireSafeLedger(ledger: unknown): asserts ledger is string {
  const parsed = parseUnionLedger(ledger)
  if (typeof ledger !== 'string' || ledger.length > MAX_UNION_LEDGER_BYTES
    || parsed === null || (ledger !== '' && JSON.stringify(parsed) !== ledger)) {
    throw new Error('Unsafe or malformed union agreement ledger')
  }
}

/**
 * DSH 0.1.7+ derives the official Host settings form from a plugin's Config
 * export. Its volatile fields are the only live mutable preference surface.
 * A validated transform rejects malformed or transcript-bearing ledger text
 * even when edited through the Host's generic configuration form.
 */
export const DshProfileRightsConfig = Schema.object({
  welcomeDecision: Schema.union(['unseen', 'enabled', 'not-now'])
    .default('unseen').volatile(),
  unionLedger: Schema.transform(
    Schema.string().max(MAX_UNION_LEDGER_BYTES),
    value => { requireSafeLedger(value); return value }, true,
  ).default('').volatile(),
  commandLocale: Schema.union(['auto', 'en', 'zh-CN'])
    .default('auto').volatile(),
})

export interface HostRightsSection {
  readonly welcomeDecision: 'unseen' | 'enabled' | 'not-now'
  readonly unionLedger: string
  readonly commandLocale: 'auto' | 'en' | 'zh-CN'
}

interface HostSettingsService {
  register?(namespace: string, schema: unknown, options?: unknown): unknown
  get?(namespace: string): unknown
  describe?(options?: {readonly redactSecrets?: boolean}): readonly {
    readonly ns: string
    readonly revision: number
    readonly value?: unknown
  }[]
  update?(namespace: string, patch: object, revision?: number): Promise<void>
  configure?(presentation: {auto?: boolean}, owner?: unknown): (() => void)
}
export interface DshNativeSettingsContext {
  fiber?: unknown
  inject?(services: string[], callback: (ctx: {
    readonly settings?: HostSettingsService
    effect?(register: () => (() => void)): unknown
  }) => void): unknown
}

export function registerHostRightsNamespace(
  ctx: DshNativeSettingsContext,
  onRegistered?: (provider: NativeSettingsProvider) => void,
): void {
  // A missing Host settings service NEVER authorizes fictional consent, and
  // neither branch creates an independent Node-local preference owner.
  ctx.inject?.(['settings'], child => {
    const settings = child?.settings
    if (!settings) return
    if (typeof settings.register === 'function') {
      // DSH 0.1.2-style namespace registration: one official settings writer.
      try {
        settings.register(RIGHTS_SETTINGS_NAMESPACE, RightsSettingsSchema, {
          validate(section: unknown) {
            requireSafeLedger((section as {unionLedger?: unknown} | null)?.unionLedger)
          },
        })
        if (typeof settings.get === 'function'
          && typeof settings.describe === 'function'
          && typeof settings.update === 'function') {
          onRegistered?.(settings as NativeSettingsProvider)
        }
      } catch { /* Host unavailable: fail closed */ }
      return
    }

    // DSH 0.1.7-style SettingsForms: the entry is registered by the Host
    // loader from our exported Config, not via an unsupported .register().
    if (typeof settings.describe !== 'function'
      || typeof settings.update !== 'function') return
    const describe = settings.describe.bind(settings)
    const update = settings.update.bind(settings)
    const provider: NativeSettingsProvider = {
      get(namespace) {
        if (namespace !== RIGHTS_SETTINGS_NAMESPACE) return undefined
        return describe({redactSecrets:true}).find(row => row.ns === namespace)?.value
      },
      describe,
      update(namespace, patch, revision) {
        if (namespace !== RIGHTS_SETTINGS_NAMESPACE) {
          return Promise.reject(new Error('Unknown Host settings namespace'))
        }
        if ('unionLedger' in patch) {
          requireSafeLedger((patch as {unionLedger?: unknown}).unionLedger)
        }
        return update(namespace, patch, revision)
      },
    }
    try {
      // Keep raw ledger fields out of auto-generated settings forms. The native
      // union React Slot remains the sole user-facing simulation interface.
      if (typeof settings.configure === 'function' && typeof child.effect === 'function') {
        child.effect(() => settings.configure!({auto:false}, ctx.fiber))
      }
      onRegistered?.(provider)
    } catch { /* Host unavailable: fail closed */ }
  })
}
