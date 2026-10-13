/**
 * Fail-closed *read-only* official Goal-service witness for this exact Host
 * Session. A writable agent-picket settings namespace is not evidence that
 * the Host installed the Goal runner or its recovery RPC.
 *
 * This witnesses availability of public goals/get + goals/resume, NOT general
 * safe interception, arbitrary client eligibility or future version support.
 */
export interface OfficialGoalService {
  get(sessionId:string):Promise<unknown>
  resume(sessionId:string,ref:{id:string;revision:number}):Promise<unknown>
}
export function createDshGoalServiceWitness(options:{
  currentSession:()=>string|undefined
  binding:(sessionId:string)=>unknown
  remote:()=>Partial<OfficialGoalService>|undefined
}){
  type Identity={sessionId:string;binding:unknown;remote:Partial<OfficialGoalService>}
  let verified:Identity|null=null
  let generation=0
  let pending:{id:Identity;promise:Promise<boolean>}|null=null
  const listeners=new Set<()=>void>()
  const emit=()=>{for(const listener of listeners)listener()}
  const identity=():Identity|null=>{
    try{
      const sessionId=options.currentSession()
      if(!sessionId)return null
      const binding=options.binding(sessionId)
      const remote=options.remote()
      if(!binding||!remote||typeof remote.get!=='function'
        ||typeof remote.resume!=='function')return null
      return {sessionId,binding,remote}
    }catch{return null}
  }
  const same=(a:Identity|null,b:Identity|null)=>
    !!a&&!!b&&a.sessionId===b.sessionId
      &&a.binding===b.binding&&a.remote===b.remote
  const snapshot=()=>same(identity(),verified)
  function invalidate(){
    generation++
    verified=null
    pending=null
    emit()
  }
  async function qualify(fresh=false):Promise<boolean>{
    const current=identity()
    if(!current){if(verified||pending)invalidate();return false}
    if(!fresh&&same(current,verified))return true
    if(pending&&same(current,pending.id))return pending.promise
    const ticket=++generation
    verified=null
    const promise=(async()=>{
      let result:unknown
      try{result=await current.remote.get!(current.sessionId)}
      catch{return false}
      const parsed=result as {ok?:unknown;value?:unknown}|null
      const data=parsed?.value as Record<string,unknown>|undefined
      const validView=!!data&&!Array.isArray(data)
        &&typeof data.id==='string'&&data.id.length>0
        &&Number.isSafeInteger(data.revision)&&(data.revision as number)>=1
        &&typeof data.objective==='string'
        &&Number.isSafeInteger(data.roundsStarted)
        &&Number.isSafeInteger(data.maxGoalRounds)
        &&Number.isFinite(data.createdAt)&&Number.isFinite(data.updatedAt)
        &&['armed','disarmed'].includes(String(data.activation))
        &&['active','paused','blocked','complete'].includes(String(data.phase))
      const valid=parsed?.ok===true&&(parsed.value===undefined||validView)
      if(!valid||ticket!==generation||!same(current,identity()))return false
      verified=current
      emit()
      return true
    })()
    pending={id:current,promise}
    try{return await promise}
    finally{if(pending?.promise===promise)pending=null}
  }
  return {snapshot,qualify,invalidate,
    subscribe(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener)}}
  }
}
