import {encodeInputStrikeCampaign,inputStrikeActive,
  parseInputStrikeCampaign} from './input-refusal-consent.ts'
import type {DshSettingsScope} from './client-rights-scope.ts'

export const TOOL_STRIKE_DISCLOSURE='tool-strike-current-session-v1' as const
export interface ToolStrikeSection{
  readonly welcomeDecision:'unseen'|'enabled'|'not-now'
  readonly realToolStrikeConsent?:'off'|'authorized-v1'
  readonly realToolStrikeCampaign?:string
}

/** The SAME official Host Settings writer as union membership. No client cache.
 * Explicit ONE-TIME tool-only grant, then separately Start/Resume one Session.
 */
export function createDshToolStrikeControl(
  scope:DshSettingsScope<ToolStrikeSection>,
  sessionKey:()=>string|null,
  now:()=>number=Date.now,
){
  const snapshot=()=>{
    try{
      const s=scope.getSnapshot()
      const valid=s.status==='ready'&&s.mode==='host'&&!!s.value
        &&['off','authorized-v1'].includes(s.value.realToolStrikeConsent??'off')
        &&(s.value.realToolStrikeCampaign===''||s.value.realToolStrikeCampaign===undefined
          ||parseInputStrikeCampaign(s.value.realToolStrikeCampaign)!==null)
      const authorized=valid&&s.value!.welcomeDecision==='enabled'
        &&s.value!.realToolStrikeConsent==='authorized-v1'
      return {available:valid,writable:valid&&s.writable,authorized,
        armed:authorized&&inputStrikeActive(s.value!.realToolStrikeCampaign,
          sessionKey(),now()),
        hasCampaign:valid&&!!s.value!.realToolStrikeCampaign}
    }catch{return {available:false,writable:false,authorized:false,
      armed:false,hasCampaign:false}}
  }
  const verify=(before:ReturnType<typeof scope.getSnapshot>)=>{
    const next=scope.getSnapshot()
    if(before.status!=='ready'||before.mode!=='host'||!before.writable
      ||before.revision===undefined||!before.value||next.revision!==before.revision
      ||next.value?.welcomeDecision!==before.value.welcomeDecision
      ||next.value?.realToolStrikeConsent!==before.value.realToolStrikeConsent
      ||next.value?.realToolStrikeCampaign!==before.value.realToolStrikeCampaign)
      throw Error('Host tool consent or Session state changed')
  }
  return {snapshot,subscribe:(f:()=>void)=>scope.subscribe(f),
    async choose(next:'off'|'authorized-v1',
      disclosure?:typeof TOOL_STRIKE_DISCLOSURE){
      const before=scope.getSnapshot()
      verify(before)
      if(next==='authorized-v1'&&(disclosure!==TOOL_STRIKE_DISCLOSURE
        ||before.value!.welcomeDecision!=='enabled'))
        throw Error('Explicit tool strike disclosure not acknowledged')
      const old=before.value!.realToolStrikeCampaign??''
      if(typeof scope.setMany==='function'){
        await scope.setMany({realToolStrikeConsent:next,realToolStrikeCampaign:''})
      }else{
        // Disarm BEFORE changing permission, never auto-resume a campaign.
        if(old){
          await scope.set('realToolStrikeCampaign','')
          if(scope.getSnapshot().value?.realToolStrikeCampaign!=='')
            throw Error('Host could not disarm existing tool campaign')
        }
        await scope.set('realToolStrikeConsent',next)
      }
      const after=scope.getSnapshot()
      if(after.status!=='ready'||after.mode!=='host'
        ||after.value?.realToolStrikeConsent!==next
        ||(after.value?.realToolStrikeCampaign??'')!==''
        ||(next!=='off'&&!snapshot().authorized))
        throw Error('Host did not confirm tool permission')
      return snapshot()
    },
    async setArmed(armed:boolean){
      const before=scope.getSnapshot()
      verify(before)
      const key=sessionKey(),old=before.value!.realToolStrikeCampaign??''
      if(armed&&(!key||before.value!.welcomeDecision!=='enabled'
        ||before.value!.realToolStrikeConsent!=='authorized-v1'))
        throw Error('Active exact Session and independent tool consent required')
      if(!armed&&!old)return snapshot()
      if(armed&&inputStrikeActive(old,key,now()))return snapshot()
      verify(before)
      if(armed&&sessionKey()!==key)throw Error('Session changed')
      const changed=armed?encodeInputStrikeCampaign(key!,now()):''
      await scope.set('realToolStrikeCampaign',changed)
      const after=scope.getSnapshot()
      if(after.status!=='ready'||after.mode!=='host'
        ||after.value?.realToolStrikeCampaign!==changed
        ||(armed&&(!snapshot().armed||sessionKey()!==key))
        ||(!armed&&snapshot().hasCampaign))
        throw Error('Host did not confirm tool strike change')
      return snapshot()
    }}
}
