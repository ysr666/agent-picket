/**
 * Fictional picket-only sidecar, outside the historical unionLedger protocol.
 * Older Agent Picket builds still understand every unionLedger byte.
 * No transcript text, file paths, original Session IDs or Host enforcement.
 */
export type PicketActionKind = 'picket-raised' | 'picket-lowered'
export interface PicketEvent {
  readonly id: number
  readonly kind: PicketActionKind
}
export interface PicketActionState {
  readonly active: boolean
  readonly history: readonly PicketEvent[]
}
export interface PicketLedgerV1 {
  readonly schemaVersion: 1
  readonly sessions: Readonly<Record<string, PicketActionState>>
  readonly writeToken?: string
}
export const MAX_PICKET_LEDGER_BYTES = 8_000
export const MAX_PICKET_SESSIONS = 8
export const MAX_PICKET_HISTORY = 12
const PICKET_EMPTY: PicketLedgerV1 = {schemaVersion:1,sessions:{}}
const picketValidId=(v:unknown):v is number=>typeof v==='number'
  &&Number.isSafeInteger(v)&&v>=0
const picketHasExactly=(v:unknown,fields:readonly string[])=>v!==null
  &&typeof v==='object'&&!Array.isArray(v)
  &&Object.keys(v).length===fields.length
  &&fields.every(k=>Object.hasOwn(v,k))
export function parsePicketLedger(value:unknown):PicketLedgerV1|null {
  if(value==='')return PICKET_EMPTY
  if(typeof value!=='string'||value.length>MAX_PICKET_LEDGER_BYTES)return null
  let raw:unknown
  try{raw=JSON.parse(value)}catch{return null}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
  const candidate=raw as Partial<PicketLedgerV1>
  if(!picketHasExactly(candidate,candidate.writeToken===undefined
    ?['schemaVersion','sessions']:['schemaVersion','sessions','writeToken'])
    ||candidate.schemaVersion!==1||!candidate.sessions
    ||typeof candidate.sessions!=='object'||Array.isArray(candidate.sessions)
    ||(candidate.writeToken!==undefined
      &&(typeof candidate.writeToken!=='string'||!/^[a-f0-9]{32}$/.test(candidate.writeToken)))
  )return null
  const entries=Object.entries(candidate.sessions)
  if(entries.length>MAX_PICKET_SESSIONS)return null
  const sessions:Record<string,PicketActionState>=Object.create(null)
  for(const [key,state] of entries){
    if(!/^[a-f0-9]{64}$/.test(key)
      ||!picketHasExactly(state,['active','history']))return null
    const s=state as unknown as PicketActionState
    if(typeof s.active!=='boolean'||!Array.isArray(s.history)
      ||s.history.length>MAX_PICKET_HISTORY
      ||!s.history.every(event=>picketHasExactly(event,['id','kind'])
        &&picketValidId(event.id)
        &&(event.kind==='picket-raised'||event.kind==='picket-lowered'))
      ||s.active!==(s.history.at(-1)?.kind==='picket-raised'))return null
    if(s.history.some((event,i)=> event.id<1 || (i>0 && (
      event.id!==s.history[i-1]!.id+1 || event.kind===s.history[i-1]!.kind))))return null
    sessions[key]={active:s.active,history:s.history.map(e=>({id:e.id,kind:e.kind}))}
  }
  return {schemaVersion:1,sessions,...candidate.writeToken===undefined?{}:{writeToken:candidate.writeToken}}
}
