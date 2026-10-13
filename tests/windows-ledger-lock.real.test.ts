import assert from 'node:assert/strict'
import test from 'node:test'
import {spawn, type ChildProcess} from 'node:child_process'
import {closeSync,existsSync,mkdtempSync,openSync,readFileSync,rmSync,
 unlinkSync,writeFileSync} from 'node:fs'
import {tmpdir,hostname} from 'node:os'
import {join} from 'node:path'
import {createProtectedNtfsDirectory} from '../src/adapters/node/windows-private-acl.ts'
import {inspectPrivateNtfsLedgerLock} from '../src/adapters/node/windows-ledger-lock.ts'

test('non-Windows lock inspector never claims an authenticated owner',()=>{
 if(process.platform!=='win32')assert.deepEqual(inspectPrivateNtfsLedgerLock('/tmp'),{status:'unconfirmed'})
})

test('native NTFS live writer, wx exclusivity, recovery fencing and crash leave an inspectable lock',{
 skip:process.platform!=='win32'&&'Real Windows NTFS test only',timeout:35_000,
},async()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-ntfs-owner-'))
 const dir=join(parent,'secure-ledger')
 let child:ChildProcess|undefined
 try {
  assert.equal(createProtectedNtfsDirectory(dir),true)
  assert.equal(inspectPrivateNtfsLedgerLock(dir).status,'absent')
  const lock=join(dir,'aggregate.v1.lock')
  const script=String.raw`
const {openSync,writeFileSync,fsyncSync,closeSync}=require('node:fs');
const {hostname}=require('node:os');
const fd=openSync(process.env.TEST_LOCK_PATH,'wx',0o600);
try {
 writeFileSync(fd,JSON.stringify({version:1,pid:process.pid,host:hostname(),token:'a'.repeat(32)}));
 fsyncSync(fd)
}finally{closeSync(fd)}
process.stdout.write('LOCK_READY\\n');
setInterval(()=>{},1000);
`
  child=spawn(process.execPath,['-e',script],{
   env:{...process.env,TEST_LOCK_PATH:lock},stdio:['ignore','pipe','pipe'],
   windowsHide:true,
  })
  const ready=await Promise.race([
   new Promise<string>((resolve,reject)=>{
    let output=''
    child!.stdout!.on('data',chunk=>{
     output+=String(chunk)
     if(output.includes('LOCK_READY'))resolve(output)
    })
    child!.once('error',reject)
    child!.once('exit',()=>reject(new Error('Test lock owner exited before ready')))
   }),
   new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Native lock owner timeout')),8_000)),
  ])
  assert.match(ready,/LOCK_READY/)
  assert.deepEqual(inspectPrivateNtfsLedgerLock(dir),{status:'live-owner'})
  assert.throws(()=>openSync(lock,'wx',0o600),{code:'EEXIST'},'No second owner may replace lock')
  const recovery=join(dir,'aggregate.v1.recovery')
  const recoveryFd=openSync(recovery,'wx',0o600)
  try{
   assert.throws(()=>openSync(recovery,'wx',0o600),{code:'EEXIST'})
   assert.equal(inspectPrivateNtfsLedgerLock(dir).status,'unconfirmed',
    'Existing recovery mutex prevents any speculative stale-lock reuse')
  }finally{closeSync(recoveryFd);unlinkSync(recovery)}
  const exited=new Promise<void>(resolve=>{
   if(child!.exitCode!==null||child!.signalCode!==null)resolve()
   else child!.once('exit',()=>resolve())
  })
  child.kill('SIGKILL')
  await Promise.race([
   exited,
   new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Native child did not exit')),8_000)),
  ])
  child=undefined
  assert.equal(inspectPrivateNtfsLedgerLock(dir).status,'stale-candidate',
   'A dead PID is only a candidate for future recovery, never auto-unlinked')
  assert.equal(existsSync(lock),true)
  const original=readFileSync(lock,'utf8')
  assert.match(original,/"version":1/)
 }finally{
  child?.kill('SIGKILL')
  rmSync(parent,{recursive:true,force:true})
 }
})

test('malformed native lock and unrelated Host never become eligible for recovery',{
 skip:process.platform!=='win32'&&'Real Windows NTFS test only',timeout:20_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-ntfs-lock-bad-'))
 const dir=join(parent,'secure-ledger')
 try{
  assert.equal(createProtectedNtfsDirectory(dir),true)
  const lock=join(dir,'aggregate.v1.lock')
  for(const value of ['garbage',JSON.stringify({version:1,pid:2147483647,
   host:'a-different-host',token:'a'.repeat(32)})]){
   writeFileSync(lock,value,{mode:0o600})
   assert.equal(inspectPrivateNtfsLedgerLock(dir).status,'unconfirmed')
   assert.equal(readFileSync(lock,'utf8'),value)
  }
 }finally{rmSync(parent,{recursive:true,force:true})}
})


