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
