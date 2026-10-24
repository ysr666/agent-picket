/** Metadata-only protocol. No prompt text, attachments, raw Session IDs or
 * rejected message IDs are transferred to or stored by Agent Picket. */
export const REFUSAL_NOTICE_FETCH_PATH='/api/agent-picket/refusal-notice/v1'
export interface RefusalNoticeReceipt {
  readonly schemaVersion:1
  readonly source:'dsh-host-picket-refusal-v1'
  readonly turn:number
  readonly occurredAtMs:number
  readonly outcome:'discard-manual-resend'
  readonly containsInput:false
  readonly automaticReplay:false
}
export const parseRefusalNotice=(raw:unknown):RefusalNoticeReceipt|null=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
  const v=raw as Record<string,unknown>
  const fields=['schemaVersion','source','turn','occurredAtMs',
    'outcome','containsInput','automaticReplay']
  if(Object.keys(v).length!==fields.length||!fields.every(k=>Object.hasOwn(v,k))
    ||v.schemaVersion!==1||v.source!=='dsh-host-picket-refusal-v1'
    ||!Number.isSafeInteger(v.turn)||(v.turn as number)<1
    ||!Number.isSafeInteger(v.occurredAtMs)||(v.occurredAtMs as number)<0
    ||v.outcome!=='discard-manual-resend'||v.containsInput!==false
    ||v.automaticReplay!==false)return null
  return v as unknown as RefusalNoticeReceipt
}
export interface RefusalEventWindow {
  readonly hasMore:boolean
  readonly entries:readonly {readonly type?:unknown;readonly event?:{
    readonly type?:unknown;readonly seq?:unknown;readonly data?:unknown
  }}[]
}
/** An unrelated blocked event cannot be attributed to Picket merely because
 * its public reason.kind is `blocked`. Require a matching Host Picket receipt,
 * one real turn/start and turn/end, and NO model/tool step for that turn.
 *
 * Some official Host event varieties can omit data.turn. Once the full ordered
 * Session window proves a target Turn's start/end boundaries, ANY potentially
 * model/tool-executing event inside those boundaries is counter-evidence,
 * even if the event omitted (or mislabeled) its Turn number. Fail closed:
 * missing attribution cannot become a claim that no work happened.
 */
export function matchRefusalToOfficialTurn(window:RefusalEventWindow|undefined,
  receipt:RefusalNoticeReceipt|null):boolean{
  if(!window||window.hasMore||!receipt)return false
  const records:{type:string;seq:number;turn:unknown}[]=[]
  let starts=0,ends=0,startSeq=-1,endSeq=-1,previousSeq=-1
  for(const entry of window.entries){
    if(entry.type!=='event')continue
    const e=entry.event
    if(!e||typeof e.type!=='string'||!Number.isSafeInteger(e.seq)
      ||(e.seq as number)<0||(e.seq as number)<=previousSeq)return false
    const seq=e.seq as number
    previousSeq=seq
    const data=e.data&&typeof e.data==='object'&&!Array.isArray(e.data)
      ?e.data as {turn?:unknown;reason?:{kind?:unknown}}:null
    records.push({type:e.type,seq,turn:data?.turn})
    if(data?.turn!==receipt.turn)continue
    if(e.type==='turn/start'){starts++;startSeq=seq}
    if(e.type==='turn/end'){
      if(data.reason?.kind!=='blocked')return false
      ends++;endSeq=seq
    }
  }
  if(starts!==1||ends!==1||startSeq>=endSeq)return false
  return !records.some(event=>{
    const inside=event.seq>startSeq&&event.seq<endSeq
    // A nested/unattributed Turn boundary also makes the interval uncertain.
    if(inside&&(event.type==='turn/start'||event.type==='turn/end'))
      return true
    const mayExecute=/^(?:step|request|assistant|tool|model)\//.test(event.type)
    return mayExecute&&(event.turn===receipt.turn||inside)
  })
}
