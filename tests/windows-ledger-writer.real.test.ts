import assert from 'node:assert/strict'
import test from 'node:test'
import {spawn, type ChildProcess} from 'node:child_process'
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,openSync,closeSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {ExperimentalNtfsWalWriter,verifyNtfsOpenFileIdentity} from '../src/adapters/node/windows-ledger-writer.experimental.ts'
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

test('native Windows manual checkpoint retains daily counts and fingerprints after WAL replacement',{
 skip:process.platform!=='win32'&&'Native experimental NTFS checkpoint only',timeout:100_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-writer-checkpoint-'))
 const dir=join(parent,'secured-ledger')
 let writer:ExperimentalNtfsWalWriter|undefined
 try{
  writer=new ExperimentalNtfsWalWriter(dir)
  assert.equal(writer.recordSyntheticToolCall('checkpoint-1','sandbox-agent','sandbox-session',now),true)
  assert.equal(writer.recordSyntheticToolCall('checkpoint-2','sandbox-agent','sandbox-session',now+1),true)
  writer.checkpointForTest()
  assert.equal(writer.snapshot.sequence,2)
  assert.equal(readFileSync(join(dir,'aggregate.v1.journal')).length,0,
   'Successful checkpoint must replace WAL with an empty private file')
  const durable=JSON.parse(readFileSync(join(dir,'aggregate.v1.json'),'utf8'))
  assert.equal(durable.sequence,2)
  assert.equal(durable.totals.toolCalls,2)
  assert.equal(durable.daily[new Date(now).toISOString().slice(0,10)].toolCalls,2)
  assert.equal(durable.seen.length,2)
  assert.equal(writer.recordSyntheticToolCall('checkpoint-3','sandbox-agent','sandbox-session',now+2),true)
  writer.close();writer=undefined
  const reopened=new ExperimentalNtfsWalWriter(dir)
  writer=reopened
  assert.deepEqual(reopened.snapshot,{sequence:3,toolCalls:3})
  assert.equal(reopened.recordSyntheticToolCall('checkpoint-1','sandbox-agent','sandbox-session',now),false)
  assert.equal(reopened.recordSyntheticToolCall('checkpoint-3','sandbox-agent','sandbox-session',now+2),false)
  reopened.checkpointForTest()
  reopened.close();writer=undefined
  const verified=inspectPrivateNtfsWalReplay(dir)
  assert.equal(verified.status,'verified')
  assert.equal(verified.sequence,3)
  assert.equal(verified.totals?.toolCalls,3)
  assert.equal(readFileSync(join(dir,'aggregate.v1.journal')).length,0)
 }finally{writer?.close();rmSync(parent,{recursive:true,force:true})}
})

test('native Windows crash after snapshot commit and before WAL replace never replays duplicate work',{
 skip:process.platform!=='win32'&&'Native experimental NTFS crash window only',timeout:95_000,
},async()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-writer-crash-checkpoint-'))
 const dir=join(parent,'secured-ledger')
 const program=`import {ExperimentalNtfsWalWriter} from ${JSON.stringify(source)};\n`+
  `const w=new ExperimentalNtfsWalWriter(process.env.PICKET_TEST_DIR);\n`+
  `w.recordSyntheticToolCall('checkpoint-crash-1','synthetic-agent','synthetic-session',${now});\n`+
  `w.recordSyntheticToolCall('checkpoint-crash-2','synthetic-agent','synthetic-session',${now+1});\n`+
  `w.checkpointForTest(()=>{process.stdout.write('SNAPSHOT_DURABLE\\n');setInterval(()=>{},1000)});\n`
 let child:ChildProcess|undefined
 try{
  child=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',program],{
   env:{...process.env,PICKET_TEST_DIR:dir},stdio:['ignore','pipe','pipe'],windowsHide:true,
  })
  await Promise.race([
   new Promise<void>((resolve,reject)=>{
    let output=''
    child!.stdout!.on('data',b=>{output+=String(b);if(output.includes('SNAPSHOT_DURABLE'))resolve()})
    child!.once('error',reject)
    child!.once('exit',()=>reject(Error('Child exited before snapshot checkpoint')))
   }),
   new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('Snapshot fsync timeout')),30_000)),
  ])
  const exited=new Promise<void>(resolve=>{
   if(child!.exitCode!==null||child!.signalCode!==null)resolve()
   else child!.once('exit',()=>resolve())
  })
  child.kill('SIGKILL')
  await Promise.race([exited,new Promise<never>((_,reject)=>
   setTimeout(()=>reject(Error('Crashed checkpoint worker did not exit')),15_000))])
  child=undefined
  assert.equal(existsSync(join(dir,'aggregate.v1.lock')),true,
   'Unrecovered crash lock must remain: never auto-steal')
  const snapshotText=readFileSync(join(dir,'aggregate.v1.json'),'utf8')
  const oldWal=readFileSync(join(dir,'aggregate.v1.journal'))
  assert.notEqual(oldWal.length,0,'Old WAL remains until journal replacement')
  const result=replayVerifiedV1SnapshotWal(snapshotText,oldWal)
  assert.equal(result.status,'verified')
  assert.equal(result.sequence,2)
  assert.equal(result.applied,0,'Snapshot-committed records must not be replayed twice')
  assert.equal(result.totals?.toolCalls,2)
  assert.throws(()=>new ExperimentalNtfsWalWriter(dir),/existing lock or recovery/)
  assert.deepEqual(readFileSync(join(dir,'aggregate.v1.journal')),oldWal)
 }finally{child?.kill('SIGKILL');rmSync(parent,{recursive:true,force:true})}
})


