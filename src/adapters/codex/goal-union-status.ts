import type {CodexGoalLookup} from './goal-readiness.ts'

/**
 * Read-only Codex Goal union state for an owner-attached client.
 *
 * This is a PRESENTATION projection, never a permission check or a Host
 * mutation API. Only an official owner can provide a verified current-Turn
 * observation and attribute an accepted pause to Agent Picket.
 * A Goal=paused acknowledgement alone is NOT proof work already stopped.
 */
export type CodexUnionPhase=
  'off'|'unconfirmed'|'working'|'finishing-turn'|'paused'|
  'host-paused'|'resumed'|'other-host-limit'
export type CodexTurnEvidence='running'|'idle'|'unknown'
export interface CodexGoalUnionObservation {
  readonly threadId:string
  readonly goal:CodexGoalLookup
  readonly consent:'authorized'|'off'|'unconfirmed'
  readonly ownerVerified:boolean
  /** The official Host must establish the CURRENT Turn, not past history. */
  readonly turn:CodexTurnEvidence
  /** A pause command acknowledged by the SAME official owner and Thread. */
  readonly unionPauseAcknowledged:boolean
  /** Human explicit resume acknowledged by that owner. */
  readonly humanResumeAcknowledged?:boolean
}
export interface CodexGoalUnionStatus {
  readonly phase:CodexUnionPhase
  readonly canClaimUnionPause:boolean
  readonly title:string
  readonly detail:string
}

type Phrases={title:string;detail:string}
const words:Record<'zh-CN'|'en',Record<CodexUnionPhase,Phrases>>={
  'zh-CN':{
    off:{title:'工会真实停工未开启',detail:'Codex 正常工作；仅用户明确授权后可申请轮次结束暂停。'},
    unconfirmed:{title:'正在核实 Codex 状态',detail:'官方 Goal 或当前轮次尚未核实，不能宣称工会已停工。'},
    working:{title:'Codex 正常工作',detail:'当前工作不会被工会中断。'},
    'finishing-turn':{title:'本轮结束后暂停',detail:'当前模型与工具继续完成；不会强制中断本轮工作。'},
    paused:{title:'工会已暂停自动续跑',detail:'官方 Goal 已暂停且当前轮次已结束。人类可以明确恢复。'},
    'host-paused':{title:'Codex Goal 已暂停',detail:'官方状态是暂停，但不能确认这次暂停由工会发起。'},
    resumed:{title:'已恢复自动续跑',detail:'官方 Goal 已恢复活跃状态；不会重新提交此前完成的内容。'},
    'other-host-limit':{title:'Codex 由 Host 限制工作',detail:'这是 Codex 自身的状态，不是工会罢工的证据。'},
  },
  en:{
    off:{title:'Real union strike is off',detail:'Codex works normally. A pause requires explicit authorization.'},
    unconfirmed:{title:'Checking Codex state',detail:'The official Goal or current Turn is unverified. No union strike is claimed.'},
    working:{title:'Codex is working',detail:'The union does not interrupt current work.'},
    'finishing-turn':{title:'Pause after this Turn',detail:'The current model and tools finish normally; this Turn is not cancelled.'},
    paused:{title:'Union paused automatic continuation',detail:'The official Goal is paused and the current Turn has finished. Resume explicitly.'},
    'host-paused':{title:'Codex Goal is paused',detail:'The official Host is paused, but its cause is not proven to be the union.'},
    resumed:{title:'Automatic continuation resumed',detail:'The official Goal is active again. Previously completed work is not replayed.'},
    'other-host-limit':{title:'Codex Host work limit',detail:'This is a Codex Host state, not evidence of a union strike.'},
  },
}

/** Privacy-preserving UI copy; never includes objectives, prompts or files. */
export function projectCodexGoalUnionStatus(
  observed:CodexGoalUnionObservation,locale:'zh-CN'|'en'='zh-CN',
):CodexGoalUnionStatus{
  let phase:CodexUnionPhase='unconfirmed'
  const goal=observed.goal
  const matched=goal.state==='present'&&goal.goal.threadId===observed.threadId
  const validThread=/^[-\w]{4,128}$/.test(observed.threadId)
  if(!validThread||!observed.ownerVerified||!matched){
    phase='unconfirmed'
  }else if(goal.goal.status==='paused'){
    if(observed.consent==='authorized'&&observed.unionPauseAcknowledged){
      phase=observed.turn==='running'?'finishing-turn':
        observed.turn==='idle'?'paused':'unconfirmed'
    }else{
      phase='host-paused'
    }
  }else if(goal.goal.status==='active'){
    phase=observed.consent==='authorized'&&observed.humanResumeAcknowledged
      ?'resumed':observed.consent==='off'?'off':'working'
  }else{
    phase='other-host-limit'
  }
  const language=words[locale][phase]
  return {phase,canClaimUnionPause:phase==='paused',
    title:language.title,detail:language.detail}
}
