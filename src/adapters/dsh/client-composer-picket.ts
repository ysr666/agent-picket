/**
 * User-operated LOCAL composer pause using DSH's published ComposerBlocks.
 *
 * This is an actual inert textarea in ONE client, NOT a Host admission veto:
 * direct Session.prompt(), conversation.send(), another tab and Goal execution
 * remain possible. Unlike pre-step.reject, it never accepts/claims/drops input,
 * uploads, copies, or retries a message. It is intentionally not persistent.
 */
export interface DshComposerBlock {
  readonly reason: string
}
export interface DshComposerBlocks {
  set(sessionId: string, block: DshComposerBlock | undefined): void
  storeFor(sessionId: string): { getSnapshot(): DshComposerBlock | undefined }
}
export interface LocalComposerPicketState {
  readonly state: 'unavailable'|'ready'|'active'|'occupied'
  readonly sessionId: string|null
  readonly serviceAvailable:boolean
  readonly memberActive:boolean
  readonly clientOnly: true
  readonly hostEnforcement: false
  readonly interceptsMessages: false
}
export function createDshLocalComposerPicket(options:{
  readonly currentSession:()=>string|undefined
  readonly member:()=>boolean
  readonly reason:()=>string
}) {
  let blocks: DshComposerBlocks|null=null
  let own:{sessionId:string;reason:string}|null=null
  let disposed=false
  const observers=new Set<()=>void>()
  let notifying=false
  const notify=()=>{
    if(notifying)return
    notifying=true
    try{for(const observer of observers)try{observer()}catch{}}
    finally{notifying=false}
  }
  const session=()=>{
    try{
      const id=options.currentSession()
      return typeof id==='string'&&id.length>0&&id.length<=256?id:null
    }catch{return null}
  }
  const member=()=>{try{return options.member()===true}catch{return false}}
  const read=(id:string)=>blocks?.storeFor(id).getSnapshot()
  const ours=()=>{
    if(!own||!blocks)return false
    try{return read(own.sessionId)?.reason===own.reason}
    catch{return false}
  }
  const clear=()=>{
    if(!own)return
    const previous=own
    if(!blocks)return
    try {
      // A block owned by another plugin must never be removed.
      if(read(previous.sessionId)?.reason!==previous.reason){
        own=null
        notify()
        return
      }
      blocks.set(previous.sessionId,undefined)
      // A transport/mirror may silently drop a reset. Without readback
      // keep ownership, allowing the user to retry instead of lying.
      if(read(previous.sessionId)?.reason===previous.reason)return
      own=null
      notify()
    } catch{
      // Retain the prior owner token: an uncertain reset is NOT success.
    }
  }
  const refresh=()=>{
    if(disposed)return
    if(own && (!member()||session()!==own.sessionId))clear()
    if(own && blocks)try{
      if(read(own.sessionId)?.reason!==own.reason){own=null;notify()}
    }catch{/* Unknown Host state cannot erase a recovery handle. */}
  }
  const snapshot=():LocalComposerPicketState=>{
    if(!disposed)refresh()
    const id=disposed?null:session()
    const base={sessionId:id,serviceAvailable:!!blocks,memberActive:member(),
      clientOnly:true,hostEnforcement:false,
      interceptsMessages:false} as const
    if(!id||!member()||!blocks||disposed)return {...base,state:'unavailable'}
    if(own&&own.sessionId===id&&ours())return {...base,state:'active'}
    try{
      // A different plugin's block belongs to it; Picket never overwrites it.
      if(read(id)!==undefined)return {...base,state:'occupied'}
      return {...base,state:'ready'}
    }catch{return {...base,state:'unavailable'}}
  }
  const start=():LocalComposerPicketState=>{
    const before=snapshot()
    if(before.state==='active')return before
    if(before.state!=='ready'||!before.sessionId||!blocks)return before
    let reason:string
    try {reason=options.reason()}catch{return {...before,state:'unavailable'}}
    if(!reason||reason.length>500)return {...before,state:'unavailable'}
    try{
      // Recheck: a foreign plugin may have installed a block since snapshot().
      if(read(before.sessionId)!==undefined)return {...before,state:'occupied'}
      // Claim responsibility BEFORE write: a write can commit and then throw.
      own={sessionId:before.sessionId,reason}
      blocks.set(before.sessionId,{reason})
      if(read(before.sessionId)?.reason!==reason){
        own=null
        return {...before,state:'unavailable'}
      }
      notify()
      return snapshot()
    }catch{
      clear() // Best effort; retain ownership if a committed block persists.
      return {...before,state:'unavailable'}
    }
  }
  const stop=():LocalComposerPicketState=>{
    clear()
    return snapshot()
  }
  const attach=(next:DshComposerBlocks|null)=>{
    if(disposed)return
    if(blocks===next)return
    clear()
    // Never lose a live reference to an uncleared local block.
    if(own)return
    blocks=next
    notify()
  }
  const dispose=()=>{
    if(disposed)return
    clear()
    if(own)return // Failed clear: retain controller for explicit reattempt.
    disposed=true
    blocks=null
    observers.clear()
  }
  return {
    snapshot,start,stop,refresh,attach,dispose,
    subscribe(listener:()=>void){
      if(disposed)return ()=>{}
      observers.add(listener)
      return ()=>{observers.delete(listener)}
    },
  }
}
