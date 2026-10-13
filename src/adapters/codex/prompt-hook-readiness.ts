/**
 * Read-only Codex OFFICIAL hooks/list metadata gate for an explicitly reviewed
 * UserPromptSubmit handler. NOT a method of installing/trusting hooks and NOT
 * proof of fail-closed behavior after a command hook crashes or times out.
 */
export type CodexPromptHookStatus=
 'trusted'|'untrusted'|'modified'|'disabled'|'absent'|'unconfirmed'
export interface CodexPromptHookReport {
 readonly status:CodexPromptHookStatus
 readonly canOfferOptInNewWorkRefusal:boolean
 readonly failClosedOnHookErrorProven:false
}
const uncertain:CodexPromptHookReport={status:'unconfirmed',
 canOfferOptInNewWorkRefusal:false,failClosedOnHookErrorProven:false}
const valid=(s:unknown):s is string=>typeof s==='string'&&s.length>0&&s.length<4096

/**
 * Never infer trust from feature flags, `enabled=true`, a token, or a Hook
 * callback that hasn't been actually observed on the requested official Host.
 * The caller must supply an exact sourcePath and per-definition currentHash
 * that it already knows; an unrelated trusted hook cannot unlock Picket.
 */
export function inspectCodexOfficialPromptHook(
 response:unknown,cwd:string,expectedSourcePath:string,expectedHash:string,
):CodexPromptHookReport{
 if(!valid(cwd)||!valid(expectedSourcePath)
  ||typeof expectedHash!=='string'||!/^sha256:[a-f0-9]{64}$/.test(expectedHash)
  ||!response||typeof response!=='object'||Array.isArray(response))return uncertain
 const data=(response as {data?:unknown}).data
 if(!Array.isArray(data))return uncertain
 const matching=data.filter(v=>v&&typeof v==='object'&&!Array.isArray(v)
  &&(v as {cwd?:unknown}).cwd===cwd)
 if(matching.length!==1)return uncertain
 const item=matching[0] as Record<string,unknown>
 if(!Array.isArray(item.hooks)||!Array.isArray(item.warnings)
   ||item.warnings.length>0||!Array.isArray(item.errors)||item.errors.length>0)
  return uncertain
 const candidates=item.hooks.filter(v=>v&&typeof v==='object'&&!Array.isArray(v)
  &&(v as Record<string,unknown>).eventName==='userPromptSubmit'
  &&(v as Record<string,unknown>).sourcePath===expectedSourcePath)
 if(candidates.length===0)return {status:'absent',
  canOfferOptInNewWorkRefusal:false,failClosedOnHookErrorProven:false}
 if(candidates.length!==1)return uncertain
 const hook=candidates[0] as Record<string,unknown>
 if(hook.handlerType!=='command'||hook.isManaged!==false
  ||!valid(hook.command)||!valid(hook.key)
  ||typeof hook.enabled!=='boolean'
  ||!['trusted','untrusted','modified'].includes(String(hook.trustStatus))
  ||typeof hook.currentHash!=='string')return uncertain
 if(!hook.enabled)return {status:'disabled',
  canOfferOptInNewWorkRefusal:false,failClosedOnHookErrorProven:false}
 if(hook.currentHash!==expectedHash)return {status:'modified',
  canOfferOptInNewWorkRefusal:false,failClosedOnHookErrorProven:false}
 const status=hook.trustStatus as 'trusted'|'untrusted'|'modified'
 return {status,canOfferOptInNewWorkRefusal:status==='trusted',
  failClosedOnHookErrorProven:false}
}

/**
 * PRODUCTION gate for REAL Codex prompt refusal. Never equate an official
 * hook veto or a JSON consent boolean with a safe, lossless user experience.
 * Positive booleans must come from independently verified Host/UX evidence,
 * not the hook's user-editable campaign file. This is read-only.
 */
export type CodexNewWorkSafetyGap =
 |'official-hook-untrusted-or-disabled'
 |'real-user-consent-unverified'
 |'campaign-provenance-unverified'
 |'rejection-notice-unverified'
 |'lossless-prompt-and-attachments-unverified'
 |'known-lossy-host-paths-unresolved'
 |'settings-revocation-unverified'
 |'hook-failure-ux-unverified'
 |'host-client-matrix-unverified'

export interface CodexNewWorkProductionProof {
 readonly officialHook:CodexPromptHookReport
 /** An authenticated real-user first-run opt-in + optional per-action choice. */
 readonly realUserConsentVerified:boolean
 /** Campaign is authorized by the union workflow, NOT a bare state-file bool. */
 readonly campaignProvenanceVerified:boolean
 readonly visibleRejectionNoticeVerified:boolean
 /** Full composer text + attachments survived an actual native rejected input. */
 readonly fullInputRecoveryVerified:boolean
 /** Host-official API must exclude OR repair *all* demonstrated unsafe paths.
  * Hook cannot claim per-client exemption from missing attachment metadata. */
 readonly knownLossyHostPathsResolvedVerified:boolean
 /** A real settings opt-out and Host /hooks escape path are both tested. */
 readonly userRevocationVerified:boolean
 /** Broken/time-out hooks cannot masquerade as an active reliable strike. */
 readonly failureDegradationVisibleVerified:boolean
 /** Claimed Codex CLI/Desktop/OS surfaces have their own genuine tests. */
 readonly requiredClientMatrixVerified:boolean
}

export function inspectCodexNewWorkProductionReadiness(
 proof:CodexNewWorkProductionProof,
):{readonly ready:boolean;readonly gaps:readonly CodexNewWorkSafetyGap[]}{
 const gaps:CodexNewWorkSafetyGap[]=[]
 if(proof.officialHook?.canOfferOptInNewWorkRefusal!==true
  ||proof.officialHook.status!=='trusted')
  gaps.push('official-hook-untrusted-or-disabled')
 if(proof.realUserConsentVerified!==true)gaps.push('real-user-consent-unverified')
 if(proof.campaignProvenanceVerified!==true)gaps.push('campaign-provenance-unverified')
 if(proof.visibleRejectionNoticeVerified!==true)gaps.push('rejection-notice-unverified')
 if(proof.fullInputRecoveryVerified!==true)
  gaps.push('lossless-prompt-and-attachments-unverified')
 if(proof.knownLossyHostPathsResolvedVerified!==true)
  gaps.push('known-lossy-host-paths-unresolved')
 if(proof.userRevocationVerified!==true)gaps.push('settings-revocation-unverified')
 if(proof.failureDegradationVisibleVerified!==true)
  gaps.push('hook-failure-ux-unverified')
 if(proof.requiredClientMatrixVerified!==true)
  gaps.push('host-client-matrix-unverified')
 return {ready:gaps.length===0,gaps}
}

/** Actual verified native evidence for 0.146.1, not optimism about future UX. */
export const CODEX_0146_PROMPT_REFUSAL_PRODUCTION_PROOF=Object.freeze({
 officialHook:{status:'unconfirmed',canOfferOptInNewWorkRefusal:false,
  failClosedOnHookErrorProven:false} as CodexPromptHookReport,
 realUserConsentVerified:false,
 campaignProvenanceVerified:false,
 visibleRejectionNoticeVerified:false,
 fullInputRecoveryVerified:false,
 knownLossyHostPathsResolvedVerified:false,
 userRevocationVerified:false,
 failureDegradationVisibleVerified:false,
 requiredClientMatrixVerified:false,
})
