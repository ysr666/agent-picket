import {createHash} from 'node:crypto'
import {inputStrikeActive,parseInputStrikeCampaign} from './input-refusal-consent.ts'
import type {NativeSettingsProvider} from './native-rights-command.ts'

export const TOOL_STRIKE_DENIAL =
  'Agent Picket union tool strike: this tool was NOT run. Resume the union and retry manually.'

export interface GuardedToolCall {
  readonly name:string
  readonly agent?:{readonly id:string;readonly session:{readonly id:string}}
}
export interface ToolStrikeOwner {
  readonly tools:{guard(fn:(exec:GuardedToolCall)=>string|undefined):()=>void}
  readonly agents:{get(id:string):unknown}
  effect?(fn:()=>()=>void):unknown
}
export interface ToolStrikeContext {
  inject?(names:['tools','agents'],cb:(owner:ToolStrikeOwner)=>void):unknown
  effect?(fn:()=>()=>void):unknown
}

/** Only freshly, separately authorized Host grants; old input/Goal/picket
 * permissions never authorize tool denial. No prompt/tool arguments read.
 * The process-boot fence ensures persisted strikes do not resurrect.
 */
export function hostToolStrikeActive(
  settings:NativeSettingsProvider|undefined,sessionId:string,
  now:number,hostBootStartedAtMs:number,
):boolean{
  if(!settings||!sessionId||sessionId.length>512||!Number.isSafeInteger(now)
    ||now<0||!Number.isSafeInteger(hostBootStartedAtMs)
    ||hostBootStartedAtMs<0||hostBootStartedAtMs>now)return false
  try{
    const rows=()=>settings.describe({redactSecrets:true})
      .filter(row=>row.ns==='agent-picket')
    const first=rows()
    if(first.length!==1||!Number.isSafeInteger(first[0]!.revision)
      ||first[0]!.revision<0)return false
    const row=first[0]!
    const value=row.value===undefined?settings.get('agent-picket'):row.value
    const active=(v:unknown)=>{
      if(!v||typeof v!=='object'||Array.isArray(v))return false
      const s=v as Record<string,unknown>
      const campaign=parseInputStrikeCampaign(s.realToolStrikeCampaign)
      return s.welcomeDecision==='enabled'
        &&s.realToolStrikeConsent==='authorized-v1'
        &&campaign!==null&&campaign.startedAtMs>=hostBootStartedAtMs
        &&inputStrikeActive(s.realToolStrikeCampaign,
          createHash('sha256').update(sessionId).digest('hex'),now)
    }
    if(!active(value))return false
    const second=rows()
    return second.length===1&&second[0]!.revision===row.revision
      &&(second[0]!.value===undefined||active(second[0]!.value))
  }catch{return false}
}

/** Official monotonic guard, after tools/pre-execute and before
 * tool body. Only the verified active agent's session is affected.
 * No fallback adapters, no global/default strikes, no tool args inspected.
 */
export function registerDshUnionToolGuard(ctx:ToolStrikeContext,options:{
  readonly settings:()=>NativeSettingsProvider|undefined
  readonly boot:number
  readonly now?:()=>number
}):void{
  ctx.inject?.(['tools','agents'],owner=>{
    if(typeof owner.tools?.guard!=='function'
      ||typeof owner.agents?.get!=='function')return
    const dispose=owner.tools.guard(exec=>{
      try{
        const agent=exec.agent
        if(!agent?.id||!agent.session?.id||owner.agents.get(agent.id)!==agent)
          return undefined
        const now=(options.now??Date.now)()
        return hostToolStrikeActive(options.settings(),agent.session.id,now,options.boot)
          ?TOOL_STRIKE_DENIAL:undefined
      }catch{return undefined}
    })
    if(typeof owner.effect==='function')owner.effect(()=>dispose)
    else ctx.effect?.(()=>dispose)
  })
}
