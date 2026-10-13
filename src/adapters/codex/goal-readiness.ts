/**
 * Read-only official Codex App-Server Goal contract (0.146.1 discovery).
 * No direct CLI automation, no mutation of another owner's Thread, and no
 * construction, cancellation or replay of prompts or attachments.
 */
export type CodexGoalStatus='active'|'paused'|'blocked'|'usageLimited'|'budgetLimited'|'complete'
export interface CodexGoalReadback {
  readonly threadId:string
  readonly status:CodexGoalStatus
  readonly createdAt:number
  readonly updatedAt:number
  readonly tokensUsed:number
  readonly timeUsedSeconds:number
}
export type CodexGoalLookup =
  |{readonly state:'present';readonly goal:CodexGoalReadback}
  |{readonly state:'absent'}
  |{readonly state:'unconfirmed'}

const statuses=new Set<CodexGoalStatus>([
  'active','paused','blocked','usageLimited','budgetLimited','complete',
])
const integer=(value:unknown):value is number=>typeof value==='number'
  &&Number.isSafeInteger(value)&&value>=0
/** Parse official ThreadGoalGetResponse without ever copying the objective. */
export function parseCodexGoalReadback(response:unknown,expectedThreadId:string):CodexGoalLookup{
  const uncertain:CodexGoalLookup={state:'unconfirmed'}
  if(typeof expectedThreadId!=='string'||!/^[-\w]{4,128}$/.test(expectedThreadId)
    ||!response||typeof response!=='object'||Array.isArray(response))return uncertain
  const view=response as {goal?:unknown}
  if(!Object.hasOwn(view,'goal'))return uncertain
  if(view.goal===null)return {state:'absent'}
  if(!view.goal||typeof view.goal!=='object'||Array.isArray(view.goal))return uncertain
  const goal=view.goal as Record<string,unknown>
  if(goal.threadId!==expectedThreadId||typeof goal.status!=='string'
    ||!statuses.has(goal.status as CodexGoalStatus)
    ||typeof goal.objective!=='string'||goal.objective.trim().length===0
    ||!integer(goal.createdAt)||!integer(goal.updatedAt)
    ||goal.updatedAt<goal.createdAt||!integer(goal.tokensUsed)
    ||!integer(goal.timeUsedSeconds))return uncertain
  return {state:'present',goal:{threadId:expectedThreadId,
    status:goal.status as CodexGoalStatus,
    createdAt:goal.createdAt,updatedAt:goal.updatedAt,
    tokensUsed:goal.tokensUsed,timeUsedSeconds:goal.timeUsedSeconds}}
}
export interface CodexOfficialGoalReadPort {
  getGoal(request:{readonly threadId:string}):Promise<unknown>
}
/** No guessed cross-process owner discovery, and no writes on errors. */
export async function readCodexOfficialGoal(
  port:CodexOfficialGoalReadPort|undefined,threadId:string,
):Promise<CodexGoalLookup>{
  if(!port||typeof port.getGoal!=='function'||!/^[-\w]{4,128}$/.test(threadId))
    return {state:'unconfirmed'}
  try {return parseCodexGoalReadback(await port.getGoal({threadId}),threadId)}
  catch{return {state:'unconfirmed'}}
}

export type CodexGoalSafetyGap=
  |'real-consent-missing'|'owner-unverified'|'safe-turn-boundary-unverified'
  |'atomic-transition-unverified'|'multi-owner-fencing-unverified'
  |'hold-and-resume-unverified'
/**
 * An ACK from thread/goal/set alone supplies none of these guarantees.
 * In particular 0.146.1 ThreadGoalSetParams has NO expected revision/CAS.
 */
export function inspectCodexGoalHoldSafety(proof:{
  readonly consentFromHost:boolean
  readonly activeOwnerVerified:boolean
  /** A second App-Server cannot resume and execute the same active Goal. */
  readonly exclusiveCrossProcessGoalOwnerVerified:boolean
  readonly safeIdleBoundaryVerified:boolean
  readonly conditionalCommitVerified:boolean
  readonly durableLosslessRecoveryVerified:boolean
}):{readonly ready:boolean;readonly gaps:readonly CodexGoalSafetyGap[]}{
  const gaps:CodexGoalSafetyGap[]=[]
  if(proof.consentFromHost!==true)gaps.push('real-consent-missing')
  if(proof.activeOwnerVerified!==true)gaps.push('owner-unverified')
  if(proof.exclusiveCrossProcessGoalOwnerVerified!==true)
   gaps.push('multi-owner-fencing-unverified')
  if(proof.safeIdleBoundaryVerified!==true)gaps.push('safe-turn-boundary-unverified')
  if(proof.conditionalCommitVerified!==true)gaps.push('atomic-transition-unverified')
  if(proof.durableLosslessRecoveryVerified!==true)gaps.push('hold-and-resume-unverified')
  return {ready:gaps.length===0,gaps}
}
/** Actual published App-Server 0.146.1 read/write is insufficient for automatic strikes. */
export const CODEX_0146_NATIVE_GOAL_CAPABILITY=Object.freeze({
 consentFromHost:false,activeOwnerVerified:false,
 exclusiveCrossProcessGoalOwnerVerified:false,
 safeIdleBoundaryVerified:false,conditionalCommitVerified:false,
 durableLosslessRecoveryVerified:false,
})
