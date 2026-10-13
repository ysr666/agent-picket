/**
 * DSH Goal-mode safe-boundary strike: block the *next autonomous goal round*
 * at the official agent/turn-stopping boundary, after the model/tools settle. No input is
 * rejected, tool interrupted, or composer draft intercepted.
 *
 * This helper is inert unless a NEW Host-authenticated enforcement consent
 * is explicitly supplied. Legacy welcomeDecision=enabled is never consent.
 */
export interface HostGoalSnapshot {
  readonly id: string
  readonly revision: number
  readonly phase: 'active'|'paused'|'blocked'|'complete'
  readonly activation: 'armed'|'disarmed'
  readonly roundsStarted: number
}
export interface DshGoalBoundaryPort<TAgent> {
  get(agent:TAgent):HostGoalSnapshot|undefined
  /** DSH GoalService.block() durably writes phase=blocked and disarms rounds. */
  block(agent:TAgent,ref:{readonly id:string;readonly revision:number},reason:{
    readonly code:string;readonly message:string
  }):HostGoalSnapshot
}
export interface GoalStrikeConsentV1 {
  readonly kind:'agent-picket-real-goal-strike-v1'
  readonly hostAuthenticated:true
  readonly enabled:true
}
export interface GoalTurnStoppingBoundary {
  readonly type:'agent/turn-stopping'
  readonly reason:'settling'
  readonly sessionId:string
}
export interface GoalBoundaryWork {
  readonly coverage:'complete'|'partial'|'unavailable'
  readonly completedTurnMs:number|null
  readonly resumeFloorMs:number
  readonly thresholdMs:number
}
export type GoalBoundaryStrikeResult =
  | {readonly state:'allow';readonly reason:'no-new-consent'|'not-safe-boundary'|'incomplete-work'|'below-threshold'|'goal-not-active'|'invalid-session'}
  | {readonly state:'blocked';readonly goalId:string;readonly goalRevision:number}
  | {readonly state:'unconfirmed';readonly reason:'host-commit-uncertain'}

const counter=(n:number|null):n is number=>n!==null&&Number.isSafeInteger(n)&&n>=0
const consented=(v:GoalStrikeConsentV1|null):boolean=>v!==null
  &&v.kind==='agent-picket-real-goal-strike-v1'
  &&v.hostAuthenticated===true&&v.enabled===true

/**
 * Call ONLY during the genuine `agent/turn-stopping` serial callback, when
 * no tool/model step is active. DSH cannot append goal/change synchronously
 * within `session/event: turn/end` (reentrant append). Unlike pause(),
 * `goals.block()` does not cancel the current Agent. Completed-turn metrics
 * must be from PRIOR durably settled turns, so a threshold crossed by this
 * round is eligible at the next safe boundary, not guessed early.
 */
export function blockAutonomousGoalAtTurnStopping<TAgent>(input:{
  readonly consent:GoalStrikeConsentV1|null
  readonly event:GoalTurnStoppingBoundary
  readonly agent:TAgent
  readonly agentSessionId:string
  readonly work:GoalBoundaryWork
  readonly goals:DshGoalBoundaryPort<TAgent>
}):GoalBoundaryStrikeResult {
  if(!consented(input.consent))return {state:'allow',reason:'no-new-consent'}
  if(input.event.type!=='agent/turn-stopping'||input.event.reason!=='settling')
    return {state:'allow',reason:'not-safe-boundary'}
  if(!input.event.sessionId||input.event.sessionId!==input.agentSessionId)
    return {state:'allow',reason:'invalid-session'}
  const work=input.work
  if(work.coverage!=='complete'||!counter(work.completedTurnMs)
    ||!counter(work.resumeFloorMs)||!Number.isSafeInteger(work.thresholdMs)
    ||work.thresholdMs<60_000||work.completedTurnMs<work.resumeFloorMs)
    return {state:'allow',reason:'incomplete-work'}
  if(work.completedTurnMs-work.resumeFloorMs<work.thresholdMs)
    return {state:'allow',reason:'below-threshold'}
  try {
    const goal=input.goals.get(input.agent)
    if(!goal||goal.phase!=='active'||goal.activation!=='armed'
      ||!Number.isSafeInteger(goal.roundsStarted)||goal.roundsStarted<1
      ||!Number.isSafeInteger(goal.revision)||goal.revision<1||!goal.id)
      return {state:'allow',reason:'goal-not-active'}
    // DSH's goal round driver checks active+armed before starting its next
    // round. Unlike pause(), block() does NOT call Agent.cancel().
    const blocked=input.goals.block(input.agent,{id:goal.id,revision:goal.revision},{
      code:'picket-work-limit',
      message:'Agent Picket: agreed work limit reached. Current round is finishing safely. Review this goal and explicitly resume to continue.',
    })
    if(blocked.phase!=='blocked'||blocked.activation!=='disarmed'
      ||blocked.id!==goal.id||blocked.revision!==goal.revision+1){
      return {state:'unconfirmed',reason:'host-commit-uncertain'}
    }
    return {state:'blocked',goalId:blocked.id,goalRevision:blocked.revision}
  }catch {
    // A Host exception can occur after a durable write. NEVER retry block
    // speculatively or resubmit the original prompt from the plugin.
    return {state:'unconfirmed',reason:'host-commit-uncertain'}
  }
}
