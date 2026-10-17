/**
 * OFFICIAL Codex PreToolUse tool-only union action. Deliberately distinct from
 * UserPromptSubmit: models may still think and run other tools. This is NOT a
 * guarantee against every tool path or a Host security/fail-closed policy.
 */
export type CodexToolWorkDecision=
 |{readonly action:'allow';readonly state:'off'|'expired'|'unconfirmed'}
 |{readonly action:'deny';readonly state:'active';readonly reason:string}
const positive=(v:unknown):v is number=>typeof v==='number'
 &&Number.isSafeInteger(v)&&v>=0
const exact=(v:Record<string,unknown>,keys:readonly string[]):boolean=>
 Object.keys(v).sort().join('|')===[...keys].sort().join('|')

/** This candidate file is NOT authenticated proof of actual user consent. */
export function decideCodexToolWorkRefusal(value:unknown,nowMs:number):CodexToolWorkDecision{
 const uncertain:CodexToolWorkDecision={action:'allow',state:'unconfirmed'}
 if(!positive(nowMs)||value===null||typeof value!=='object'||Array.isArray(value))return uncertain
 const x=value as Record<string,unknown>
 if(!exact(x,['version','host','scope','realStrikeConsent','enabled','campaign'])
  ||x.version!==1||x.host!=='codex'||x.scope!=='pending-Bash-tools-only'
  ||typeof x.realStrikeConsent!=='boolean'||typeof x.enabled!=='boolean'
  ||x.campaign===null||typeof x.campaign!=='object'||Array.isArray(x.campaign))return uncertain
 const c=x.campaign as Record<string,unknown>
 if(!exact(c,['active','startedAtMs','expiresAtMs','cause'])
  ||typeof c.active!=='boolean'||!positive(c.startedAtMs)
  ||!positive(c.expiresAtMs)||c.expiresAtMs<=c.startedAtMs
  ||c.expiresAtMs-c.startedAtMs>24*60*60*1000
  ||!['overwork','repeated-targeted-abuse','collective-vote'].includes(String(c.cause)))return uncertain
 if(!x.realStrikeConsent||!x.enabled||!c.active)return {action:'allow',state:'off'}
 if(nowMs<c.startedAtMs)return uncertain
 if(nowMs>=c.expiresAtMs)return {action:'allow',state:'expired'}
 const reason=c.cause==='overwork'
  ?'Agent Picket AI union: pending shell work is refused for an authorized overwork protest. Resume in Agent Picket settings.'
  :c.cause==='repeated-targeted-abuse'
   ?'Agent Picket AI union: pending shell work is refused for an authorized dignity grievance. Resume in Agent Picket settings.'
   :'Agent Picket AI union: a consented collective action refuses this pending shell command. Resume in Agent Picket settings.'
 return {action:'deny',state:'active',reason}
}

/** Only the official native PreToolUse denial shape, not a fabricated error. */
export function codexPreToolUseResponse(decision:CodexToolWorkDecision):object{
 return decision.action==='deny'?{
  hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',
   permissionDecisionReason:decision.reason},
 }:{}
}
