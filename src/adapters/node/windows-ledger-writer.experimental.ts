/**
 * ISOLATED RESEARCH ONLY; excluded from npm. Not a production DurableStats.
 * Narrow v1-compatible NTFS WAL writer: no dead-owner takeover, no checkpoint,
 * no torn-tail repair; fails closed after 255 committed rows.
 */
import {createHmac,randomBytes} from 'node:crypto'
import {closeSync,existsSync,fsyncSync,openSync,
 readFileSync,renameSync,unlinkSync,writeFileSync,writeSync} from 'node:fs'
import {hostname} from 'node:os'
import {isAbsolute,join} from 'node:path'
import {createProtectedNtfsDirectory,verifyPrivateNtfsAcl} from './windows-private-acl.ts'
import {inspectPrivateNtfsLedgerLayout} from './windows-ledger-layout.ts'
import {replayVerifiedV1SnapshotWal} from './windows-wal-replay.ts'

const snapshotName='aggregate.v1.json'
const journalName='aggregate.v1.journal'
const lockName='aggregate.v1.lock'
const totalsZero={turnStarts:0,turnEnds:0,toolCalls:0,toolResults:0,
 completedTurnMs:0,checked:0,safe:0,review:0,targeted:0}
const FP=/^[A-Za-z0-9_-]{43}$/
const MAX_RECORDS=255
const MAX_BYTES=4_000_000

export class ExperimentalNtfsWalWriter {
 readonly #directory:string
 readonly #token=randomBytes(16).toString('hex')
 #secret=''
 #sequence=0
 #toolCalls=0
 #seen=new Set<string>()
 #fd:number|undefined
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
   const fd=openSync(lock,'wx',0o600)
   try{
    writeFileSync(fd,JSON.stringify({version:1,pid:process.pid,host:hostname(),token:this.#token}))
    fsyncSync(fd)
   }finally{closeSync(fd)}
   this.#owned=true
   if(!verifyPrivateNtfsAcl(lock,'file'))throw Error('Lock ACL unverified')
   this.#initialize(existing)
   const journal=join(directory,journalName)
   this.#fd=openSync(journal,'a',0o600)
   if(!verifyPrivateNtfsAcl(journal,'file'))throw Error('Journal ACL unverified')
   if(!inspectPrivateNtfsLedgerLayout(directory).private)throw Error('NTFS layout changed during writer initialization')
  }catch(error){this.close();throw error}
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
   return
  }
  const snapText=readFileSync(snap,'utf8')
  const raw=JSON.parse(snapText) as {secret?:string;seen?:string[];sequence?:number}
  const bytes=existsSync(wal)?readFileSync(wal):Buffer.alloc(0)
  if(bytes.length>MAX_BYTES)throw Error('Oversized WAL')
  const recovered=replayVerifiedV1SnapshotWal(snapText,bytes)
  if(recovered.status!=='verified'||recovered.tornTail)
   throw Error('WAL requires forensic review before writing')
  if((recovered.sequence??0)>MAX_RECORDS)throw Error('Experimental WAL limit reached')
  this.#secret=raw.secret!
  this.#sequence=recovered.sequence!
  this.#toolCalls=recovered.totals!.toolCalls
  for(const fp of raw.seen??[])this.#seen.add(fp)
  for(const line of bytes.toString('utf8').split('\n').filter(Boolean)){
   const v=JSON.parse(line) as {fp:string}
   if(FP.test(v.fp))this.#seen.add(v.fp)
  }
 }
 get snapshot():Readonly<{sequence:number;toolCalls:number}>{
  return {sequence:this.#sequence,toolCalls:this.#toolCalls}
 }
 recordSyntheticToolCall(eventId:string,agentId:string,sessionId:string,atMs:number):boolean{
  if(this.#closed||this.#faulted||this.#fd===undefined)throw Error('Writer is not usable')
  if([eventId,agentId,sessionId].some(v=>typeof v!=='string'||!v||v.length>128)
    ||!Number.isSafeInteger(atMs)||atMs<0||atMs>8_640_000_000_000_000)
   throw Error('Invalid synthetic event')
  const fp=createHmac('sha256',Buffer.from(this.#secret,'hex'))
   .update(JSON.stringify(['work',agentId,sessionId,eventId])).digest('base64url')
  if(this.#seen.has(fp))return false
  if(this.#sequence>=MAX_RECORDS)throw Error('Experimental WAL checkpoint not supported')
  const lock=join(this.#directory,lockName)
  try{
   if(!inspectPrivateNtfsLedgerLayout(this.#directory).private
      ||JSON.parse(readFileSync(lock,'utf8')).token!==this.#token)
    throw Error('NTFS lock or ACL changed')
   const seq=this.#sequence+1,changes={toolCalls:1}
   const mac=createHmac('sha256',Buffer.from(this.#secret,'hex'))
    .update(JSON.stringify([seq,fp,changes,atMs])).digest('base64url')
   const bytes=Buffer.from(JSON.stringify({seq,fp,changes,atMs,mac})+'\n')
   if(writeSync(this.#fd,bytes)!==bytes.length)throw Error('Short WAL write')
   fsyncSync(this.#fd)
   this.#sequence=seq;this.#toolCalls++;this.#seen.add(fp)
   return true
  }catch(error){this.#faulted=true;throw error}
 }
 close():void{
  if(this.#closed)return
  this.#closed=true
  try{if(this.#fd!==undefined)closeSync(this.#fd)}catch{/* fail closed */}
  this.#fd=undefined
  if(!this.#owned)return
  try{
   const lock=join(this.#directory,lockName)
   if(verifyPrivateNtfsAcl(lock,'file')&&
      JSON.parse(readFileSync(lock,'utf8')).token===this.#token)
    unlinkSync(lock)
  }catch{/* leave uncertain lock for manual handling */}
  this.#owned=false
 }
}
