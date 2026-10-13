import assert from 'node:assert/strict'
import test from 'node:test'
import {spawn, type ChildProcess} from 'node:child_process'
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {ExperimentalNtfsWalWriter} from '../src/adapters/node/windows-ledger-writer.experimental.ts'
import {inspectPrivateNtfsWalReplay,replayVerifiedV1SnapshotWal} from '../src/adapters/node/windows-wal-replay.ts'

const now=1_760_000_000_000
const source=pathToFileURL(resolve(import.meta.dirname,
 '../src/adapters/node/windows-ledger-writer.experimental.ts')).href

test('Windows-only experimental writer is never instantiated on POSIX',()=>{
 if(process.platform!=='win32'){
  const directory=join(tmpdir(),'ap-no-experimental-writer-ever')
  assert.throws(()=>new ExperimentalNtfsWalWriter(directory),/requires Windows/)
 }
})

test('native Windows owner-only WAL writes, restart dedup, concurrent refusal and corruption rejection',{
 skip:process.platform!=='win32'&&'Native NTFS-only temporary experimental writer',timeout:110_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-writer-v1-'))
 const dir=join(parent,'private-new-ledger')
 let writer:ExperimentalNtfsWalWriter|undefined
 try{
  writer=new ExperimentalNtfsWalWriter(dir)
  assert.deepEqual(writer.snapshot,{sequence:0,toolCalls:0})
  assert.equal(writer.recordSyntheticToolCall('event1','secret-agent','secret-session',now),true)
  assert.equal(writer.recordSyntheticToolCall('event1','secret-agent','secret-session',now),false)
  assert.equal(writer.recordSyntheticToolCall('event2','secret-agent','secret-session',now+1),true)
  assert.deepEqual(writer.snapshot,{sequence:2,toolCalls:2})
  assert.throws(()=>new ExperimentalNtfsWalWriter(dir),/existing lock or recovery/,
   'Second process/owner must not steal a live lock')
  writer.close();writer=undefined
  assert.equal(existsSync(join(dir,'aggregate.v1.lock')),false)
  let reopened=new ExperimentalNtfsWalWriter(dir)
  writer=reopened
  assert.deepEqual(reopened.snapshot,{sequence:2,toolCalls:2})
  assert.equal(reopened.recordSyntheticToolCall('event1','secret-agent','secret-session',now),false,
    'Dedup survives process/owner restart')
  assert.equal(reopened.recordSyntheticToolCall('event3','secret-agent','secret-session',now+2),true)
  reopened.close();writer=undefined
  const verified=inspectPrivateNtfsWalReplay(dir)
  assert.equal(verified.status,'verified')
  assert.equal(verified.sequence,3)
  assert.equal(verified.totals?.toolCalls,3)
  const journal=join(dir,'aggregate.v1.journal')
  const raw=readFileSync(journal,'utf8')
  assert.doesNotMatch(raw,/secret-agent|secret-session|event1|event2|event3/)
  const tampered=raw.replace('"toolCalls":1','"toolCalls":2')
  assert.notEqual(tampered,raw)
  writeFileSync(journal,tampered)
  assert.throws(()=>new ExperimentalNtfsWalWriter(dir),/WAL requires forensic review/)
  assert.equal(readFileSync(journal,'utf8'),tampered,
    'Corrupt journal must not be reset, rewritten or repaired')
 }finally{
  writer?.close()
  rmSync(parent,{recursive:true,force:true})
 }
})

test('native NTFS abrupt process kill preserves fsynced WAL but refuses stale-lock takeover',{
 skip:process.platform!=='win32'&&'Native NTFS-only child crash test',timeout:95_000,
},async()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-writer-killed-'))
 const dir=join(parent,'private-new-ledger')
 const program=`import {ExperimentalNtfsWalWriter} from ${JSON.stringify(source)};\n`+
  `const w=new ExperimentalNtfsWalWriter(process.env.PICKET_TEST_DIR);\n`+
  `w.recordSyntheticToolCall('killed-event','synthetic-agent','synthetic-session',${now});\n`+
  `process.stdout.write('COMMITTED\\n');\nsetInterval(()=>{},1000);\n`
 let child:ChildProcess|undefined
 try{
  child=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',program],{
   env:{...process.env,PICKET_TEST_DIR:dir},stdio:['ignore','pipe','pipe'],windowsHide:true,
  })
  await Promise.race([
   new Promise<void>((resolve,reject)=>{
    let output=''
    child!.stdout!.on('data',b=>{output+=String(b);if(output.includes('COMMITTED'))resolve()})
    child!.once('error',reject)
    child!.once('exit',()=>reject(Error('Writer unexpectedly exited before commit')))
   }),
   new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('Timed out waiting for committed WAL')),20_000)),
  ])
  assert.equal(existsSync(join(dir,'aggregate.v1.lock')),true)
  const exited=new Promise<void>(resolve=>{
   if(child!.exitCode!==null||child!.signalCode!==null)resolve()
   else child!.once('exit',()=>resolve())
  })
  child.kill('SIGKILL')
  await Promise.race([exited,new Promise<never>((_,reject)=>
   setTimeout(()=>reject(Error('Killed writer failed to exit')),15_000))])
  child=undefined
  assert.throws(()=>new ExperimentalNtfsWalWriter(dir),/existing lock or recovery/)
  const raw=readFileSync(join(dir,'aggregate.v1.journal'))
  const verified=replayVerifiedV1SnapshotWal(
    readFileSync(join(dir,'aggregate.v1.json'),'utf8'),raw)
  assert.equal(verified.status,'verified')
  assert.equal(verified.sequence,1)
  assert.equal(verified.totals?.toolCalls,1)
  assert.equal(existsSync(join(dir,'aggregate.v1.lock')),true,
   'Never unlink a stale lock without a proven serialized recovery protocol')
 }finally{
  child?.kill('SIGKILL')
  rmSync(parent,{recursive:true,force:true})
 }
})
