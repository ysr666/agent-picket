/**
 * ISOLATED RESEARCH ONLY; excluded from npm. Not a production DurableStats.
 * Research-only v1 WAL format plus NEW-ledger sidecar anchor (no legacy migration):
 * no dead-owner takeover, explicit test-only checkpoint,
 * no torn-tail repair; checkpoint requires manual test invocation.
 */
import {createHmac,randomBytes} from 'node:crypto'
import {constants as fsConstants,closeSync,existsSync,fstatSync,fsyncSync,lstatSync,openSync,
 readFileSync,renameSync,unlinkSync,writeFileSync,writeSync} from 'node:fs'
import {hostname} from 'node:os'
import {isAbsolute,join} from 'node:path'
import {createProtectedNtfsDirectory,verifyPrivateNtfsAcl} from './windows-private-acl.ts'
import {inspectPrivateNtfsLedgerLayout} from './windows-ledger-layout.ts'
import {replayVerifiedV1SnapshotWal} from './windows-wal-replay.ts'
import {auditExperimentalWalAnchor} from './windows-wal-anchor.experimental.ts'

const snapshotName='aggregate.v1.json'
const journalName='aggregate.v1.journal'
const anchorName='aggregate.v1.anchor'
const lockName='aggregate.v1.lock'
const totalsZero={turnStarts:0,turnEnds:0,toolCalls:0,toolResults:0,
 completedTurnMs:0,checked:0,safe:0,review:0,targeted:0}
const FP=/^[A-Za-z0-9_-]{43}$/
const MAX_RECORDS_BETWEEN_CHECKPOINTS=255
const MAX_FINGERPRINTS=16384
const MAX_BYTES=4_000_000

/**
 * Research-only handle/path identity check: an ACL checked by pathname is NOT
 * proof that the file descriptor still refers to that same NTFS file.
 * A zero/unsupported file ID fails closed. This is NOT a kernel-atomic lock.
 */
export function verifyNtfsOpenFileIdentity(fd:number,path:string):boolean{
 if(process.platform!=='win32'||!isAbsolute(path)||!Number.isSafeInteger(fd)||fd<0)
  return false
 try {
  const opened=fstatSync(fd,{bigint:true})
  const named=lstatSync(path,{bigint:true})
  return opened.isFile()&&named.isFile()&&!named.isSymbolicLink()
   &&opened.nlink===1n&&named.nlink===1n
   &&opened.ino>0n&&opened.ino===named.ino
   &&opened.dev===named.dev
 }catch{return false}
}

export class ExperimentalNtfsWalWriter {
 readonly #directory:string
 readonly #token=randomBytes(16).toString('hex')
 #secret=''
 #sequence=0
 #toolCalls=0
 #totals={...totalsZero}
 #daily:Record<string,typeof totalsZero>={}
 #seen=new Set<string>()
 #sinceCheckpoint=0
 #fd:number|undefined
 #lockFd:number|undefined
 #owned=false
 #closed=false
 #faulted=false

