/**
 * EXPERIMENT ONLY, excluded from npm. A separately committed high-water mark
 * detects accidental or unauthorized-after-the-fact WAL suffix disappearance.
 * This is NOT an adversary-resistant source of truth: a privileged actor who
 * replaces BOTH v1 files and the mark can still roll back everything.
 */
import {replayVerifiedV1SnapshotWal} from './windows-wal-replay.ts'

export type ExperimentalWalAnchor=Readonly<{
 version:1;sequence:number;toolCalls:number;tipMac:string|null
}>
const safe=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0
const digest=/^[A-Za-z0-9_-]{43}$/
export function validExperimentalWalAnchor(value:unknown):value is ExperimentalWalAnchor{
 if(value===null||typeof value!=='object'||Array.isArray(value))return false
 const a=value as Record<string,unknown>
 return Object.keys(a).sort().join('|')==='sequence|tipMac|toolCalls|version'
  &&a.version===1&&safe(a.sequence)&&safe(a.toolCalls)
  &&(a.sequence===0?a.tipMac===null:typeof a.tipMac==='string'&&digest.test(a.tipMac))
}
/** Compare an already-durable independent mark with BOTH unmodified v1 files. */
export function auditExperimentalWalAnchor(
 snapshotText:string,wal:Buffer,anchorText:string,
):'verified'|'unconfirmed'{
 try{
  if(typeof anchorText!=='string'||Buffer.byteLength(anchorText)>512)return 'unconfirmed'
  const anchor:unknown=JSON.parse(anchorText)
  if(!validExperimentalWalAnchor(anchor))return 'unconfirmed'
  const replay=replayVerifiedV1SnapshotWal(snapshotText,wal)
  if(replay.status!=='verified'||replay.tornTail
    ||replay.sequence!==anchor.sequence||replay.totals?.toolCalls!==anchor.toolCalls)
   return 'unconfirmed'
  const snapshot:unknown=JSON.parse(snapshotText)
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))return 'unconfirmed'
  const snapshotSequence=(snapshot as Record<string,unknown>).sequence??0
  if(!safe(snapshotSequence)||snapshotSequence>anchor.sequence)return 'unconfirmed'
  if(snapshotSequence===anchor.sequence)return 'verified'
  // A not-yet-checkpointed mark requires the last WAL row to match the
  // independently fsynced marker. No row, replacement, or torn tail qualifies.
  const lines=wal.toString('utf8').split('\n').filter(Boolean)
  const last=JSON.parse(lines[lines.length-1]??'null') as {seq?:unknown;mac?:unknown}|null
  if(last?.seq!==anchor.sequence||last.mac!==anchor.tipMac)return 'unconfirmed'
  return 'verified'
 }catch{return 'unconfirmed'}
}
