import assert from 'node:assert/strict'
import test from 'node:test'
import {existsSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {SqliteWorkCandidate} from '../scripts/windows-sqlite-ledger-candidate.mjs'
import {createProtectedNtfsDirectory,verifyPrivateNtfsAcl} from '../src/adapters/node/windows-private-acl.ts'

const fp=(n:number)=>n.toString(16).padStart(64,'0')
const DAY='2026-10-13'
function temp(fn:(dir:string)=>void){
 const dir=mkdtempSync(join(tmpdir(),'agent-picket-sqlite-candidate-'))
 try{fn(dir)}finally{rmSync(dir,{recursive:true,force:true})}
}

test('SQLite FULL WAL records completed turn exactly once, then reopens in another connection',()=>{
 temp(dir=>{
  const a=new SqliteWorkCandidate(dir)
  assert.equal(a.commitCompleted(fp(1),DAY,7*3_600_000),true)
  assert.equal(a.commitCompleted(fp(1),DAY,7*3_600_000),false)
  assert.equal(a.count(DAY),7*3_600_000)
  assert.equal(a.integrity(),true)
  a.close()
  const b=new SqliteWorkCandidate(dir)
  assert.equal(b.count(DAY),7*3_600_000)
  assert.equal(b.commitCompleted(fp(1),DAY,7*3_600_000),false)
  assert.equal(b.commitCompleted(fp(2),DAY,3_600_000),true)
  assert.equal(b.count(DAY),8*3_600_000)
  assert.equal(b.integrity(),true)
  b.close()
 })
})

test('SQLite rejects negative/overlong/duplicate and malformed UTC completed-turn data',()=>{
 temp(dir=>{
  const db=new SqliteWorkCandidate(dir)
  assert.throws(()=>db.commitCompleted('raw-event-id',DAY,1),/Invalid/)
  assert.throws(()=>db.commitCompleted(fp(1),'2026-02-31',1),/Invalid UTC day/)
  assert.throws(()=>db.commitCompleted(fp(2),DAY,-1),/Invalid/)
  assert.throws(()=>db.commitCompleted(fp(2),DAY,NaN),/Invalid/)
  assert.equal(db.count(DAY),0)
  db.close()
 })
})

async function runCrashWorker(dir:string,mode:'committed'|'uncommitted',n:number){
 const child=spawn(process.execPath,[
   join(import.meta.dirname,'..','scripts','windows-sqlite-crash-worker.mjs'),
   dir,mode,fp(n),DAY,String(3_600_000),
 ],{stdio:['ignore','pipe','pipe'],windowsHide:true})
 let err='',gotReady=false
 const ready=await new Promise<boolean>(resolve=>{
   const limit=setTimeout(()=>resolve(false),15_000)
   child.stdout?.on('data',b=>{
    if(String(b).includes('WORKER_READY')){gotReady=true;clearTimeout(limit);resolve(true)}
   })
   child.stderr?.on('data',b=>{err+=String(b)})
   child.on('error',()=>{clearTimeout(limit);resolve(false)})
   child.on('exit',()=>{clearTimeout(limit);resolve(gotReady)})
 })
 if(!ready){child.kill('SIGKILL');throw Error('SQLite worker was not ready: '+err)}
 const exited=new Promise<void>(resolve=>{
   const limit=setTimeout(()=>{child.kill('SIGKILL');resolve()},10_000)
   child.once('exit',()=>{clearTimeout(limit);resolve()})
 })
 child.kill('SIGKILL')
 await exited
}

test('SQLite native process termination: committed record persists and unfinished transaction disappears',{
 timeout:55_000,
},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'agent-picket-sqlite-crash-'))
 try {
   await runCrashWorker(dir,'committed',3)
   let db=new SqliteWorkCandidate(dir)
   assert.equal(db.count(DAY),3_600_000)
   db.close()
   await runCrashWorker(dir,'uncommitted',4)
   db=new SqliteWorkCandidate(dir)
   assert.equal(db.integrity(),true)
   assert.equal(db.count(DAY),3_600_000)
   assert.equal(db.commitCompleted(fp(4),DAY,3_600_000),true,
     'Uncommitted transaction must not persist a phantom duplicate')
   assert.equal(db.count(DAY),7_200_000)
   db.close()
 }finally{rmSync(dir,{recursive:true,force:true})}
})

test('native Windows SQLite files inherit verified private NTFS DACLs',{
 skip:process.platform!=='win32'&&'Requires Windows NTFS',timeout:35_000,
},()=>{
 const root=mkdtempSync(join(tmpdir(),'agent-picket-sqlite-private-'))
 const privateDir=join(root,'private')
 try{
  assert.equal(createProtectedNtfsDirectory(privateDir),true)
  assert.equal(verifyPrivateNtfsAcl(privateDir,'directory'),true)
  const db=new SqliteWorkCandidate(privateDir)
  try{
   assert.equal(db.commitCompleted(fp(6),DAY,180_000),true)
   for(const suffix of ['', '-wal', '-shm']){
    const path=join(privateDir,'work-candidate.sqlite'+suffix)
    if(existsSync(path))assert.equal(verifyPrivateNtfsAcl(path,'file'),true,
      'SQLite sidecar '+suffix+' must inherit private DACL')
   }
  }finally{db.close()}
 }finally{rmSync(root,{recursive:true,force:true})}
})
