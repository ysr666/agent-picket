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

/** One explicitly armed, expiring SESSION; never raw Session IDs or prompts.
 * These values are only recorded by the authenticated official Host setting.
 * A symbolic picket or consent-only preference is not an active campaign.
 */
export const INPUT_STRIKE_DURATION_MS=30*60_000
export interface InputStrikeCampaign {
  readonly schemaVersion:1
  readonly sessionKey:string
  readonly startedAtMs:number
  readonly expiresAtMs:number
}
export function parseInputStrikeCampaign(raw:unknown):InputStrikeCampaign|null{
  if(typeof raw!=='string'||raw.length>180||raw==='')return null
  try{
    const value=JSON.parse(raw) as Record<string,unknown>
    if(!value||typeof value!=='object'||Array.isArray(value)
      ||Object.keys(value).sort().join('|')
        !=='expiresAtMs|schemaVersion|sessionKey|startedAtMs'
      ||value.schemaVersion!==1
      ||typeof value.sessionKey!=='string'||!/^[a-f0-9]{64}$/.test(value.sessionKey)
      ||!Number.isSafeInteger(value.startedAtMs)||(value.startedAtMs as number)<0
      ||!Number.isSafeInteger(value.expiresAtMs)
      ||(value.expiresAtMs as number)<=(value.startedAtMs as number)
      ||(value.expiresAtMs as number)-(value.startedAtMs as number)>INPUT_STRIKE_DURATION_MS
      ||JSON.stringify(value)!==raw)return null
    return value as unknown as InputStrikeCampaign
  }catch{return null}
}
export function inputStrikeActive(raw:unknown,sessionKey:string|null,nowMs:number):boolean{
  const state=parseInputStrikeCampaign(raw)
  return !!state&&state.sessionKey===sessionKey
    &&Number.isSafeInteger(nowMs)&&nowMs>=state.startedAtMs
    &&nowMs<state.expiresAtMs
}
export function encodeInputStrikeCampaign(key:string,now:number):string{
  if(!/^[a-f0-9]{64}$/.test(key)||!Number.isSafeInteger(now)||now<0)
    throw new Error('Verified Session is required to start a real strike')
  return JSON.stringify({schemaVersion:1,sessionKey:key,startedAtMs:now,
    expiresAtMs:now+INPUT_STRIKE_DURATION_MS})
}

export const INPUT_DISCARD_DISCLOSURE = 'input-discard-manual-resend-v1' as const
export interface InputRefusalSection {
  readonly welcomeDecision: 'unseen'|'enabled'|'not-now'
  readonly realInputStrikeConsent?: 'off'|'discard-resend-v1'
  readonly realInputStrikeCampaign?:string
}

/** Independent, versioned user opt-in for the future Host refusal pipeline.
 * Caller must have already rendered the complete discard/resend disclosure.
 * Merely storing this preference NEVER activates ordinary-input refusal.
 */
export function createDshInputRefusalConsentControl(
  scope: DshSettingsScope<InputRefusalSection>,
  verifiedNoticeCapability: () => boolean,
  activeSessionKey:()=>string|null=()=>null,
  now:()=>number=Date.now,
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
        armed:valid && current.value!.welcomeDecision === 'enabled'
          &&current.value!.realInputStrikeConsent==='discard-resend-v1'
          &&verifiedNoticeCapability()===true
          &&inputStrikeActive(current.value!.realInputStrikeCampaign,
            activeSessionKey(),now()),
        hasCampaign:parseInputStrikeCampaign(current.value!.realInputStrikeCampaign)!==null,
      }
    } catch { return {available:false,writable:false,authorized:false,enforcing:false as const,
      armed:false,hasCampaign:false} }
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
      if(choice==='off'&&typeof scope.setMany==='function'
        &&before.value.realInputStrikeCampaign)
        await scope.setMany({realInputStrikeConsent:'off',realInputStrikeCampaign:''})
      else if(choice==='off'&&before.value.realInputStrikeCampaign){
        // Legacy Host single-field path: STOP physical refusal first.
        await scope.set('realInputStrikeCampaign','')
        if(scope.getSnapshot().value?.realInputStrikeCampaign!=='')
          throw Error('Host did not disarm input refusal')
        await scope.set('realInputStrikeConsent','off')
      }else await scope.set('realInputStrikeConsent',choice)
      const after = scope.getSnapshot()
      if (after.status !== 'ready' || after.mode !== 'host'
        || after.value?.realInputStrikeConsent !== choice
        || (choice !== 'off' && after.value?.welcomeDecision !== 'enabled'))
        throw Error('Host did not confirm input-refusal permission')
      if(choice==='off' &&after.value?.realInputStrikeCampaign)
        throw Error('Host still has an armed input campaign')
      return snapshot()
    },
    async setArmed(armed:boolean){
      const before=scope.getSnapshot()
      const valid=before.status==='ready'&&before.mode==='host'
        &&before.writable&&before.revision!==undefined&&before.value
      if(!valid)throw Error('Host settings unavailable')
      const key=activeSessionKey()
      if(armed&&(before.value!.welcomeDecision!=='enabled'
        ||before.value!.realInputStrikeConsent!=='discard-resend-v1'
        ||verifiedNoticeCapability()!==true||!key))
        throw Error('Separate consent and visible Session required')
      const old=before.value!.realInputStrikeCampaign??''
      if(!armed&&!old)return snapshot()
      if(armed&&inputStrikeActive(old,key,now()))return snapshot()
      const fresh=scope.getSnapshot()
      if(fresh.revision!==before.revision||fresh.value?.welcomeDecision!==before.value!.welcomeDecision
        ||fresh.value?.realInputStrikeConsent!==before.value!.realInputStrikeConsent
        ||fresh.value?.realInputStrikeCampaign!==old
        ||(armed&&(!verifiedNoticeCapability()||activeSessionKey()!==key)))
        throw Error('Host settings or Session changed before strike action')
      const next=armed?encodeInputStrikeCampaign(key!,now()):''
      await scope.set('realInputStrikeCampaign',next)
      const after=scope.getSnapshot()
      if(after.status!=='ready'||after.mode!=='host'
        ||after.value?.realInputStrikeCampaign!==next
        ||(armed&&(!snapshot().armed||activeSessionKey()!==key)))
        throw Error('Host did not confirm real input strike state')
      return snapshot()
    },
  }
}
