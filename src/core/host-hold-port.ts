import { planPreSubmitAdmission, type PreSubmitAdmissionInput } from './pre-submit-admission.ts'

/**
 * An *official Host-owned* ticket, not a Picket copy of any prompt/attachment.
 * A Host Adapter must prove that the receipt maps to exactly one durable,
 * original submission and is restored exactly once across restart/multi-tab.
 */
export interface HostHoldTicket {
  readonly kind: 'host-owned-hold'
  readonly attemptRef: string
  readonly receiptRef: string
  readonly noticeDelivered: true
  readonly originalSubmissionRetained: true
}

/** No raw prompt, attachments, messages or user files cross this port. */
export interface QualifiedHostHoldPort {
  /** Atomic hold of the Host's *current*, already-owned pre-submit attempt. */
  holdCurrentAttempt(input: {
    readonly attemptRef: string
    readonly cause: 'work-threshold' | 'repeated-targeted-abuse'
  }): Promise<HostHoldTicket>
  /** Official Host-once resume; never manually reconstruct or replay a prompt. */
  resumeOnce(ticket: HostHoldTicket): Promise<'resumed' | 'already-resumed'>
}

export type HostHoldOutcome =
  | {readonly state: 'allow' | 'warn'; readonly reason: string}
  | {readonly state: 'held'; readonly ticket: HostHoldTicket}
  | {readonly state: 'unconfirmed'; readonly reason: 'host-error' | 'invalid-receipt'}

const ticketKeys=['kind','attemptRef','receiptRef','noticeDelivered',
  'originalSubmissionRetained'] as const
const exactTicket=(v:unknown):v is HostHoldTicket=>
  !!v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).length===ticketKeys.length&&ticketKeys.every(k=>Object.hasOwn(v,k))
const nonEmpty=(v:unknown):v is string=>typeof v==='string'
  &&v.length>0&&v.length<=256&&v.trim()===v

/**
 * Safe cross-adapter boundary: returns 'held' only after a valid Host receipt.
 * 'unconfirmed' is NEVER an instruction to resubmit. The Host must own all
 * recoverability if an I/O error occurs after a hold has already been made.
 */
export async function tryHoldWithHost(input:PreSubmitAdmissionInput & {
  /** Opaque official Host identifier, never derived from prompt contents. */
  readonly attemptRef:string
  readonly port: QualifiedHostHoldPort | null
}):Promise<HostHoldOutcome> {
  const plan=planPreSubmitAdmission(input)
  if(plan.action!=='request-host-hold'){
    return {state:plan.action,reason:plan.cause}
  }
  if(!input.port||!nonEmpty(input.attemptRef)){
    return {state:input.capabilities.warn?'warn':'allow',reason:'host-hold-unavailable'}
  }
  try{
    const result=await input.port.holdCurrentAttempt({attemptRef:input.attemptRef,
      cause:plan.cause as 'work-threshold'|'repeated-targeted-abuse'})
    if(!exactTicket(result)||result.kind!=='host-owned-hold'||result.attemptRef!==input.attemptRef
      ||!nonEmpty(result.receiptRef)||result.noticeDelivered!==true
      ||result.originalSubmissionRetained!==true){
      return {state:'unconfirmed',reason:'invalid-receipt'}
    }
    return {state:'held',ticket:result}
  }catch{
    return {state:'unconfirmed',reason:'host-error'}
  }
}

/** Caller must display the Host status. Unknown outcomes are not retried. */
export async function resumeHostHold(
  port:QualifiedHostHoldPort,
  ticket:HostHoldTicket,
):Promise<'resumed'|'already-resumed'|'unconfirmed'> {
  if(!exactTicket(ticket)||ticket.kind!=='host-owned-hold'||!nonEmpty(ticket.attemptRef)
    ||!nonEmpty(ticket.receiptRef)||ticket.noticeDelivered!==true
    ||ticket.originalSubmissionRetained!==true)return 'unconfirmed'
  try{
    const answer=await port.resumeOnce(ticket)
    return answer==='resumed'||answer==='already-resumed'?answer:'unconfirmed'
  }catch{return 'unconfirmed'}
}
