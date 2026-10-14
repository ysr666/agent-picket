/**
 * Experimental DSH official persisted Turn source for one autonomously queued
 * Goal round. Disabled by default; no local work database, prompt copies or
 * Host internals. NEVER label list() as a complete Session census.
 */
import { alreadyBlockedGoalToday } from './goal-work-enforcement.ts'
import type { GoalStrikeConsentV1, HostGoalSnapshot } from './goal-boundary-strike.ts'

export interface OfficialPersistedEvent {
  readonly seq:number
  readonly time:number
  readonly type:string
  readonly data?:unknown
}
export interface OfficialPersistedHandle {
  readonly header:{readonly id:string;readonly isSeeded:boolean}
  readonly inheritedEventCount:number
  read(offset?:number,length?:number):Promise<{readonly events:readonly OfficialPersistedEvent[]}>
  close():Promise<void>
}
export interface OfficialPersistedPort {
  list():Promise<readonly {readonly header:{readonly id:string;readonly isSeeded:boolean}}[]>
  open(id:string,access:'read'):Promise<OfficialPersistedHandle>
}
export interface ConfirmedPersistedDay {
  /** Only validated, already ended and completed Turns; never model compute. */
  readonly confirmedCompletedTurnMs:number
  readonly day:string
  /** A verified LOWER BOUND; never silently promoted to complete coverage. */
  readonly coverage:'durable-prefix-lower-bound'
}
const validTime=(value:unknown,now:number):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=now
const validTurn=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>=0
const allowedReasons=new Set([
  'completed','aborted','blocked','error','max-tokens','interrupted','forked',
])

/**
 * Read only a bounded, validated suffix of each Host-visible Session.
 * A corrupt/omitted header may make this an undercount. This is NOT an
 * attestation that every Session in a profile was found. Unknown read faults
 * return null; incomplete running Turns never accrue speculative seconds.
 */
export async function inspectOfficialPersistedDay(
  storage:OfficialPersistedPort,now:number,
  limits:{readonly maxSessions?:number;readonly maxEvents?:number}={},
):Promise<ConfirmedPersistedDay|null>{
  if(!validTime(now,now)||now>8_640_000_000_000_000)return null
  const maxSessions=limits.maxSessions??2000
  const maxEvents=limits.maxEvents??200_000
  if(!Number.isSafeInteger(maxSessions)||maxSessions<1||
    !Number.isSafeInteger(maxEvents)||maxEvents<1)return null
  const day=new Date(now).toISOString().slice(0,10)
  let sum=0,used=0
  const seen=new Set<string>()
  try{
    const listed=await storage.list()
    if(!Array.isArray(listed)||listed.length===0||listed.length>maxSessions)return null
    for(const row of listed){
      const id=row?.header?.id
      if(typeof id!=='string'||!id||seen.has(id)||
        typeof row.header.isSeeded!=='boolean')return null
      seen.add(id)
      const h=await storage.open(id,'read')
      try{
        if(h.header.id!==id||h.header.isSeeded!==row.header.isSeeded||
          !Number.isSafeInteger(h.inheritedEventCount)||h.inheritedEventCount<0||
          (!h.header.isSeeded&&h.inheritedEventCount!==0))return null
        let seq=h.inheritedEventCount
        let opening:{turn:number;time:number}|null=null
        // Stable Session Turn ordinals are strictly increasing. Merely having
        // contiguous storage seq does not prevent duplicate Turn work from
        // being replayed with freshly assigned event seq numbers.
        let lastClosedTurn:number|undefined
        for(;;){
          // The +1 read detects an over-cap tail, rather than treating the
          // last admitted event as a proven complete corpus.
          const length=Math.min(256,maxEvents-used+1)
          const result=await h.read(seq,length)
          const events=result?.events
          if(!Array.isArray(events)||events.length>length)return null
          if(events.length===0)break
          if(used+events.length>maxEvents)return null
          for(const ev of events){
            if(!ev||ev.seq!==seq++||!validTime(ev.time,now))return null
            used++
            if(ev.type==='turn/start'){
              const turn=(ev.data as {turn?:unknown}|null)?.turn
              if(!validTurn(turn)||opening||
                (lastClosedTurn!==undefined&&turn<=lastClosedTurn))return null
              opening={turn,time:ev.time}
            }else if(ev.type==='turn/end'){
              const row=ev.data as {turn?:unknown;reason?:{kind?:unknown}}|null
              if(!validTurn(row?.turn)||!allowedReasons.has(String(row?.reason?.kind)))
                return null
              if(!opening||row!.turn!==opening.turn||ev.time<opening.time)return null
              if(row!.reason?.kind==='completed'&&
                new Date(ev.time).toISOString().slice(0,10)===day){
                // The release contract has NOT settled whether cross-midnight
                // work is split or assigned to the end date. Never attribute
                // yesterday's hours to today's 8h threshold and false-strike.
                // Refuse the whole projection until #77 fixes that policy.
                if(new Date(opening.time).toISOString().slice(0,10)!==day)
                  return null
                const duration=ev.time-opening.time
                if(!Number.isSafeInteger(sum+duration))return null
                sum+=duration
              }
              lastClosedTurn=opening.turn
              opening=null
            }
          }
        }
        // Opening Turn at EOF is running/crash-orphaned, not completed work.
      }finally{await h.close()}
    }
    return {confirmedCompletedTurnMs:sum,day,coverage:'durable-prefix-lower-bound'}
  }catch{return null}
}

