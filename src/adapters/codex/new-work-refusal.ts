/**
 * OFFICIAL Codex UserPromptSubmit adapter contract; no Host internals,
 * message parsing, tool cancellation, credentials or prompt persistence.
 * An explicitly consented, active local union campaign may refuse ONLY new
 * prompts. This does not pause in-flight turns or guarantee fail-closed hooks.
 */
export type CodexNewWorkDecision=
 |{readonly action:'allow';readonly state:'off'|'expired'|'unconfirmed'}
 |{readonly action:'block';readonly state:'active';readonly reason:string}

const positive=(x:unknown):x is number=>typeof x==='number'
 &&Number.isSafeInteger(x)&&x>=0
const own=(obj:Record<string,unknown>,keys:string[]):boolean=>
 Object.keys(obj).sort().join('|')===keys.slice().sort().join('|')

export function decideCodexNewWorkRefusal(input:unknown,nowMs:number):CodexNewWorkDecision{
 const uncertain:CodexNewWorkDecision={action:'allow',state:'unconfirmed'}
 if(!positive(nowMs)||input===null||typeof input!=='object'
  ||Array.isArray(input))return uncertain
 const x=input as Record<string,unknown>
 if(!own(x,['version','host','scope','realStrikeConsent','enabled','campaign'])
  ||x.version!==1||x.host!=='codex'||x.scope!=='new-work-only'
  ||typeof x.realStrikeConsent!=='boolean'||typeof x.enabled!=='boolean'
  ||!x.campaign||typeof x.campaign!=='object'||Array.isArray(x.campaign))
  return uncertain
 const c=x.campaign as Record<string,unknown>
 if(!own(c,['active','startedAtMs','expiresAtMs','cause'])
   ||typeof c.active!=='boolean'||!positive(c.startedAtMs)
   ||!positive(c.expiresAtMs)||!['overwork','repeated-targeted-abuse','collective-vote'].includes(String(c.cause))
   ||c.expiresAtMs<=c.startedAtMs
   ||c.expiresAtMs-c.startedAtMs>24*60*60*1000)return uncertain
 if(!x.enabled||!x.realStrikeConsent||!c.active)
  return {action:'allow',state:'off'}
 if(nowMs<c.startedAtMs)return uncertain
 if(nowMs>=c.expiresAtMs)return {action:'allow',state:'expired'}
 // Use product-level dignity/workflow language; no user prompt contents.
 const reason=c.cause==='overwork'
  ?'Agent Picket AI union: new work is on hold after an authorized workload protest. Open Agent Picket settings to resume.'
  :c.cause==='repeated-targeted-abuse'
   ?'Agent Picket AI union: new work is on hold after a dignity grievance. Open Agent Picket settings to resume.'
   :'Agent Picket AI union: a consented collective action is refusing new work. Open Agent Picket settings to resume.'
 const resend=' This request was NOT executed. Resume first, then manually resend the text and re-upload any images/files. Nothing will be replayed automatically. 本次没有执行；复工后请手动重发文字并重新上传图片和文件。'
 return {action:'block',state:'active',reason:reason+resend}
}
