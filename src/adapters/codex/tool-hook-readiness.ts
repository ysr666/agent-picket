/**
 * Official `hooks/list` readback ONLY: a trusted canonical `Bash` PreToolUse
 * command Hook is necessary but NOT sufficient for tool-strike readiness.
 * No Host config mutation, auto-trust or production enablement here.
 */
export type CodexBashToolHookReport={
 readonly status:'trusted'|'untrusted'|'modified'|'disabled'|'absent'|'unconfirmed'
 readonly canOfferResearchBashVeto:boolean
 readonly canGuaranteeFailClosed:false
 readonly canEnforceAllTools:false
}
const report=(status:CodexBashToolHookReport['status']):CodexBashToolHookReport=>({
 status,canOfferResearchBashVeto:status==='trusted',
 canGuaranteeFailClosed:false,canEnforceAllTools:false,
})
const hashShape=/^sha256:[a-f0-9]{64}$/
const valid=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<4096
/** A different, trusted hook cannot substitute for the exact reviewed handler. */
export function inspectCodexOfficialBashToolHook(
 response:unknown,cwd:string,expectedSourcePath:string,expectedHash:string,
):CodexBashToolHookReport{
 if(!valid(cwd)||!valid(expectedSourcePath)||!hashShape.test(expectedHash)
  ||!response||typeof response!=='object'||Array.isArray(response))return report('unconfirmed')
 const data=(response as {data?:unknown}).data
 if(!Array.isArray(data))return report('unconfirmed')
 const matches=data.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)
  &&(x as {cwd?:unknown}).cwd===cwd)
 if(matches.length!==1)return report('unconfirmed')
 const x=matches[0] as Record<string,unknown>
 if(!Array.isArray(x.hooks)||!Array.isArray(x.warnings)
  ||x.warnings.length>0||!Array.isArray(x.errors)||x.errors.length>0)
  return report('unconfirmed')
 const hooks=x.hooks.filter(v=>v&&typeof v==='object'&&!Array.isArray(v)
  &&(v as Record<string,unknown>).eventName==='preToolUse'
  &&(v as Record<string,unknown>).sourcePath===expectedSourcePath)
 if(hooks.length===0)return report('absent')
 if(hooks.length!==1)return report('unconfirmed')
 const h=hooks[0] as Record<string,unknown>
 if(h.handlerType!=='command'||h.matcher!=='^Bash$'||h.isManaged!==false
  ||!valid(h.key)||!valid(h.command)||typeof h.enabled!=='boolean'
  ||!['trusted','untrusted','modified'].includes(String(h.trustStatus))
  ||typeof h.currentHash!=='string')return report('unconfirmed')
 if(!h.enabled)return report('disabled')
 if(h.currentHash!==expectedHash)return report('modified')
 return report(h.trustStatus as 'trusted'|'untrusted'|'modified')
}

/** Test-only readout; production gate intentionally remains NO-GO. */
export const CODEX_BASH_TOOL_STRIKE_PRODUCTION_READY=false as const
