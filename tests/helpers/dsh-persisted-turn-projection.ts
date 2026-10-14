/**
 * Read-only, source-only DSH 0.2.0-rc.2 / 0.2.1-alpha.2 feasibility proof.
 * NOT connected to Goal enforcement or packaged as a new storage backend.
 *
 * Official SessionPersistence.list -> open(id, 'read') -> handle.read.
 * Read only from each session's fork-owned suffix, never inherited history.
 * Count only durable, explicitly 'completed' turn/start...turn/end pairs.
 * No prompt contents, attachment data, or IDs leave this function.
 */
export interface PersistedWorkEvent {
  readonly seq: number
  readonly time: number
  readonly type: string
  readonly data?: unknown
}
export interface PersistedWorkHandle {
  readonly header: { readonly id: string; readonly isSeeded: boolean }
  readonly inheritedEventCount: number
  read(offset?: number, length?: number): Promise<{readonly events:readonly PersistedWorkEvent[]}>
  close(): Promise<void>
}
export interface PersistedWorkPort {
  list(): Promise<readonly {readonly header:{readonly id:string;readonly isSeeded:boolean}}[]>
  open(id:string,access:'read'):Promise<PersistedWorkHandle>
}
export interface PersistedWorkDay {
  readonly day:string
  /** Conservative sum from committed host log *prefixes*, not model compute. */
  readonly confirmedCompletedTurnMs:number
  readonly coverage:'durable-prefix'
}
export async function projectPersistedDshTurnWork(
  persistence:PersistedWorkPort,
  nowMs:number,
  limits:{readonly maxSessions?:number;readonly maxEvents?:number}={},
):Promise<PersistedWorkDay|null>{
  if(!Number.isSafeInteger(nowMs)||nowMs<0||nowMs>8_640_000_000_000_000)return null
  const maxSessions=limits.maxSessions??2000
  const maxEvents=limits.maxEvents??200_000
  if(!Number.isSafeInteger(maxSessions)||maxSessions<1||
    !Number.isSafeInteger(maxEvents)||maxEvents<1)return null
  const day=new Date(nowMs).toISOString().slice(0,10)
  let total=0,used=0
  try{
    const all=await persistence.list()
    if(!Array.isArray(all)||all.length>maxSessions)return null
    const ids=new Set<string>()
    for(const entry of all){
      const id=entry?.header?.id
      if(typeof id!=='string'||id.length===0||ids.has(id))return null
      ids.add(id)
      let handle:PersistedWorkHandle|undefined
      try{
        handle=await persistence.open(id,'read')
        if(handle.header.id!==id ||
          typeof handle.header.isSeeded!=='boolean' ||
          handle.header.isSeeded!==entry.header.isSeeded ||
          !Number.isSafeInteger(handle.inheritedEventCount) ||
          handle.inheritedEventCount<0 ||
          (!handle.header.isSeeded&&handle.inheritedEventCount!==0))return null
        // The exact fork cut is part of DSH persisted Session metadata.
        // Do not count a copied parent's Turn in its child again.
        let seq=handle.inheritedEventCount
        let open:{turn:number;time:number}|null=null
        while(true){
          if(used>=maxEvents)return null
          const batch=await handle.read(seq,Math.min(256,maxEvents-used))
          if(!Array.isArray(batch?.events))return null
          if(batch.events.length===0)break
          if(batch.events.length>Math.min(256,maxEvents-used))return null
          for(const event of batch.events){
            if(event?.seq!==seq || !Number.isSafeInteger(event.time) ||
              event.time<0||event.time>8_640_000_000_000_000)return null
            seq++;used++
            if(event.type==='turn/start'){
              const turn=(event.data as {turn?:unknown}|null)?.turn
              if(!Number.isSafeInteger(turn)||typeof turn!=='number'||turn<0||open)
                return null
              open={turn,time:event.time}
            }else if(event.type==='turn/end'){
              const row=event.data as {turn?:unknown;reason?:{kind?:unknown}}|null
              const turn=row?.turn
              const kind=row?.reason?.kind
              if(typeof turn!=='number'||!Number.isSafeInteger(turn)||
                !['completed','max-tokens','aborted','blocked','error','interrupted','forked'].includes(String(kind)))
                return null
              if(!open){
                // DSH fork-seed repair can close an inherited open turn.
                if(kind==='forked'||kind==='interrupted')continue
                return null
              }
              if(turn!==open.turn||event.time<open.time)return null
              if(kind==='completed' && new Date(event.time).toISOString().slice(0,10)===day){
                const duration=event.time-open.time
                if(!Number.isSafeInteger(duration)||!Number.isSafeInteger(total+duration))return null
                total+=duration
              }
              open=null
            }
          }
        }
        // An incomplete turn is NOT counted as completed; an unflushed live
        // turn can remain open at agent/turn-stopping (which runs PRE turn/end).
      }finally{await handle?.close()}
    }
    return {day,confirmedCompletedTurnMs:total,coverage:'durable-prefix'}
  }catch{return null}
}
