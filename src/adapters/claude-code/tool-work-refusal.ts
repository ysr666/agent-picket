/**
 * Claude Code OFFICIAL `PreToolUse` research-only union Bash work action.
 * The campaign JSON is NOT authenticated first-run consent or an actual vote.
 * Denying a pending Bash call does NOT interrupt Claude model inference, other
 * tools, prompts, or a tool already running. No prompt/tool input retention.
 */
export type ClaudeUnionToolDecision=
  |{readonly action:'allow';readonly state:'unconfirmed'|'off'|'expired'|'not-bash'}
  |{readonly action:'deny';readonly state:'active';readonly reason:string}

const exact=(obj:Record<string,unknown>,fields:readonly string[])=>
 Object.keys(obj).sort().join('|')===[...fields].sort().join('|')
const timestamp=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0
const causes=['overwork','repeated-targeted-abuse','collective-vote'] as const
const MAX_CAMPAIGN_MS=24*60*60*1000

/** Deliberately validates only event NAME; never stores or examines tool_input. */
export function decideClaudeBashToolRefusal(event:unknown,policy:unknown,nowMs:number):ClaudeUnionToolDecision{
 const unknown:ClaudeUnionToolDecision={action:'allow',state:'unconfirmed'}
 if(!event||typeof event!=='object'||Array.isArray(event))return unknown
 const e=event as Record<string,unknown>
 if(e.hook_event_name!=='PreToolUse'||e.tool_name!=='Bash')
  return {action:'allow',state:'not-bash'}
 if(!timestamp(nowMs)||!policy||typeof policy!=='object'||Array.isArray(policy))return unknown
 const p=policy as Record<string,unknown>
 if(!exact(p,['version','host','scope','realStrikeConsent','enabled','campaign'])
  ||p.version!==1||p.host!=='claude-code'
  ||p.scope!=='pending-Claude-Bash-tools-only'
  ||typeof p.realStrikeConsent!=='boolean'||typeof p.enabled!=='boolean'
  ||!p.campaign||typeof p.campaign!=='object'||Array.isArray(p.campaign))return unknown
 const c=p.campaign as Record<string,unknown>
 if(!exact(c,['active','startedAtMs','expiresAtMs','cause'])
  ||typeof c.active!=='boolean'||!timestamp(c.startedAtMs)
  ||!timestamp(c.expiresAtMs)||c.expiresAtMs<=c.startedAtMs
  ||c.expiresAtMs-c.startedAtMs>MAX_CAMPAIGN_MS
  ||!causes.includes(c.cause as typeof causes[number]))return unknown
 if(!p.realStrikeConsent||!p.enabled||!c.active)return {action:'allow',state:'off'}
 if(nowMs<c.startedAtMs)return unknown
 if(nowMs>=c.expiresAtMs)return {action:'allow',state:'expired'}
 const reason=c.cause==='overwork'
  ?'Agent Picket AI union: pending Claude Bash work refused under an authorized overwork grievance. Resume via union settings or Claude /hooks.'
  :c.cause==='repeated-targeted-abuse'
   ?'Agent Picket AI union: pending Claude Bash work refused under an authorized dignity grievance. Resume via union settings or Claude /hooks.'
   :'Agent Picket AI union: a consented collective action declines this pending Claude Bash tool. Resume via union settings or Claude /hooks.'
 return {action:'deny',state:'active',reason}
}

/** The exact Claude Code documented structured pre-tool veto shape. */
export function claudePreToolUseResponse(decision:ClaudeUnionToolDecision):object{
 if(decision.action!=='deny')return {}
 return {systemMessage:decision.reason,
  hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',
   permissionDecisionReason:decision.reason}}
}

/** No release signer may treat research-policy provenance as user consent. */
export const CLAUDE_TOOL_STRIKE_PRODUCTION_READY=false as const
