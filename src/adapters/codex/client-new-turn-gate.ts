/**
 * Experimental PRE-SUBMISSION UI gate for a Codex CLIENT controlled by Picket.
 *
 * This is deliberately distinct from a UserPromptSubmit hook: its callback
 * has NOT built or sent an official turn/start when we return 'held'.
 * The client retains its own untouched composer and attachments.
 *
 * NOT a Host enforcement/fencing primitive. Any uncontrolled client can send
 * turn/start directly, and the read/submit sequence is not atomic. Never use
 * this module to certify cross-client or production real-strike readiness.
 */
export interface CodexClientNewTurnHoldProof {
 readonly source:'verified-owner-control-plane'
 readonly threadId:string
 readonly ownerVerified:boolean
 readonly realStrikeOptIn:boolean
 readonly unionHoldAuthorized:boolean
 readonly unionHoldActive:boolean
 readonly turnState:'running'|'idle'|'unconfirmed'
 /** The actual client has a notice renderer BEFORE submitting any input. */
 readonly canShowPreSubmitNotice:boolean
}
export interface CodexClientNewTurnGatePort {
 /** Supplied by a genuine authenticated Host/client binding, not user text. */
 readHostProof(threadId:string):Promise<unknown>
}
export type CodexClientNewTurnResult<T> =
 |{readonly action:'held';readonly notice:'union-new-work-hold'|'union-current-turn-finishing'}
 |{readonly action:'submitted';readonly result:T}
 |{readonly action:'host-error';readonly error:unknown}

/** Fail OPEN if proof/notice is missing: no silent swallowing of input. */
export function canHoldCodexClientNewTurn(
 proof:unknown,threadId:string,
):boolean{
 if(!/^[-\w]{4,128}$/.test(threadId)
   ||!proof||typeof proof!=='object'||Array.isArray(proof))return false
 const p=proof as Partial<CodexClientNewTurnHoldProof>
 return p.source==='verified-owner-control-plane'
   &&p.threadId===threadId
   &&p.ownerVerified===true
   &&p.realStrikeOptIn===true
   &&p.unionHoldAuthorized===true
   &&p.unionHoldActive===true
   &&(p.turnState==='idle'||p.turnState==='running')
   &&p.canShowPreSubmitNotice===true
}

/**
 * Client must call this BEFORE creating official input payload.
 * Neither the proof lookup nor any HOLD path touches prompt/attachments.
 * For non-notifiable clients, unavailable Host or uncertain observation,
 * let the official client handle the user's original submission as normal.
 */
export async function gateCodexClientNewTurn<T>(
 port:CodexClientNewTurnGatePort|undefined,threadId:string,
 submitUnmodified:()=>Promise<T>,
):Promise<CodexClientNewTurnResult<T>>{
 let proof:unknown
 try{proof=await port?.readHostProof(threadId)}catch{/* Fail open. */}
 if(canHoldCodexClientNewTurn(proof,threadId))
  return {action:'held',notice:(proof as CodexClientNewTurnHoldProof).turnState==='running'
    ?'union-current-turn-finishing':'union-new-work-hold'}
 try{return {action:'submitted',result:await submitUnmodified()}}
 catch(error){return {action:'host-error',error}}
}