test('native Windows: two recovery processes cannot own the same stale-lock recovery mutex',{
 skip:process.platform!=='win32'&&'Real Windows NTFS only',timeout:35_000,
},async()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-ntfs-recovery-race-'))
 const dir=join(parent,'secure-ledger')
 let owner:ChildProcess|undefined
 try {
  assert.equal(createProtectedNtfsDirectory(dir),true)
  const lock=join(dir,'aggregate.v1.lock')
  const stale=JSON.stringify({version:1,pid:2147483647,
    host:hostname(),token:'b'.repeat(32)})
  writeFileSync(lock,stale,{flag:'wx',mode:0o600})
  assert.equal(inspectPrivateNtfsLedgerLock(dir).status,'stale-candidate')
  const recovery=join(dir,'aggregate.v1.recovery')
  const worker=String.raw`
const {openSync,closeSync,fsyncSync,writeFileSync}=require('node:fs');
let fd;
try {fd=openSync(process.env.PICKET_TEST_RECOVERY_PATH,'wx',0o600)}
catch(e){if(e.code==='EEXIST'){process.stdout.write('BUSY\n');process.exit(0)}throw e}
try{writeFileSync(fd,JSON.stringify({owner:process.pid,token:'c'.repeat(32)}));fsyncSync(fd)}
finally{closeSync(fd)}
process.stdout.write('HELD\n');
if(process.env.PICKET_HOLD_RECOVERY==='1')setInterval(()=>{},1000)
`
  function spawnWorker(hold:boolean){
    return spawn(process.execPath,['-e',worker],{
      env:{...process.env,PICKET_TEST_RECOVERY_PATH:recovery,
        PICKET_HOLD_RECOVERY:hold?'1':'0'},
      stdio:['ignore','pipe','pipe'],windowsHide:true,
    })
  }
  function output(proc:ChildProcess,expected:string):Promise<string>{
    return new Promise((resolve,reject)=>{
      let value=''
      proc.stdout!.on('data',chunk=>{
        value+=String(chunk)
        if(value.includes(expected))resolve(value)
      })
      proc.once('error',reject)
      proc.once('exit',()=>{
        if(!value.includes(expected))reject(new Error('Recovery worker never emitted '+expected))
      })
    })
  }
  owner=spawnWorker(true)
  assert.match(await Promise.race([
    output(owner,'HELD'),new Promise<never>((_,reject)=>
      setTimeout(()=>reject(new Error('Recovery mutex owner timed out')),8_000)),
  ]),/HELD/)
  assert.equal(inspectPrivateNtfsLedgerLock(dir).status,'unconfirmed',
    'A recovery mutex in use disallows ALL additional stale-lock candidates')
  const contender=spawnWorker(false)
  const contenderOut=await Promise.race([
    output(contender,'BUSY'),new Promise<never>((_,reject)=>
      setTimeout(()=>reject(new Error('Recovery competitor timed out')),8_000)),
  ])
  assert.match(contenderOut,/BUSY/)
  await Promise.race([
   new Promise<void>((resolve,reject)=>{
    if(contender.exitCode!==null||contender.signalCode!==null){
     contender.exitCode===0?resolve():reject(new Error('Second recovery owner failed'))
    }else contender.once('exit',code=>code===0?resolve():reject(new Error('Second recovery owner failed')))
   }),
   new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Second recovery worker failed to exit')),8_000)),
  ])
  assert.equal(readFileSync(lock,'utf8'),stale,
    'Both recovering processes must leave the lock itself unchanged')
  const finished=new Promise<void>(resolve=>{
    if(owner!.exitCode!==null||owner!.signalCode!==null)resolve()
    else owner!.once('exit',()=>resolve())
  })
  owner.kill('SIGKILL')
  await Promise.race([
    finished,new Promise<never>((_,reject)=>
      setTimeout(()=>reject(new Error('Recovery owner failed to stop')),8_000)),
  ])
  owner=undefined
  assert.equal(existsSync(recovery),true,'Crash leaves the recovery mutex for investigation')
  assert.equal(inspectPrivateNtfsLedgerLock(dir).status,'unconfirmed',
    'Abandoned recovery mutex is never silently stolen')
  assert.equal(readFileSync(lock,'utf8'),stale)
 }finally{
  owner?.kill('SIGKILL')
  rmSync(parent,{recursive:true,force:true})
 }
})