 constructor(directory:string){
  if(process.platform!=='win32'||!isAbsolute(directory))
   throw Error('Experimental NTFS writer requires Windows and absolute directory')
  this.#directory=directory
  const existing=existsSync(directory)
  if(!existing&&!createProtectedNtfsDirectory(directory))
   throw Error('Cannot initialize private NTFS directory')
  if(!inspectPrivateNtfsLedgerLayout(directory).private)
   throw Error('NTFS ledger path must have verified private ACL')
  // Never speculate that a stale PID means it is safe to take over.
  if(existsSync(join(directory,lockName))||existsSync(join(directory,'aggregate.v1.recovery')))
   throw Error('Unverified existing lock or recovery; do not steal')
  try {
   const lock=join(directory,lockName)
   this.#lockFd=openSync(lock,'wx',0o600)
   this.#owned=true
   writeFileSync(this.#lockFd,JSON.stringify({version:1,pid:process.pid,
    host:hostname(),token:this.#token}))
   fsyncSync(this.#lockFd)
   // Keep this particular NTFS lock FILE OBJECT open until close. A copied
   // lock with the same token is NOT the lock this writer acquired.
   if(!verifyPrivateNtfsAcl(lock,'file')
     ||!verifyNtfsOpenFileIdentity(this.#lockFd,lock))
    throw Error('Lock ACL or opened file identity unverified')
   this.#initialize(existing)
   const journal=join(directory,journalName)
   // O_APPEND without O_CREAT: a missing pre-existing WAL must NEVER be
   // silently recreated (this would discard uncheckpointed acknowledged work).
   this.#fd=openSync(journal,fsConstants.O_WRONLY|fsConstants.O_APPEND)
   if(!verifyPrivateNtfsAcl(journal,'file')
    ||!verifyNtfsOpenFileIdentity(this.#fd,journal))
    throw Error('Journal ACL or file handle identity unverified')
   if(!inspectPrivateNtfsLedgerLayout(directory).private)throw Error('NTFS layout changed during writer initialization')
  }catch(error){this.close();throw error}
 }
 // TEST ONLY: a separate fsynced sequence/tool-call watermark is committed
 // AFTER WAL fsync but BEFORE an event is acknowledged. A crash in-between
 // leaves a mismatch and demands forensic recovery, never automatic rollback.
 #writeAnchor(sequence:number,toolCalls:number,tipMac:string|null):void{
  const anchor=join(this.#directory,anchorName)
  const temp=join(this.#directory,'aggregate.v1-'+randomBytes(8).toString('hex')+'.tmp')
  let fd:number|undefined
  try{
   const recovered=replayVerifiedV1SnapshotWal(
    readFileSync(join(this.#directory,snapshotName),'utf8'),
    readFileSync(join(this.#directory,journalName)))
   if(recovered.status!=='verified'||recovered.tornTail
      ||recovered.sequence!==sequence||recovered.totals?.toolCalls!==toolCalls
      ||typeof recovered.stateDigest!=='string')
    throw Error('Anchor cannot attest inconsistent recovered WAL state')
   fd=openSync(temp,'wx',0o600)
   writeFileSync(fd,JSON.stringify({version:2,sequence,toolCalls,tipMac,
    stateDigest:recovered.stateDigest}))
   fsyncSync(fd);closeSync(fd);fd=undefined
   if(!verifyPrivateNtfsAcl(temp,'file'))throw Error('Anchor temp ACL unverified')
   renameSync(temp,anchor)
   if(!verifyPrivateNtfsAcl(anchor,'file'))throw Error('Committed anchor ACL unverified')
  }finally{
   if(fd!==undefined)try{closeSync(fd)}catch{/* fail closed */}
  }
 }
 #initialize(existing:boolean):void{
  const snap=join(this.#directory,snapshotName)
  const wal=join(this.#directory,journalName)
  if(!existing||!existsSync(snap)){
   // Existing incomplete ledgers must NEVER be silently overwritten.
   if(existing||existsSync(snap)||existsSync(wal))throw Error('Incomplete ledger; refuse to replace')
   this.#secret=randomBytes(32).toString('hex')
   const content=JSON.stringify({version:1,secret:this.#secret,sequence:0,
    totals:totalsZero,daily:{},seen:[]})
   const temp=join(this.#directory,'aggregate.v1-'+randomBytes(8).toString('hex')+'.tmp')
   const fd=openSync(temp,'wx',0o600)
   try{writeFileSync(fd,content);fsyncSync(fd)}finally{closeSync(fd)}
   if(!verifyPrivateNtfsAcl(temp,'file'))throw Error('Snapshot temp ACL unverified')
   renameSync(temp,snap)
   if(!verifyPrivateNtfsAcl(snap,'file'))throw Error('Snapshot ACL unverified')
   // New ledgers get an explicitly created empty WAL. A later open may
   // append only to THIS existing private WAL; never reinitialize one.
   const journalFd=openSync(wal,'wx',0o600)
   try{fsyncSync(journalFd)}finally{closeSync(journalFd)}
   if(!verifyPrivateNtfsAcl(wal,'file'))throw Error('Initial WAL ACL unverified')
   this.#writeAnchor(0,0,null)
   return
  }
  if(!existsSync(wal))throw Error('Missing existing WAL; cannot prove no data loss')
  const anchor=join(this.#directory,anchorName)
  if(!existsSync(anchor))throw Error('Missing independent WAL anchor; no safe migration')
  const snapText=readFileSync(snap,'utf8')
  const raw=JSON.parse(snapText) as {secret?:string;seen?:string[];sequence?:number}
  const bytes=readFileSync(wal)
  if(bytes.length>MAX_BYTES)throw Error('Oversized WAL')
  const recovered=replayVerifiedV1SnapshotWal(snapText,bytes)
  if(recovered.status!=='verified'||recovered.tornTail)
   throw Error('WAL requires forensic review before writing')
  if(auditExperimentalWalAnchor(snapText,bytes,readFileSync(anchor,'utf8'))!=='verified')
   throw Error('WAL anchor mismatch; suspected committed work rollback')
  if((recovered.applied??0)>MAX_RECORDS_BETWEEN_CHECKPOINTS)throw Error('Experimental WAL limit reached')
  this.#secret=raw.secret!
  this.#sequence=recovered.sequence!
  this.#toolCalls=recovered.totals!.toolCalls
  this.#totals={...recovered.totals!}
  const snapData=JSON.parse(snapText) as {
   sequence?:number;daily?:Record<string,typeof totalsZero>;seen?:string[]
  }
  this.#daily=structuredClone(snapData.daily??{})
  const committedSequence=snapData.sequence??0
  for(const fp of raw.seen??[])this.#seen.add(fp)
  for(const line of bytes.toString('utf8').split('\n').filter(Boolean)){
   const v=JSON.parse(line) as {seq:number;fp:string;atMs:number;changes:Partial<typeof totalsZero>}
   if(v.seq<=committedSequence)continue
   // Match DurableStats v1 bounded FIFO dedup across snapshot + WAL.
   // Keep the latest 16,384 event fingerprints in original insertion order.
   if(FP.test(v.fp)){
    this.#seen.add(v.fp)
    if(this.#seen.size>MAX_FINGERPRINTS)
     this.#seen.delete(this.#seen.values().next().value!)
   }
   const day=new Date(v.atMs).toISOString().slice(0,10)
   const base=this.#daily[day]??{...totalsZero}
   const updated={...base}
   for(const key of Object.keys(totalsZero) as (keyof typeof totalsZero)[])
    updated[key]+=v.changes[key]??0
   this.#daily[day]=updated
   for(const oldDay of Object.keys(this.#daily).sort()
    .slice(0,Math.max(0,Object.keys(this.#daily).length-366)))delete this.#daily[oldDay]
   this.#sinceCheckpoint++
  }
  if(this.#sinceCheckpoint>MAX_RECORDS_BETWEEN_CHECKPOINTS)
   throw Error('Experimental WAL checkpoint required')
 }
 get snapshot():Readonly<{sequence:number;toolCalls:number}>{
  return {sequence:this.#sequence,toolCalls:this.#toolCalls}
 }
 recordSyntheticToolCall(eventId:string,agentId:string,sessionId:string,atMs:number,
  afterWalFsyncForTest?:()=>void):boolean{
  if(this.#closed||this.#faulted||this.#fd===undefined)throw Error('Writer is not usable')
  if([eventId,agentId,sessionId].some(v=>typeof v!=='string'||!v||v.length>128)
    ||!Number.isSafeInteger(atMs)||atMs<0||atMs>8_640_000_000_000_000)
   throw Error('Invalid synthetic event')
  const fp=createHmac('sha256',Buffer.from(this.#secret,'hex'))
   .update(JSON.stringify(['work',agentId,sessionId,eventId])).digest('base64url')
  if(this.#seen.has(fp))return false
  // An exhausted sequence must be rejected BEFORE any WAL bytes are written.
  // Otherwise replay rejects the unsafe JSON number and a once-valid ledger
  // becomes permanently unopenable even though the event was unacknowledged.
  if(!Number.isSafeInteger(this.#sequence+1))
   throw Error('Experimental WAL sequence exhausted')
  if(this.#sinceCheckpoint>=MAX_RECORDS_BETWEEN_CHECKPOINTS)
   throw Error('Experimental WAL checkpoint required')
  const day=new Date(atMs).toISOString().slice(0,10)
  if(!Number.isSafeInteger(this.#totals.toolCalls+1)
   ||!Number.isSafeInteger((this.#daily[day]?.toolCalls??0)+1))
   throw Error('Experimental WAL counter overflow')
  const lock=join(this.#directory,lockName)
  try{
   if(!inspectPrivateNtfsLedgerLayout(this.#directory).private
      ||this.#lockFd===undefined
      ||!verifyNtfsOpenFileIdentity(this.#lockFd,lock)
      ||JSON.parse(readFileSync(lock,'utf8')).token!==this.#token
      ||!verifyNtfsOpenFileIdentity(this.#fd,join(this.#directory,journalName)))
    throw Error('NTFS lock, ACL or opened journal identity changed')
   const seq=this.#sequence+1,changes={toolCalls:1}
   const mac=createHmac('sha256',Buffer.from(this.#secret,'hex'))
    .update(JSON.stringify([seq,fp,changes,atMs])).digest('base64url')
   const bytes=Buffer.from(JSON.stringify({seq,fp,changes,atMs,mac})+'\n')
   if(writeSync(this.#fd,bytes)!==bytes.length)throw Error('Short WAL write')
   fsyncSync(this.#fd)
   afterWalFsyncForTest?.()
   this.#writeAnchor(seq,this.#totals.toolCalls+1,mac)
   this.#sequence=seq;this.#toolCalls++;this.#totals.toolCalls++;this.#seen.add(fp)
   if(this.#seen.size>MAX_FINGERPRINTS)
    this.#seen.delete(this.#seen.values().next().value!)
   const date=day
   const base=this.#daily[date]??{...totalsZero}
   this.#daily[date]={...base,toolCalls:base.toolCalls+1}
   for(const oldDay of Object.keys(this.#daily).sort()
    .slice(0,Math.max(0,Object.keys(this.#daily).length-366)))delete this.#daily[oldDay]
   this.#sinceCheckpoint++
   return true
  }catch(error){this.#faulted=true;throw error}
 }
 /**
  * TEST ONLY. Commit an HMAC-compatible, complete v1 checkpoint; the caller
  * can inject a forced process crash immediately after durable snapshot rename.
  * NEVER used in the installed package or real Agent Picket control.
  */
 checkpointForTest(afterSnapshotCommitted?:()=>void):void {
  if(this.#closed||this.#faulted||this.#fd===undefined)
   throw Error('Writer is not usable')
  const snap=join(this.#directory,snapshotName)
  const wal=join(this.#directory,journalName)
  const temp=()=>join(this.#directory,'aggregate.v1-'+randomBytes(8).toString('hex')+'.tmp')
  let name:string|undefined, fd:number|undefined
  try {
   if(!inspectPrivateNtfsLedgerLayout(this.#directory).private
      ||this.#lockFd===undefined
      ||!verifyNtfsOpenFileIdentity(this.#lockFd,join(this.#directory,lockName))
      ||JSON.parse(readFileSync(join(this.#directory,lockName),'utf8')).token!==this.#token
      ||!verifyNtfsOpenFileIdentity(this.#fd,wal))
    throw Error('NTFS lock, ACL or journal handle identity changed')
   const data={version:1,secret:this.#secret,sequence:this.#sequence,
    totals:{...this.#totals},
    daily:structuredClone(this.#daily),seen:[...this.#seen]}
   name=temp()
   fd=openSync(name,'wx',0o600)
   writeFileSync(fd,JSON.stringify(data));fsyncSync(fd)
   closeSync(fd);fd=undefined
   if(!verifyPrivateNtfsAcl(name,'file'))throw Error('Checkpoint snapshot ACL unverified')
   renameSync(name,snap);name=undefined
   if(!verifyPrivateNtfsAcl(snap,'file'))throw Error('Committed snapshot ACL unverified')
   afterSnapshotCommitted?.()
   name=temp()
   fd=openSync(name,'wx',0o600)
   fsyncSync(fd);closeSync(fd);fd=undefined
   if(!verifyPrivateNtfsAcl(name,'file'))throw Error('Checkpoint WAL temp ACL unverified')
   const old=this.#fd
   this.#fd=undefined
   closeSync(old)
   renameSync(name,wal);name=undefined
   if(!verifyPrivateNtfsAcl(wal,'file'))throw Error('New WAL ACL unverified')
   // Also disallow creation after the checkpoint's WAL rename: a competing
   // pathname removal must fault this writer, never manufacture an empty log.
   this.#fd=openSync(wal,fsConstants.O_WRONLY|fsConstants.O_APPEND)
   if(!verifyNtfsOpenFileIdentity(this.#fd,wal))
    throw Error('Post-checkpoint WAL handle identity unverified')
   this.#sinceCheckpoint=0
  }catch(error){this.#faulted=true;throw error}
  finally{
   if(fd!==undefined)try{closeSync(fd)}catch{/* fail closed */}
   if(name!==undefined)try{unlinkSync(name)}catch{/* leave for inspection */}
  }
 }
 close():void{
  if(this.#closed)return
  this.#closed=true
  try{if(this.#fd!==undefined)closeSync(this.#fd)}catch{/* fail closed */}
  this.#fd=undefined
  const fd=this.#lockFd
  this.#lockFd=undefined
  const lock=join(this.#directory,lockName)
  // NTFS commonly disallows deleting an OPEN file, so record the acquired
  // file ID before close and compare again immediately before unlink.
  // This still has a pathname race: it is NOT an atomic owner fence.
  let acquired:import('node:fs').BigIntStats|undefined
  if(fd!==undefined){
   try{acquired=fstatSync(fd,{bigint:true})}catch{/* unknown, leave lock */}
   try{closeSync(fd)}catch{/* leave lock */}
  }
  if(!this.#owned)return
  try{
   const named=lstatSync(lock,{bigint:true})
   if(acquired?.isFile()&&acquired.ino>0n&&acquired.nlink===1n
     &&named.isFile()&&!named.isSymbolicLink()&&named.nlink===1n
     &&named.ino===acquired.ino&&named.dev===acquired.dev
     &&verifyPrivateNtfsAcl(lock,'file')
     &&JSON.parse(readFileSync(lock,'utf8')).token===this.#token)
    unlinkSync(lock)
  }catch{/* leave uncertain lock for manual handling */}
  this.#owned=false
 }
}
