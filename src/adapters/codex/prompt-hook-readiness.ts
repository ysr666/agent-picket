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