test('native Windows verifies actual opened WAL identity, not just pathname or ACL',{
 skip:process.platform!=='win32'&&'Native NTFS handle identity only',timeout:35_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-handle-file-id-'))
 const one=join(parent,'synthetic-one.dat'),two=join(parent,'synthetic-two.dat')
 let fd:number|undefined
 try{
  writeFileSync(one,'synthetic-one',{flag:'wx',mode:0o600})
  writeFileSync(two,'synthetic-two',{flag:'wx',mode:0o600})
  fd=openSync(one,'r')
  assert.equal(verifyNtfsOpenFileIdentity(fd,one),true,
    'A real NTFS file opened by Node must be identified as the same path')
  assert.equal(verifyNtfsOpenFileIdentity(fd,two),false,
    'The current pathname must not be allowed to refer to a different file')
  assert.equal(verifyNtfsOpenFileIdentity(fd,join(parent,'missing')),false)
  closeSync(fd);fd=undefined
 }finally{if(fd!==undefined)closeSync(fd);rmSync(parent,{recursive:true,force:true})}
})

test('native Windows separate process cannot seize an active experimental ledger writer lock',{
 skip:process.platform!=='win32'&&'Native NTFS two-process writer contention only',timeout:70_000,
},async()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-writer-contention-'))
 const dir=join(parent,'private-ledger')
 let owner:ExperimentalNtfsWalWriter|undefined
 let competitor:ChildProcess|undefined
 try{
  owner=new ExperimentalNtfsWalWriter(dir)
  owner.recordSyntheticToolCall('owner-one','sandbox-agent','sandbox-session',now)
  const program=`import {ExperimentalNtfsWalWriter} from ${JSON.stringify(source)};\n`+
   `try{const lost=new ExperimentalNtfsWalWriter(process.env.PICKET_TEST_DIR);\n`+
   `lost.close();process.stderr.write('UNSAFE_SECOND_WRITER\\n');process.exit(3)}\n`+
   `catch(e){if(!String(e.message).includes('existing lock or recovery')){\n`+
   `process.stderr.write('UNEXPECTED_REFUSAL\\n');process.exit(4)}\n`+
   `process.stdout.write('SECOND_WRITER_REFUSED\\n')}\n`
  competitor=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',program],{
   env:{...process.env,PICKET_TEST_DIR:dir},stdio:['ignore','pipe','pipe'],windowsHide:true,
  })
  const evidence=await Promise.race([
   new Promise<{code:number|null;out:string;err:string}>((resolve,reject)=>{
    let out='',err=''
    competitor!.stdout!.on('data',v=>out+=String(v))
    competitor!.stderr!.on('data',v=>err+=String(v))
    competitor!.once('error',reject)
    competitor!.once('exit',code=>resolve({code,out,err}))
   }),
   new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('Competing native writer timed out')),25_000)),
  ])
  assert.equal(evidence.code,0,evidence.err)
  assert.match(evidence.out,/SECOND_WRITER_REFUSED/)
  owner.recordSyntheticToolCall('owner-two','sandbox-agent','sandbox-session',now+1)
  owner.close();owner=undefined
  const verified=inspectPrivateNtfsWalReplay(dir)
  assert.equal(verified.status,'verified')
  assert.equal(verified.sequence,2)
  assert.equal(verified.totals?.toolCalls,2)
 }finally{competitor?.kill('SIGKILL');owner?.close();rmSync(parent,{recursive:true,force:true})}
})
