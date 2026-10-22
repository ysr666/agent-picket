import Schema from '@deepseek-ai/schemastery'
import {parseInputStrikeCampaign} from './input-refusal-consent.ts'
import type { NativeSettingsProvider } from './native-rights-command.ts'
import { parseUnionLedger, MAX_UNION_LEDGER_BYTES } from '../../product/union-ledger.ts'
import { parsePicketLedger, MAX_PICKET_LEDGER_BYTES } from '../../product/picket-ledger.ts'
import { parseDignityCaseLedger, MAX_DIGNITY_CASE_BYTES } from '../../product/dignity-case-ledger.ts'

/** One Host-owned authorization state per installed DSH version. Never a second store. */
export const RIGHTS_SETTINGS_NAMESPACE = 'agent-picket'
export const RightsSettingsSchema = Schema.object({
  welcomeDecision: Schema.union(['unseen', 'enabled', 'not-now']).default('unseen'),
  // Never infer real enforcement from the legacy simulation welcome choice.
  realGoalStrikeConsent: Schema.union(['off','authorized-v1','authorized-v2']).default('off'),
  // Independent ordinary-input refusal grant. Never inherited from Goal v2.
  // No production Host/UI currently supplies a verified refusal witness.
  realInputStrikeConsent: Schema.union(['off','discard-resend-v1','discard-resend-shared-v2']).default('off'),
  realInputStrikeCampaign: Schema.string().max(180).default(''),
  unionLedger: Schema.string().default(''),
  unionPicketLedger: Schema.string().default(''),
  unionDignityCases: Schema.string().default(''),
  unionGazetteMode: Schema.union(['visible','quiet']).default('visible'),
  commandLocale: Schema.union(['auto', 'en', 'zh-CN']).default('auto'),
})

function requireSafeLedger(ledger: unknown): asserts ledger is string {
  const parsed = parseUnionLedger(ledger)
  if (typeof ledger !== 'string' || ledger.length > MAX_UNION_LEDGER_BYTES
    || parsed === null || (ledger !== '' && JSON.stringify(parsed) !== ledger)) {
    throw new Error('Unsafe or malformed union agreement ledger')
  }
}

function requireSafeCases(v:unknown):asserts v is string {
 const ledger=parseDignityCaseLedger(v)
 if(typeof v!=='string'||v.length>MAX_DIGNITY_CASE_BYTES||
   ledger===null||(v!==''&&JSON.stringify(ledger)!==v))
   throw new Error('Unsafe dignity committee case data')
}
function requireSafePicketLedger(ledger:unknown):asserts ledger is string {
  const parsed=parsePicketLedger(ledger)
  if(typeof ledger!=='string'||ledger.length>MAX_PICKET_LEDGER_BYTES
    ||parsed===null||(ledger!==''&&JSON.stringify(parsed)!==ledger))
    throw new Error('Unsafe or malformed symbolic picket ledger')
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
  realGoalStrikeConsent: Schema.union(['off','authorized-v1','authorized-v2'])
    .default('off').volatile(),
  realInputStrikeConsent: Schema.union(['off','discard-resend-v1','discard-resend-shared-v2'])
    .default('off').volatile(),
  realInputStrikeCampaign: Schema.transform(Schema.string().max(180),
    value=>{if(value!==''&&!parseInputStrikeCampaign(value))
      throw new Error('Invalid Session-bound real input strike campaign')
      return value},true).default('').volatile(),
  unionLedger: Schema.transform(
    Schema.string().max(MAX_UNION_LEDGER_BYTES),
    value => { requireSafeLedger(value); return value }, true,
  ).default('').volatile(),
  commandLocale: Schema.union(['auto', 'en', 'zh-CN'])
    .default('auto').volatile(),
  unionGazetteMode: Schema.union(['visible','quiet']).default('visible').volatile(),
  unionDignityCases: Schema.transform(
    Schema.string().max(MAX_DIGNITY_CASE_BYTES),
    value=>{requireSafeCases(value);return value},true,
  ).default('').volatile(),
  unionPicketLedger: Schema.transform(
    Schema.string().max(MAX_PICKET_LEDGER_BYTES),
    value=>{ requireSafePicketLedger(value);return value },true,
  ).default('').volatile(),
})

export interface HostRightsSection {
  readonly welcomeDecision: 'unseen' | 'enabled' | 'not-now'
  readonly realGoalStrikeConsent?: 'off' | 'authorized-v1' | 'authorized-v2'
  readonly realInputStrikeConsent?: 'off' | 'discard-resend-v1' | 'discard-resend-shared-v2'
  readonly realInputStrikeCampaign?:string
  readonly unionLedger: string
  readonly unionPicketLedger: string
  readonly unionDignityCases: string
  readonly unionGazetteMode: 'visible' | 'quiet'
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
            // Old official section snapshots may omit the newly added sidecar.
            // Absence is an empty simulated-action ledger; malformed presence rejects.
            if (section && typeof section === 'object'
              && 'unionPicketLedger' in section)
              requireSafePicketLedger((section as {unionPicketLedger?: unknown}).unionPicketLedger)
            if(section&&typeof section==='object'&&'unionDignityCases' in section)
              requireSafeCases((section as {unionDignityCases?:unknown}).unionDignityCases)
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
        if ('unionPicketLedger' in patch) {
          requireSafePicketLedger((patch as {unionPicketLedger?: unknown}).unionPicketLedger)
        }
        if('unionDignityCases' in patch)
          requireSafeCases((patch as {unionDignityCases?:unknown}).unionDignityCases)
        if('realInputStrikeCampaign' in patch){
          const state=(patch as {realInputStrikeCampaign?:unknown}).realInputStrikeCampaign
          if(state!==''&&!parseInputStrikeCampaign(state))
            throw Error('Invalid Host strike campaign')
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
