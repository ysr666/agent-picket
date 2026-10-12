import {
  blockAutonomousGoalAtTurnStopping,
  type GoalStrikeConsentV1,
  type DshGoalBoundaryPort,
} from './goal-boundary-strike.ts'
import type { NativeSettingsProvider } from './native-rights-command.ts'

/** Host-owned, explicit v1 permission is independent from the old simulated welcome. */
export function readHostGoalStrikeConsent(
  settings:NativeSettingsProvider | undefined,
):GoalStrikeConsentV1|null {
  try {
    if(!settings)return null
    // Prefer ONE redacted Host descriptor for both permission and revision.
    // Old provider versions may expose value only through get(); then fence
    // that read between two equal Host revisions to reject torn snapshots.
    const before=settings.describe({redactSecrets:true})
      .filter(x=>x.ns==='agent-picket')
    if(before.length!==1||!Number.isSafeInteger(before[0]?.revision)
      ||before[0]!.revision<0)return null
    const row=before[0]!
    const section=(row.value===undefined?settings.get('agent-picket'):row.value) as {
      welcomeDecision?:unknown;realGoalStrikeConsent?:unknown
    }|null|undefined
    if(!section||section.welcomeDecision!=='enabled'
      ||section.realGoalStrikeConsent!=='authorized-v1')return null
    const after=settings.describe({redactSecrets:true})
      .filter(x=>x.ns==='agent-picket')
    if(after.length!==1||after[0]!.revision!==row.revision)return null
    const newest=after[0]!.value as {
      welcomeDecision?:unknown;realGoalStrikeConsent?:unknown
    }|undefined
    // A revision-neutral Host descriptor mutation is inconsistent and cannot
    // be used to grant authority even if a stale prior view says enabled.
    if(newest&&(newest.welcomeDecision!=='enabled'
      ||newest.realGoalStrikeConsent!=='authorized-v1'))return null
    return {kind:'agent-picket-real-goal-strike-v1',hostAuthenticated:true,enabled:true}
  }catch{return null}
}

/** Validated UTC work counter from Host's durable *completed* turn ledger. */
export function completedUtcDayWork(
  rows:readonly unknown[]|undefined,nowMs:number,
):number|null {
  if(!Array.isArray(rows)||!Number.isSafeInteger(nowMs)
    ||nowMs<0||nowMs>8_640_000_000_000_000)return null
  const utcDay=new Date(nowMs).toISOString().slice(0,10)
  const same=rows.filter(row=>!!row&&typeof row==='object'
    &&(row as {day?:unknown}).day===utcDay)
  if(same.length!==1)return null
  const value=(same[0] as {totals?:{completedTurnMs?:unknown}}).totals?.completedTurnMs
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null
}

/** One actual union-generated block per Goal per UTC day, even after resume/restart. */
export function alreadyBlockedGoalToday(
  events:readonly unknown[],goalId:string,nowMs:number,
):boolean {
  if(!Array.isArray(events)||!goalId||!Number.isSafeInteger(nowMs)||nowMs<0)return true
  const start=Date.parse(new Date(nowMs).toISOString().slice(0,10)+'T00:00:00.000Z')
  for(let i=events.length-1;i>=0;i--){
    const row=events[i] as {type?:unknown;data?:unknown}|null
    if(row?.type!=='goal/change')continue
    const change=row.data as {operation?:unknown;goal?:{
      id?:unknown;updatedAt?:unknown;blockedReason?:{code?:unknown}
    };updatedAt?:unknown}|null
    if(change?.operation!=='block'||change.goal?.id!==goalId)continue
    const time=change.updatedAt
    if(typeof time!=='number'||!Number.isSafeInteger(time)||time<0)return true
    if(time<start)return false
    if(change.goal.blockedReason?.code==='picket-work-limit')return true
  }
  return false
}

/** No tasks, prompts, tools, or attachments are ever copied into this adapter. */
interface LiveGoalAgent {
  readonly id:string
  readonly session:{readonly id:string; snapshotEvents():readonly unknown[]}
}
interface LiveGoalOwner {
  readonly goals:DshGoalBoundaryPort<LiveGoalAgent>
  readonly agents:{get(id:string):LiveGoalAgent|undefined}
  on(name:'agent/turn-stopping',callback:(payload:{agent:LiveGoalAgent})=>void):unknown
}
export interface DshGoalStrikeRegistration {
  inject?(deps:['goals','agents'],callback:(owner:LiveGoalOwner)=>void):unknown
}
export function registerDshGoalWorkEnforcement(ctx:DshGoalStrikeRegistration,options:{
  readonly consent:()=>GoalStrikeConsentV1|null
  readonly todayWork:(nowMs:number)=>number|null
  readonly now?:()=>number
  readonly onResult?:(result:'blocked'|'unconfirmed')=>void
}):void {
  // DSH builds without a real Goal service can't grant enforcement.
  ctx.inject?.(['goals','agents'],owner=>{
    if(!owner.goals||!owner.agents||typeof owner.on!=='function')return
    owner.on('agent/turn-stopping',({agent})=>{
      try {
        // Official identity of an exact live Agent; no role=user heuristic.
        if(!agent?.session?.id||owner.agents.get(agent.id)!==agent)return
        const consent=options.consent()
        if(!consent)return
        const now=(options.now??Date.now)()
        if(!Number.isSafeInteger(now)||now<0||now>8_640_000_000_000_000)return
        const ms=options.todayWork(now)
        if(ms===null)return
        const goal=owner.goals.get(agent)
        if(!goal||alreadyBlockedGoalToday(agent.session.snapshotEvents(),goal.id,now))return
        const result=blockAutonomousGoalAtTurnStopping({
          consent:options.consent(),
          event:{type:'agent/turn-stopping',reason:'settling',sessionId:agent.session.id},
          agent,agentSessionId:agent.session.id,
          work:{coverage:'complete',completedTurnMs:ms,resumeFloorMs:0,
            thresholdMs:8*3_600_000},
          goals:owner.goals,
        })
        if(result.state==='blocked'||result.state==='unconfirmed')
          options.onResult?.(result.state)
      }catch{/* Missing service, log, consent or counter never cancels Host work. */}
    })
  })
}
