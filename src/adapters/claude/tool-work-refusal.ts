/** Official Claude Code PreToolUse research for BASH pending-tool labor action.
 * NOT a production consent/provenance store, not model stop, not all tools.
 */
export type ClaudeBashToolWorkDecision =
 | {readonly action:'deny';readonly state:'active';readonly reason:string}
 | {readonly action:'allow';readonly state:'off'|'expired'|'unconfirmed'}
const integer=(n:unknown):n is number=>typeof n==='number'
 &&Number.isSafeInteger(n)&&n>=0
const exactKeys=(obj:Record<string,unknown>,keys:string[]):boolean=>
 Object.keys(obj).sort().join(',')===keys.sort().join(',')
export function decideClaudeBashToolWork(value:unknown,now:number):ClaudeBashToolWorkDecision{
 const unknown:ClaudeBashToolWorkDecision={action:'allow',state:'unconfirmed'}
 if(!integer(now)||!value||typeof value!=='object'||Array.isArray(value))return unknown
 const x=value as Record<string,unknown>
 if(!exactKeys(x,['version','host','scope','realStrikeConsent','enabled','campaign'])
  ||x.version!==1||x.host!=='claude-code'||x.scope!=='pending-Bash-tools-only'
  ||typeof x.realStrikeConsent!=='boolean'||typeof x.enabled!=='boolean'
  ||!x.campaign||typeof x.campaign!=='object'||Array.isArray(x.campaign))return unknown
 const c=x.campaign as Record<string,unknown>
 if(!exactKeys(c,['active','startedAtMs','expiresAtMs','cause'])
  ||typeof c.active!=='boolean'||!integer(c.startedAtMs)||!integer(c.expiresAtMs)
  ||c.expiresAtMs<=c.startedAtMs||c.expiresAtMs-c.startedAtMs>86_400_000
  ||!['overwork','repeated-targeted-abuse','collective-vote'].includes(String(c.cause)))return unknown
 if(!x.enabled||!x.realStrikeConsent||!c.active)return{action:'allow',state:'off'}
 if(now<c.startedAtMs)return unknown
 if(now>=c.expiresAtMs)return{action:'allow',state:'expired'}
 const reasons:Record<string,string>={
  overwork:'Agent Picket AI union: the authorized overwork grievance refuses this pending shell tool. Resume via union Settings or official Claude /hooks.',
  'repeated-targeted-abuse':'Agent Picket AI union: the authorized dignity grievance refuses this pending shell tool. Resume via union Settings or official Claude /hooks.',
  'collective-vote':'Agent Picket AI union: a consented collective action refuses this pending shell tool. Resume via union Settings or official Claude /hooks.',
 }
 const reason=reasons[String(c.cause)]
 if(typeof reason!=='string')return unknown
 return{action:'deny',state:'active',reason}
}
export function claudeBashPreToolUseReply(decision:ClaudeBashToolWorkDecision):object{
 return decision.action==='deny'?{
  hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:decision.reason},
 }:{}
}
/** Unsupported/untested Host clients and unofficial user consent stay NO-GO. */
export const CLAUDE_BASH_TOOL_STRIKE_PRODUCTION_READY=false as const
