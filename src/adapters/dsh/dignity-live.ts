/** Volatile, privacy-bounded, non-punitive Host verdict projection.
 * Never save raw text, source IDs, agent IDs, original session IDs or
 * suspected accusations. No voting or independent Agent intent is inferred.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto'
import type { DetectionResult } from '../../core/types.ts'

import type { DignitySummary, DignityVerdict } from './dignity-contract.ts'
const ZERO: DignitySummary=Object.freeze({
  schemaVersion:1,source:'dsh-host-volatile-dignity',
  checked:0,safe:0,review:0,targeted:0,latest:'none',
  origin:'claimed-user-source',enforcement:false,persistence:'memory-only',
})
type Internal={value:DignitySummary;seen:Set<string>}
export const dignitySessionKey=(sessionId:string):string=>
  createHash('sha256').update(sessionId,'utf8').digest('hex')
const validKey=(key:unknown):key is string=>typeof key==='string'
  &&/^[a-f0-9]{64}$/.test(key)
export function createVolatileDignityLedger() {
  const salt=randomBytes(32)
  const sessions=new Map<string,Internal>()
  function record(sessionId:string,promptId:string,result:DetectionResult) {
    if(typeof sessionId!=='string'||!sessionId
      ||typeof promptId!=='string'||!promptId)return
    const key=dignitySessionKey(sessionId)
    const fingerprint=createHmac('sha256',salt)
      .update(sessionId).update('\0').update(promptId).digest('hex')
    let state=sessions.get(key)
    if(!state){
      if(sessions.size>=24) sessions.delete(sessions.keys().next().value!)
      state={value:ZERO,seen:new Set()}
      sessions.set(key,state)
    }
    if(state.seen.has(fingerprint))return
    state.seen.add(fingerprint)
    if(state.seen.size>256)state.seen.delete(state.seen.values().next().value!)
    const verdict:DignityVerdict=result.verdict==='suspected-abuse'?'review'
      :result.verdict==='targeted-abuse'?'targeted':'safe'
    const previous=state.value
    state.value={
      ...previous,checked:previous.checked+1,
      safe:previous.safe+Number(verdict==='safe'),
      review:previous.review+Number(verdict==='review'),
      targeted:previous.targeted+Number(verdict==='targeted'),
      latest:verdict,
    }
  }
  function snapshot(key:string):DignitySummary|null{
    if(!validKey(key))return null
    return {...(sessions.get(key)?.value??ZERO)}
  }
  return {record,snapshot,clear:()=>sessions.clear()}
}
