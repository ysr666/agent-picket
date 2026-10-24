import {readCodexOfficialGoal,parseCodexGoalReadback,
 type CodexOfficialGoalReadPort} from './goal-readiness.ts'

/**
 * Experimental SAME-OWNER command bridge for the official Codex Goal API.
 *
 * The future installed Host integration must supply authority and owner
 * checks from its own authenticated control plane. No local preferences file,
 * user prompt, Agent instruction or external PID can mint that authority.
 * Current official Goal/set has NO conditional revision/CAS: this helper is
 * NOT a production strike admission fence and is excluded from the npm pack.
 */
export interface CodexOwnerUnionGoalPort extends CodexOfficialGoalReadPort {
  /** Only a real Host-controlled, explicitly granted scope is acceptable. */
  hasHostConsent(scope:'goal-pause'|'goal-resume'):Promise<boolean>
  /** Exact Thread is attached to THIS live, single official App-Server owner. */
  ownsThread(threadId:string):Promise<boolean>
  /** Direct official thread/goal/set; never external command injection. */
  setGoal(request:{readonly threadId:string;
    readonly status:'paused'|'active'}):Promise<unknown>
}
export type CodexOwnerGoalActionOutcome=
  'unavailable'|'not-authorized'|'not-applicable'|
  'unconfirmed'|'pause-requested'|'resume-confirmed'
export interface CodexOwnerGoalActionResult {
  readonly outcome:CodexOwnerGoalActionOutcome
  /** This is NEVER proof that the active Turn already completed. */
  readonly currentTurnCompleted:false
}
const result=(outcome:CodexOwnerGoalActionOutcome):
  CodexOwnerGoalActionResult=>({outcome,currentTurnCompleted:false})
const valid=(id:string)=>/^[-\w]{4,128}$/.test(id)

/**
 * Only a verified active Goal may receive an opt-in pause request.
 * The official mutation is accepted while current tools/model still run.
 * The UI must independently observe turn/completed before claiming "held".
 */
export async function requestCodexUnionGoalPause(
  port:CodexOwnerUnionGoalPort|undefined,threadId:string,
):Promise<CodexOwnerGoalActionResult>{
  if(!port||!valid(threadId))return result('unavailable')
  try{
    if(!await port.hasHostConsent('goal-pause')
      ||!await port.ownsThread(threadId))return result('not-authorized')
    const before=await readCodexOfficialGoal(port,threadId)
    if(before.state!=='present')return result('unconfirmed')
    if(before.goal.status!=='active')return result('not-applicable')
    // Repeat both gates close to mutation; still not a substitute for Host CAS.
    if(!await port.hasHostConsent('goal-pause')
      ||!await port.ownsThread(threadId))return result('not-authorized')
    const ack=parseCodexGoalReadback(
      await port.setGoal({threadId,status:'paused'}),threadId)
    if(ack.state!=='present'||ack.goal.status!=='paused')
      return result('unconfirmed')
    const after=await readCodexOfficialGoal(port,threadId)
    if(after.state!=='present'||after.goal.status!=='paused')
      return result('unconfirmed')
    return result('pause-requested')
  }catch{return result('unconfirmed')}
}

/**
 * Resume is a separate explicit human action. Never auto-replay an old Turn
 * and never resume merely because a union campaign expires or the UI reloads.
 */
export async function resumeCodexUnionGoal(
  port:CodexOwnerUnionGoalPort|undefined,threadId:string,
):Promise<CodexOwnerGoalActionResult>{
  if(!port||!valid(threadId))return result('unavailable')
  try{
    if(!await port.hasHostConsent('goal-resume')
      ||!await port.ownsThread(threadId))return result('not-authorized')
    const before=await readCodexOfficialGoal(port,threadId)
    if(before.state!=='present')return result('unconfirmed')
    if(before.goal.status!=='paused')return result('not-applicable')
    if(!await port.hasHostConsent('goal-resume')
      ||!await port.ownsThread(threadId))return result('not-authorized')
    const ack=parseCodexGoalReadback(
      await port.setGoal({threadId,status:'active'}),threadId)
    if(ack.state!=='present'||ack.goal.status!=='active')
      return result('unconfirmed')
    const after=await readCodexOfficialGoal(port,threadId)
    return result(after.state==='present'&&after.goal.status==='active'
      ?'resume-confirmed':'unconfirmed')
  }catch{return result('unconfirmed')}
}
