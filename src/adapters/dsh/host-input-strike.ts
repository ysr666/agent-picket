/**
 * Real DSH ordinary-input strike eligibility, read ONLY from the official
 * authenticated Host settings owner, never a local JSON permission fixture.
 * A chosen Web Session may also be used by another DSH client: this is a
 * Session-scoped action, NOT a claim to know the original submitting window.
 */
import {createHash} from 'node:crypto'
import type {NativeSettingsProvider} from './native-rights-command.ts'
import {inputStrikeActive,parseInputStrikeCampaign} from './input-refusal-consent.ts'

export interface AuthenticatedInputStrike {
  readonly sessionId:string
  readonly hostRevision:number
}
/** An explicit time-bounded Host campaign AND independent consent are needed. */
export function readHostActiveInputStrike(
  settings:NativeSettingsProvider|undefined,sessionId:string,now:number,
  hostBootStartedAtMs:number,
):AuthenticatedInputStrike|null{
  if(!settings||typeof sessionId!=='string'||!sessionId||sessionId.length>512
    ||!Number.isSafeInteger(now)||now<0
    ||!Number.isSafeInteger(hostBootStartedAtMs)||hostBootStartedAtMs<0
    ||hostBootStartedAtMs>now)return null
  try{
    const read=()=>settings.describe({redactSecrets:true})
      .filter(row=>row.ns==='agent-picket')
    const first=read()
    if(first.length!==1||!Number.isSafeInteger(first[0]!.revision)
      ||first[0]!.revision<0)return null
    const row=first[0]!
    const record=row.value===undefined?settings.get('agent-picket'):row.value
    const qualified=(raw:unknown)=>{
      if(!raw||typeof raw!=='object'||Array.isArray(raw))return false
      const state=raw as Record<string,unknown>
      return state.welcomeDecision==='enabled'
        &&state.realInputStrikeConsent==='discard-resend-shared-v2'
        &&inputStrikeActive(state.realInputStrikeCampaign,
          createHash('sha256').update(sessionId,'utf8').digest('hex'),now)
        // A persisted strike from an OLD Host process is NOT proof that
        // its original consenting/notice-capable Desktop is still present.
        // Never resurrect an orphaned input discard across Host restart or
        // plugin reload. New Host requires a NEW explicit arming gesture.
        &&(parseInputStrikeCampaign(state.realInputStrikeCampaign)
          ?.startedAtMs??-1)>=hostBootStartedAtMs
    }
    if(!qualified(record))return null
    const second=read()
    if(second.length!==1||second[0]!.revision!==row.revision
      ||(second[0]!.value!==undefined&&!qualified(second[0]!.value)))return null
    return {sessionId,hostRevision:row.revision}
  }catch{return null}
}
