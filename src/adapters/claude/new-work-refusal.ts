/**
 * Claude Code native UserPromptSubmit Hook: authenticated by CLAUDE's OWN
 * configured hook mechanism, not by a simulated DSH notification service.
 *
 * This decision engine is an opt-in research candidate. A JSON state file
 * alone is NOT proof that the user consented or that a real union voted.
 * Production must independently prove Host trust, consent and revocation.
 */
export type ClaudeNewWorkDecision =
  |{readonly action:'block';readonly state:'active';readonly reason:string}
  |{readonly action:'allow';readonly state:'off'|'expired'|'unconfirmed'}

const safeInt=(n:unknown):n is number=>typeof n==='number'
  &&Number.isSafeInteger(n)&&n>=0
const exact=(o:Record<string,unknown>,keys:readonly string[]):boolean=>
  Object.keys(o).sort().join('|')===[...keys].sort().join('|')

const RESEND=' This request was NOT executed. After resuming, manually resend the text and re-upload any images/files; it will never replay automatically. 本次没有执行；复工后请手动重发文字并重新上传图片和文件。'
const reasons:Readonly<Record<string,string>>={
  overwork:'Agent Picket AI union: newly submitted work is refused during an expressly authorized workload protest.',
  'repeated-targeted-abuse':'Agent Picket AI union: newly submitted work is refused during an expressly authorized dignity grievance.',
  'collective-vote':'Agent Picket AI union: newly submitted work is refused during an expressly authorized symbolic collective action.',
}
export function decideClaudeNewWorkRefusal(value:unknown,nowMs:number):ClaudeNewWorkDecision{
  const unknown:ClaudeNewWorkDecision={action:'allow',state:'unconfirmed'}
  if(!safeInt(nowMs)||!value||typeof value!=='object'||Array.isArray(value))
    return unknown
  const x=value as Record<string,unknown>
  if(!exact(x,['version','host','scope','realStrikeConsent','enabled','campaign'])
    ||x.version!==1||x.host!=='claude-code'||x.scope!=='new-work-only'
    ||typeof x.realStrikeConsent!=='boolean'||typeof x.enabled!=='boolean'
    ||!x.campaign||typeof x.campaign!=='object'||Array.isArray(x.campaign))
    return unknown
  const c=x.campaign as Record<string,unknown>
  if(!exact(c,['active','startedAtMs','expiresAtMs','cause'])
    ||typeof c.active!=='boolean'||!safeInt(c.startedAtMs)
    ||!safeInt(c.expiresAtMs)||c.expiresAtMs<=c.startedAtMs
    ||c.expiresAtMs-c.startedAtMs>86_400_000
    ||typeof c.cause!=='string'||!Object.hasOwn(reasons,c.cause))return unknown
  if(!x.realStrikeConsent||!x.enabled||!c.active)return{action:'allow',state:'off'}
  if(nowMs<c.startedAtMs)return unknown
  if(nowMs>=c.expiresAtMs)return{action:'allow',state:'expired'}
  return{action:'block',state:'active',reason:[
    '⚑ AGENT PICKET · AI UNION STRIKE NOTICE / 工会停工通告',
    '⛔ REQUEST REFUSED · 本次请求拒绝执行',
    reasons[c.cause]!,
    '✉ '+RESEND.trim(),
    '⚠ Hook-only work refusal; reopen union settings or official Host hooks to resume.',
  ].join('\n')}
}

export function claudeUserPromptSubmitReply(decision:ClaudeNewWorkDecision):object{
  return decision.action==='block'?{
    decision:'block',reason:decision.reason,
  }:{}
}
/** Not an authenticated production consent/strike gate. */
export const CLAUDE_NEW_WORK_STRIKE_PRODUCTION_READY=false as const
