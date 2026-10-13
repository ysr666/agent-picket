import {createHash,createHmac} from 'node:crypto'
import {existsSync,lstatSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {inspectPrivateNtfsLedgerLayout} from './windows-ledger-layout.ts'

/**
 * Test-only, strictly READ-ONLY reconstruction of the existing DurableStats v1
 * snapshot + HMAC journal format. It NEVER opens or replaces a writable file,
 * handles stale locks, or authorizes the production Windows ledger.
 */
const keys=['turnStarts','turnEnds','toolCalls','toolResults','completedTurnMs',
  'checked','safe','review','targeted'] as const
const FP=/^[A-Za-z0-9_-]{43}$/
const MAC=/^[A-Za-z0-9_-]{43}$/
const SECRET=/^[a-f0-9]{64}$/
const dayKey=/^\d{4}-\d{2}-\d{2}$/
const maxDay=366
const maxSeen=16384
const maxSnapshotBytes=2_000_000
const maxWalBytes=4_000_000
const limitTime=8_640_000_000_000_000
const unsigned=(v:unknown):v is number=>typeof v==='number'
  &&Number.isSafeInteger(v)&&v>=0
const object=(v:unknown):v is Record<string,unknown>=>
  !!v&&typeof v==='object'&&!Array.isArray(v)

type Totals=Record<(typeof keys)[number],number>
type WalRecord={seq:number;fp:string;changes:Partial<Totals>;atMs:number;mac:string}
export type WindowsWalReadback={
 readonly status:'verified'|'unconfirmed'
 readonly sequence?:number
 readonly applied?:number
 readonly tornTail?:boolean
 readonly totals?:Readonly<Totals>
 /** Research-only hash of complete canonical recovered state, never raw ids. */
 readonly stateDigest?:string
}
const unconfirmed:WindowsWalReadback={status:'unconfirmed'}
function validTotals(v:unknown):v is Totals {
 return object(v)&&keys.every(key=>unsigned(v[key]))
}
function validDay(day:string):boolean {
 if(!dayKey.test(day))return false
 const date=new Date(day+'T00:00:00.000Z')
 return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===day
}
function validChanges(v:unknown):v is Partial<Totals>{
 return object(v)&&Object.entries(v).every(([key,value])=>
   (keys as readonly string[]).includes(key)&&unsigned(value))
}
function validSnapshot(v:unknown):v is {
 secret:string;sequence?:number;totals:Totals;daily:Record<string,Totals>;seen:string[]
}{
 if(!object(v)||v.version!==1||typeof v.secret!=='string'||!SECRET.test(v.secret)
   ||(v.sequence!==undefined&&!unsigned(v.sequence))||!validTotals(v.totals)
   ||!object(v.daily)||Object.keys(v.daily).length>maxDay
   ||!Object.entries(v.daily).every(([date,counts])=>validDay(date)&&validTotals(counts))
   ||!Array.isArray(v.seen)||v.seen.length>maxSeen
   ||!v.seen.every((fp:unknown)=>typeof fp==='string'&&FP.test(fp))
   ||new Set(v.seen).size!==v.seen.length)return false
 return true
}
function mac(secret:string,v:WalRecord):string{
 return createHmac('sha256',Buffer.from(secret,'hex'))
   .update(JSON.stringify([v.seq,v.fp,v.changes,v.atMs])).digest('base64url')
}
/** Pure and OS-neutral: validate/reconstruct signed files without modifying bytes. */
export function replayVerifiedV1SnapshotWal(snapshotText:string,bytes:Buffer):WindowsWalReadback{
 try {
  if(typeof snapshotText!=='string'||Buffer.byteLength(snapshotText)>maxSnapshotBytes
    ||!Buffer.isBuffer(bytes)||bytes.length>maxWalBytes)return unconfirmed
  const parsed:unknown=JSON.parse(snapshotText)
  if(!validSnapshot(parsed))return unconfirmed
  const snapshot=parsed
  let sequence=snapshot.sequence??0
  const totals={...snapshot.totals}
  const daily=Object.fromEntries(Object.entries(snapshot.daily).map(([d,v])=>[d,{...v}])) as Record<string,Totals>
  const seen=new Set(snapshot.seen)
  const lastNewline=bytes.lastIndexOf(10)
  const tornTail=lastNewline!==bytes.length-1&&bytes.length!==0
  const complete=bytes.subarray(0,lastNewline+1).toString('utf8')
  if(Buffer.from(complete,'utf8').length!==lastNewline+1)return unconfirmed
  const rows=complete.split('\n').filter(Boolean)
  let previous=0,applied=0
  for(const line of rows){
   const value:unknown=JSON.parse(line)
   if(!object(value)||!unsigned(value.seq)||value.seq===0
     ||value.seq<=previous||typeof value.fp!=='string'||!FP.test(value.fp)
     ||!unsigned(value.atMs)||value.atMs>limitTime
     ||typeof value.mac!=='string'||!MAC.test(value.mac)
     ||!validChanges(value.changes))return unconfirmed
   const record=value as WalRecord
   previous=record.seq
   // Match production: a reset rotates the snapshot HMAC key BEFORE the
   // old journal can be replaced. Old seq<=snapshot rows must be skipped
   // without checking their MAC against the NEW secret, otherwise a safe
   // crash-mid-reset is misclassified and can resurrect erased work.
   if(record.seq<=sequence)continue
   if(mac(snapshot.secret,record)!==record.mac)return unconfirmed
   if(record.seq!==sequence+1||seen.has(record.fp))return unconfirmed
   const date=new Date(record.atMs).toISOString().slice(0,10)
   if(!validDay(date))return unconfirmed
   const base=daily[date]??Object.fromEntries(keys.map(k=>[k,0])) as Totals
   const next={...base}
   for(const key of keys){
    const amount=record.changes[key]??0
    if(!Number.isSafeInteger(totals[key]+amount)
      ||!Number.isSafeInteger(next[key]+amount))return unconfirmed
    totals[key]+=amount;next[key]+=amount
   }
   daily[date]=next
   for(const old of Object.keys(daily).sort().slice(0,Math.max(0,Object.keys(daily).length-maxDay)))
     delete daily[old]
   // DurableStats v1 stores only its latest 16,384 fingerprints; older
   // entries leave the dedup window in insertion order during WAL replay.
   seen.add(record.fp)
   if(seen.size>maxSeen)seen.delete(seen.values().next().value!)
   sequence=record.seq;applied++
  }
  // Stable across snapshot-first checkpoint, even when the old WAL remains.
  // Canonicalize object key order, date order, and bounded fingerprint order.
  // This is not a MAC or independent trust root; it only binds the witnessed
  // journal/snapshot state together against isolated edits/rollback.
  const canonTotals=(v:Totals)=>keys.map(k=>v[k])
  const stateDigest=createHash('sha256').update(JSON.stringify([
   sequence,snapshot.secret,canonTotals(totals),
   Object.keys(daily).sort().map(day=>[day,canonTotals(daily[day]!)]),
   [...seen],
  ])).digest('base64url')
  return {status:'verified',sequence,applied,tornTail,totals,stateDigest}
 }catch{return unconfirmed}
}
/** Fail-closed NTFS filesystem wrapper; no lock deletion or torn-tail truncate. */
export function inspectPrivateNtfsWalReplay(directory:string):WindowsWalReadback{
 if(process.platform!=='win32')return unconfirmed
 try{
  if(!inspectPrivateNtfsLedgerLayout(directory).private)return unconfirmed
  // A reader MUST NOT reason about a journal being changed by an active
  // writer, or about a stale/recovery lock whose ownership it cannot fence.
  if(existsSync(join(directory,'aggregate.v1.lock'))
    ||existsSync(join(directory,'aggregate.v1.recovery')))return unconfirmed
  const snap=join(directory,'aggregate.v1.json')
  const wal=join(directory,'aggregate.v1.journal')
  const snapStat=lstatSync(snap)
  if(!snapStat.isFile()||snapStat.size>maxSnapshotBytes)return unconfirmed
  if(existsSync(wal) && lstatSync(wal).size>maxWalBytes)return unconfirmed
  // An existing snapshot without its journal is not a proven empty log:
  // an attacker/crash could have removed post-checkpoint acknowledged rows.
  if(!existsSync(wal))return unconfirmed
  const journal=readFileSync(wal)
  // Layout preflight checked each DACL. TOCTOU still prevents this from being
  // authorization for mutation or production enforcement.
  return replayVerifiedV1SnapshotWal(readFileSync(snap,'utf8'),journal)
 }catch{return unconfirmed}
}
