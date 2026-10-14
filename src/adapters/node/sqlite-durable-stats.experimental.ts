import {createHmac,randomBytes} from 'node:crypto'
import {DatabaseSync} from 'node:sqlite'
import {chmodSync,existsSync,lstatSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import {createProtectedNtfsDirectory,verifyPrivateNtfsAcl,verifyPrivateNtfsAclBatch} from './windows-private-acl.ts'
import type {DurableTotals} from './durable-stats.ts'
import type {DetectionResult,HumanPrompt,WorkEvent} from '../../core/types.ts'

/**
 * Experimental SQLite implementation of the existing DurableStats public
 * contract. DO NOT install this as the Windows production Goal work source:
 * authenticated immutable commit witnesses, native installed DSH recovery
 * and power-loss behavior are not yet accepted (Issue #121).
 *
 * Database owns atomic uniqueness/rollups; official Host still owns consent,
 * Goal blocking and recovery. Raw IDs, prompt text and attachments are never
 * inserted in SQLite.
 */
type Counter=keyof DurableTotals
const KEYS=['turnStarts','turnEnds','toolCalls','toolResults',
  'completedTurnMs','checked','safe','review','targeted'] as const satisfies readonly Counter[]
const ZERO:DurableTotals={turnStarts:0,turnEnds:0,toolCalls:0,toolResults:0,
 completedTurnMs:0,checked:0,safe:0,review:0,targeted:0}
const CHANGE_COLUMNS=KEYS.join(',')
const ADD_COLUMNS=KEYS.map(k=>k+'='+k+'+excluded.'+k).join(',')
const QMARKS=KEYS.map(()=>'?').join(',')
const TABLE_FIELDS=KEYS.map(k=>k+' INTEGER NOT NULL DEFAULT 0 CHECK('+k+'>=0)').join(',')
const VALID_TYPES=new Set(['turn-start','turn-end','tool-start','tool-end'])
const VALID_VERDICTS=new Set(['safe','suspected-abuse','targeted-abuse'])
const FILES=['work.v2.sqlite','work.v2.sqlite-wal','work.v2.sqlite-shm']
const RE_FP=/^[0-9a-f]{64}$/
function safeNumber(n:unknown):n is number{
 return typeof n==='number'&&Number.isSafeInteger(n)&&n>=0
}
function dayFor(ms:number):string{
 const day=new Date(ms).toISOString().slice(0,10)
 return day
}
function rowsToTotals(row:unknown):DurableTotals{
 if(!row||typeof row!=='object')throw Error('Missing SQLite totals')
 const r=row as Record<string,unknown>
 const totals={...ZERO}
 for(const k of KEYS){
  if(!safeNumber(r[k]))throw Error('Corrupt SQLite work counter: '+k)
  ;(totals as Record<string,number>)[k]=r[k]
 }
 return totals
}
function zeroRow():number[]{return KEYS.map(()=>0)}
export class SQLiteDurableStatsCandidate {
 readonly #dir:string
 readonly #db:DatabaseSync
 readonly #classificationEnabled:boolean
 #closed=false
 #faulted=false
 #mainIdentity:string|undefined
 #secret:Buffer
 readonly #pendingStarts=new Map<string,number>()

 constructor(directory:string,options:{classificationEnabled?:boolean}={}){
  if(typeof directory!=='string'||!directory.trim())throw Error('Stats directory required')
  this.#dir=directory
  this.#classificationEnabled=options.classificationEnabled===true
  if(process.platform==='win32'){
   // Creation allowed only for a NEW private NTFS directory; never mutate
   // inherited/unknown directories or traverse junction/reparse points.
   if(!existsSync(directory)&&!createProtectedNtfsDirectory(directory))
    throw Error('Private NTFS directory cannot be established')
   if(!verifyPrivateNtfsAcl(directory,'directory'))
    throw Error('Unverified private NTFS directory')
  }else{
   const info=lstatSync(directory)
   if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0)
    throw Error('Private POSIX stats directory required')
  }
  const filenames=readdirSync(directory)
  if(filenames.some(name=>!FILES.includes(name)))
   throw Error('Unexpected file in SQLite work directory')
  if(filenames.some(name=>{
   const file=join(directory,name),info=lstatSync(file)
   return !info.isFile()||info.isSymbolicLink()||info.nlink!==1||
      (process.platform==='win32'
       ?!verifyPrivateNtfsAcl(file,'file'):(info.mode&0o077)!==0)
  }))throw Error('Unverified pre-existing SQLite work file')
  const db=new DatabaseSync(join(directory,FILES[0]!),{timeout:5000})
  this.#db=db
  try{
   db.exec('PRAGMA trusted_schema=OFF')
   if(db.prepare('PRAGMA journal_mode=WAL').get()?.journal_mode!=='wal')
    throw Error('SQLite WAL mode unavailable')
   db.exec('PRAGMA synchronous=FULL')
   if(db.prepare('PRAGMA synchronous').get()?.synchronous!==2)
    throw Error('SQLite FULL sync unavailable')
   db.exec('PRAGMA foreign_keys=ON')
   db.exec(`CREATE TABLE IF NOT EXISTS meta(
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      version INTEGER NOT NULL CHECK(version=2),
      secret TEXT NOT NULL CHECK(length(secret)=64)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS seen(
      fp TEXT PRIMARY KEY CHECK(length(fp)=64)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS totals(
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      ${TABLE_FIELDS}
    ) STRICT;
    CREATE TABLE IF NOT EXISTS daily(
      day TEXT PRIMARY KEY,
      ${TABLE_FIELDS}
    ) STRICT;`)
   db.exec('BEGIN IMMEDIATE')
   try{
    db.prepare('INSERT OR IGNORE INTO meta VALUES(1,2,?)')
      .run(randomBytes(32).toString('hex'))
    db.prepare(`INSERT OR IGNORE INTO totals(singleton,${CHANGE_COLUMNS})
      VALUES(1,${QMARKS})`).run(...zeroRow())
    db.exec('COMMIT')
   }catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e}
   if(db.prepare('PRAGMA quick_check').get()?.quick_check!=='ok')
     throw Error('SQLite integrity check failed')
   this.#secret=Buffer.from((db.prepare('SELECT secret FROM meta WHERE singleton=1')
     .get() as {secret:string}).secret,'hex')
   if(this.#secret.length!==32)throw Error('Invalid SQLite pseudonymous secret')
   this.#checkFiles()
  }catch(e){db.close();throw e}
 }
 #safeFile(name:string):boolean{
  try{
   if(!FILES.includes(name))return false
   const path=join(this.#dir,name)
   const stat=lstatSync(path)
   if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)return false
   if(process.platform==='win32')return verifyPrivateNtfsAcl(path,'file')
   if((stat.mode&0o077)!==0){
    // SQLite itself controls opening WAL/SHM files. The parent is strictly
    // private (0700); narrow their default modes before trusting any value.
    // Previously existing loose files are rejected by constructor preflight.
    chmodSync(path,0o600)
   }
   return (lstatSync(path).mode&0o077)===0
  }catch{return false}
 }
 #checkFiles():void{
  const names=readdirSync(this.#dir)
  if(names.some(name=>!FILES.includes(name)))
   throw Error('SQLite directory contains unexpected file')
  const present=FILES.filter(name=>names.includes(name))
  if(!present.includes(FILES[0]!))
   throw Error('SQLite main database disappeared')
  for(const name of present){
   const stat=lstatSync(join(this.#dir,name))
   if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)
    throw Error('SQLite main/WAL/SHM file identity lost')
  }
  const main=lstatSync(join(this.#dir,FILES[0]!))
  const identity=String(main.dev)+':'+String(main.ino)
  if(this.#mainIdentity!==undefined&&this.#mainIdentity!==identity)
   throw Error('SQLite main database file replaced while open')
  if(process.platform==='win32'){
   // The identical full DACL/reparse-point proof, one OS subprocess per pass.
   const checks:{path:string;kind:'file'|'directory'}[]=[
    {path:this.#dir,kind:'directory'},
    ...present.map(name=>({path:join(this.#dir,name),kind:'file' as const})),
   ]
   if(!verifyPrivateNtfsAclBatch(checks))
    throw Error('SQLite NTFS directory or file DACL no longer private')
  }else{
   for(const name of present)
    if(!this.#safeFile(name))throw Error('SQLite private file identity lost')
  }
  this.#mainIdentity=identity
 }
 #healthy():void{
  if(this.#closed||this.#faulted)throw Error('SQLite ledger unavailable')
  try{this.#checkFiles()}catch(e){this.#faulted=true;throw e}
 }
 #fingerprint(kind:'work'|'session'|'detection',parts:readonly string[]):string{
  return createHmac('sha256',this.#secret).update(JSON.stringify([kind,...parts])).digest('hex')
 }
 #commit(fp:string,atMs:number,changes:Partial<DurableTotals>):boolean{
  this.#healthy()
  if(!RE_FP.test(fp)||!safeNumber(atMs)||atMs>8_640_000_000_000_000)
   return false
  const values=KEYS.map(k=>changes[k]??0)
  if(values.some(v=>!safeNumber(v)))return false
  const day=dayFor(atMs)
  try{
   this.#db.exec('BEGIN IMMEDIATE')
   const inserted=this.#db.prepare('INSERT OR IGNORE INTO seen(fp) VALUES(?)').run(fp)
   if(inserted.changes===1){
    this.#db.prepare(`INSERT INTO daily(day,${CHANGE_COLUMNS})
      VALUES(?,${QMARKS}) ON CONFLICT(day) DO UPDATE SET ${ADD_COLUMNS}`)
     .run(day,...values)
    this.#db.prepare(`INSERT INTO totals(singleton,${CHANGE_COLUMNS})
      VALUES(1,${QMARKS}) ON CONFLICT(singleton) DO UPDATE SET ${ADD_COLUMNS}`)
     .run(...values)
    // Match current DurableStats' bounded 16,384-dedup-window semantics.
    this.#db.exec('DELETE FROM seen WHERE rowid NOT IN (SELECT rowid FROM seen ORDER BY rowid DESC LIMIT 16384)')
    // Match the existing 366 UTC-day retention bound, without raw events.
    this.#db.exec('DELETE FROM daily WHERE day NOT IN (SELECT day FROM daily ORDER BY day DESC LIMIT 366)')
   }
   this.#db.exec('COMMIT')
   return inserted.changes===1
  }catch(e){
   try{if(this.#db.isTransaction)this.#db.exec('ROLLBACK')}catch{/* fail closed */}
   this.#faulted=true
   throw e
  }
 }
 get classificationEnabled():boolean{return this.#classificationEnabled}
 recordWork(e:WorkEvent):boolean{
  if(!e.id||!e.agentId||!e.sessionId||!VALID_TYPES.has(e.type)||
    !safeNumber(e.recordedAtMs))return false
  const fp=this.#fingerprint('work',[e.agentId,e.sessionId,e.id])
  const key=this.#fingerprint('session',[e.agentId,e.sessionId])
  const start=this.#pendingStarts.get(key)
  const changes:Partial<{ -readonly [K in keyof DurableTotals]:number }>={}
  if(e.type==='turn-start')changes.turnStarts=1
  if(e.type==='turn-end'){
   changes.turnEnds=1
   if(start!==undefined&&e.recordedAtMs>=start)
    changes.completedTurnMs=Math.floor(e.recordedAtMs-start)
  }
  if(e.type==='tool-start')changes.toolCalls=1
  if(e.type==='tool-end')changes.toolResults=1
  const accepted=this.#commit(fp,e.recordedAtMs,changes)
  if(accepted){
   if(e.type==='turn-start')this.#pendingStarts.set(key,e.recordedAtMs)
   if(e.type==='turn-end')this.#pendingStarts.delete(key)
  }
  return accepted
 }
 recordDetection(prompt:HumanPrompt,result:DetectionResult):boolean{
  if(!this.#classificationEnabled)return false
  if(!prompt.id||!prompt.agentId||!prompt.sessionId||
    !safeNumber(prompt.receivedAtMs)||prompt.provenance.actor!=='human'||
    !VALID_VERDICTS.has(result.verdict))return false
  return this.#commit(this.#fingerprint('detection',
   [prompt.agentId,prompt.sessionId,prompt.id]),prompt.receivedAtMs,{
    checked:1,safe:Number(result.verdict==='safe'),
    review:Number(result.verdict==='suspected-abuse'),
    targeted:Number(result.verdict==='targeted-abuse'),
  })
 }
 snapshot():DurableTotals{
  this.#healthy()
  return rowsToTotals(this.#db.prepare('SELECT * FROM totals WHERE singleton=1').get())
 }
 snapshotDays(limit=7):ReadonlyArray<{day:string;totals:DurableTotals}>{
  this.#healthy()
  if(!Number.isSafeInteger(limit)||limit<1||limit>31)
   throw Error('Daily summary limit must be 1..31')
  const rows=this.#db.prepare('SELECT * FROM daily ORDER BY day DESC LIMIT ?').all(limit)
  return rows.reverse().map(row=>({
   day:String(row.day),totals:rowsToTotals(row),
  }))
 }
 trustedWorkDays(limit=31):ReturnType<SQLiteDurableStatsCandidate['snapshotDays']>|null{
  try{
   this.#healthy()
   if(this.#db.prepare('PRAGMA quick_check').get()?.quick_check!=='ok'){
    this.#faulted=true;return null
   }
   return this.snapshotDays(limit)
  }catch{this.#faulted=true;return null}
 }
 reset():void{
  this.#healthy()
  try{
   this.#db.exec('BEGIN IMMEDIATE')
   this.#db.exec('DELETE FROM seen;DELETE FROM daily;DELETE FROM totals')
   this.#db.prepare(`INSERT INTO totals(singleton,${CHANGE_COLUMNS})
      VALUES(1,${QMARKS})`).run(...zeroRow())
   this.#db.prepare('UPDATE meta SET secret=? WHERE singleton=1')
     .run(randomBytes(32).toString('hex'))
   this.#db.exec('COMMIT')
   this.#secret=Buffer.from((this.#db.prepare('SELECT secret FROM meta WHERE singleton=1')
     .get() as {secret:string}).secret,'hex')
   this.#pendingStarts.clear()
  }catch(e){
   try{if(this.#db.isTransaction)this.#db.exec('ROLLBACK')}catch{}
   this.#faulted=true;throw e
  }
 }
 close():void{
  if(this.#closed)return
  this.#closed=true
  try{this.#db.close()}catch{/* never break Host close */}
 }
}