interface AutoGoalAgent{
  readonly id:string
  readonly session:{readonly id:string;snapshotEvents():readonly unknown[]}
}
interface AutoGoalMsg{
  readonly source?:{readonly kind?:unknown;readonly round?:unknown;
    readonly goalId?:unknown;readonly revision?:unknown}
}
interface GoalOwner {
  readonly agents:{get(id:string):AutoGoalAgent|undefined}
  readonly goals:{
    get(agent:AutoGoalAgent):(HostGoalSnapshot&{readonly blockedReason?:{readonly code?:string}})|undefined
    block(agent:AutoGoalAgent,ref:{id:string;revision:number},
      reason:{code:string;message:string}):HostGoalSnapshot
  }
  readonly sessionPersistence:OfficialPersistedPort
  on(name:'agent/pre-step',callback:(payload:{
    readonly agent:AutoGoalAgent;readonly messages:readonly AutoGoalMsg[]
  },next:()=>Promise<unknown>)=>Promise<unknown>):unknown
}
export interface OfficialGoalPreviewHost{
  inject?(services:['goals','agents','sessionPersistence'],
    callback:(ctx:GoalOwner)=>void):unknown
}
const isConsent=(v:GoalStrikeConsentV1|null):boolean=>
  v?.kind==='agent-picket-real-goal-strike-v1'&&
  v.hostAuthenticated===true&&v.enabled===true

/**
 * Preview-only integration at OFFICIAL Goal pre-step. The Host round driver
 * has already awaited the previous Turn's session/flush before queueing an
 * autonomous Goal message. Every read is asynchronous, and exact Goal CAS
 * is rechecked after the read and consent revocation race.
 *
 * Reject ONLY the single auto Goal message; ordinary human/mixed messages
 * or attachments are never intercepted, copied or discarded.
 */
export function registerOfficialPersistedGoalPreview(
  ctx:OfficialGoalPreviewHost,opts:{
    readonly consent:()=>GoalStrikeConsentV1|null
    readonly now?:()=>number
  },
):void{
  ctx.inject?.(['goals','agents','sessionPersistence'],owner=>{
    if(!owner.goals||!owner.agents||!owner.sessionPersistence)return
    owner.on('agent/pre-step',async({agent,messages},next)=>{
      const message=messages.length===1?messages[0]:undefined
      const source=message?.source
      if(source?.kind!=='goal'||!validTurn(source.round)||source.round===0||
        typeof source.goalId!=='string'||!source.goalId||
        !validTurn(source.revision)||!agent?.session?.id||
        owner.agents.get(agent.id)!==agent)return next()
      if(!isConsent(opts.consent()))return next()
      const now=(opts.now??Date.now)()
      if(!validTime(now,now))return next()
      const result=await inspectOfficialPersistedDay(owner.sessionPersistence,now)
      if(result===null||result.confirmedCompletedTurnMs<8*3_600_000)return next()
      const after=(opts.now??Date.now)()
      if(!validTime(after,after)||
        new Date(after).toISOString().slice(0,10)!==result.day||
        !isConsent(opts.consent())||owner.agents.get(agent.id)!==agent)return next()
      const goal=owner.goals.get(agent)
      if(!goal||goal.id!==source.goalId||goal.revision!==source.revision||
        goal.phase!=='active'||goal.activation!=='armed'||
        !Number.isSafeInteger(goal.roundsStarted)||goal.roundsStarted<0||
        alreadyBlockedGoalToday(agent.session.snapshotEvents(),goal.id,after))
        return next()
      // Rejecting an automatic round WITHOUT a verified official Goal block
      // creates an unintended hold. A Host exception can happen either
      // before or after commit: inspect the authoritative Goal projection,
      // never fabricate a successful block or replay user submissions.
      let committed=false
      try{
        const result=owner.goals.block(agent,{id:goal.id,revision:goal.revision},{
          code:'picket-work-limit',
          message:'Agent Picket: confirmed completed Turn work limit reached. Review and explicitly resume the Goal.',
        })
        committed=result.id===goal.id&&result.phase==='blocked'&&
          result.activation==='disarmed'&&result.revision===goal.revision+1
      }catch{/* Recheck the official projection below before deciding. */}
      if(!committed){
        try{
          const projection=owner.goals.get(agent)
          committed=projection?.id===goal.id&&
            projection.phase==='blocked'&&projection.activation==='disarmed'&&
            projection.revision===goal.revision+1&&
            projection.blockedReason?.code==='picket-work-limit'
        }catch{/* No confirmed Host block. */}
      }
      return committed?{kind:'reject'}:next()
    })
  })
}
