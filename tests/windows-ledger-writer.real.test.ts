import assert from 'node:assert/strict'
import test from 'node:test'
import {spawn, type ChildProcess} from 'node:child_process'
import {createHmac} from 'node:crypto'
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,openSync,closeSync,unlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {ExperimentalNtfsWalWriter,verifyNtfsOpenFileIdentity} from '../src/adapters/node/windows-ledger-writer.experimental.ts'
import {inspectPrivateNtfsWalReplay,replayVerifiedV1SnapshotWal} from '../src/adapters/node/windows-wal-replay.ts'
import {auditExperimentalWalAnchor,inspectPrivateNtfsAnchoredWalReplay} from '../src/adapters/node/windows-wal-anchor.experimental.ts'
import {createProtectedNtfsDirectory} from '../src/adapters/node/windows-private-acl.ts'

const now=1_760_000_000_000
const source=pathToFileURL(resolve(import.meta.dirname,
 '../src/adapters/node/windows-ledger-writer.experimental.ts')).href

/** Only synthetic FIXTURES may seed an external watermark retroactively.
 * This cannot validate the history of an existing real v1 ledger. */
function seedSyntheticAnchor(dir:string):void{
 const snap=readFileSync(join(dir,'aggregate.v1.json'),'utf8')
 const bytes=readFileSync(join(dir,'aggregate.v1.journal'))
 const replay=replayVerifiedV1SnapshotWal(snap,bytes)
 assert.equal(replay.status,'verified')
 assert.equal(replay.tornTail,false)
 const last=bytes.toString('utf8').trim().split('\n').filter(Boolean).at(-1)
 const mac=last?JSON.parse(last) as {seq:number;mac:string}:undefined
 const tipMac=mac?.seq===replay.sequence?mac!.mac:
  replay.sequence===0?null:'A'.repeat(43)
 writeFileSync(join(dir,'aggregate.v1.anchor'),JSON.stringify({version:1,
  sequence:replay.sequence,toolCalls:replay.totals!.toolCalls,tipMac}),{
   flag:'wx',mode:0o600})
}

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
  assert.equal(auditExperimentalWalAnchor(
   readFileSync(join(dir,'aggregate.v1.json'),'utf8'),Buffer.alloc(0),
   readFileSync(join(dir,'aggregate.v1.anchor'),'utf8')),'verified',
   'Independent mark must accept the fully committed checkpoint')
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
  assert.equal(auditExperimentalWalAnchor(snapshotText,oldWal,
   readFileSync(join(dir,'aggregate.v1.anchor'),'utf8')),'verified',
   'High-watermark must permit crash after snapshot rename with old WAL present')
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


test('native NTFS checkpoint cannot erase other DurableStats v1 counter families',{
 skip:process.platform!=='win32'&&'Native NTFS legacy v1 counter preservation only',timeout:85_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-writer-other-v1-counts-'))
 const dir=join(parent,'protected-existing-ledger')
 let writer:ExperimentalNtfsWalWriter|undefined
 try{
  assert.equal(createProtectedNtfsDirectory(dir),true)
  const day=new Date(now).toISOString().slice(0,10)
  const totals={turnStarts:2,turnEnds:1,toolCalls:0,toolResults:4,
   completedTurnMs:5000,checked:3,safe:2,review:1,targeted:0}
  const snapshot={version:1,secret:'ab'.repeat(32),sequence:1,
   totals,daily:{[day]:{...totals}},seen:[]}
  writeFileSync(join(dir,'aggregate.v1.json'),JSON.stringify(snapshot),{flag:'wx',mode:0o600})
  // A complete v1 ledger includes a WAL file even when all current
  // records are checkpointed. Missing-WAL fixtures are now intentionally
  // rejected instead of silently recreated by the writer.
  writeFileSync(join(dir,'aggregate.v1.journal'),'',{flag:'wx',mode:0o600})
  seedSyntheticAnchor(dir)
  writer=new ExperimentalNtfsWalWriter(dir)
  assert.deepEqual(writer.snapshot,{sequence:1,toolCalls:0})
  assert.equal(writer.recordSyntheticToolCall('new-tool','sandbox-agent','sandbox-session',now+3),true)
  writer.checkpointForTest()
  writer.close();writer=undefined
  const saved=JSON.parse(readFileSync(join(dir,'aggregate.v1.json'),'utf8'))
  for(const key of Object.keys(totals) as (keyof typeof totals)[]){
   const expected=totals[key]+(key==='toolCalls'?1:0)
   assert.equal(saved.totals[key],expected,'Aggregate counter was erased: '+key)
   assert.equal(saved.daily[day][key],expected,'Daily counter was erased: '+key)
  }
  assert.equal(saved.sequence,2)
  const verified=inspectPrivateNtfsWalReplay(dir)
  assert.equal(verified.status,'verified')
  assert.equal(verified.totals?.completedTurnMs,5000)
  assert.equal(verified.totals?.review,1)
  assert.equal(verified.totals?.toolCalls,1)
 }finally{writer?.close();rmSync(parent,{recursive:true,force:true})}
})


test('native Windows rejects exhausted v1 sequence BEFORE any WAL mutation',{
 skip:process.platform!=='win32'&&'NTFS maximum safe v1 sequence boundary only',timeout:80_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-writer-sequence-exhausted-'))
 const dir=join(parent,'protected-v1-ledger')
 let writer:ExperimentalNtfsWalWriter|undefined
 try{
  assert.equal(createProtectedNtfsDirectory(dir),true)
  const snapshot={version:1,secret:'cd'.repeat(32),sequence:Number.MAX_SAFE_INTEGER,
   totals:{turnStarts:0,turnEnds:0,toolCalls:0,toolResults:0,completedTurnMs:0,
    checked:0,safe:0,review:0,targeted:0},daily:{},seen:[]}
  const snap=join(dir,'aggregate.v1.json'),wal=join(dir,'aggregate.v1.journal')
  writeFileSync(snap,JSON.stringify(snapshot),{flag:'wx',mode:0o600})
  writeFileSync(wal,'',{flag:'wx',mode:0o600})
  seedSyntheticAnchor(dir)
  writer=new ExperimentalNtfsWalWriter(dir)
  const snapshotBefore=readFileSync(snap),walBefore=readFileSync(wal)
  assert.throws(()=>writer!.recordSyntheticToolCall('should-not-commit',
   'sandbox-agent','sandbox-session',now),/sequence exhausted/)
  assert.deepEqual(readFileSync(snap),snapshotBefore,'Snapshot must not mutate')
  assert.deepEqual(readFileSync(wal),walBefore,'No unsafe WAL row may be appended')
  writer.close();writer=undefined
  const verified=inspectPrivateNtfsWalReplay(dir)
  assert.equal(verified.status,'verified')
  assert.equal(verified.sequence,Number.MAX_SAFE_INTEGER)
  const reopened=new ExperimentalNtfsWalWriter(dir)
  writer=reopened
  assert.equal(reopened.snapshot.toolCalls,0)
  assert.equal(reopened.snapshot.sequence,Number.MAX_SAFE_INTEGER)
 }finally{writer?.close();rmSync(parent,{recursive:true,force:true})}
})

test('native NTFS checkpoint preserves mixed v1 counter families from already committed WAL',{
 skip:process.platform!=='win32'&&'NTFS production-v1 multi-family WAL checkpoint only',timeout:80_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-writer-multifamily-wal-'))
 const dir=join(parent,'protected-v1-ledger')
 let writer:ExperimentalNtfsWalWriter|undefined
 try{
  assert.equal(createProtectedNtfsDirectory(dir),true)
  const secret='ef'.repeat(32)
  const day=new Date(now).toISOString().slice(0,10)
  const initial={turnStarts:3,turnEnds:2,toolCalls:1,toolResults:1,
   completedTurnMs:99,checked:1,safe:1,review:0,targeted:0}
  const changes={turnStarts:2,turnEnds:1,toolCalls:1,toolResults:3,
   completedTurnMs:1234,checked:3,safe:1,review:1,targeted:1}
  const snapshot={version:1,secret,sequence:7,totals:initial,
   daily:{[day]:{...initial}},seen:[]}
  const fp='B'.repeat(43),seq=8,atMs=now
  const mac=createHmac('sha256',Buffer.from(secret,'hex'))
   .update(JSON.stringify([seq,fp,changes,atMs])).digest('base64url')
  const record={seq,fp,changes,atMs,mac}
  const snap=join(dir,'aggregate.v1.json'),wal=join(dir,'aggregate.v1.journal')
  writeFileSync(snap,JSON.stringify(snapshot),{flag:'wx',mode:0o600})
  writeFileSync(wal,JSON.stringify(record)+'\n',{flag:'wx',mode:0o600})
  seedSyntheticAnchor(dir)
  const before=replayVerifiedV1SnapshotWal(readFileSync(snap,'utf8'),readFileSync(wal))
  assert.equal(before.status,'verified')
  assert.equal(before.applied,1)
  writer=new ExperimentalNtfsWalWriter(dir)
  assert.deepEqual(writer.snapshot,{sequence:8,toolCalls:2})
  assert.equal(writer.recordSyntheticToolCall('followup','sandbox-agent','sandbox-session',now+1),true)
  writer.checkpointForTest()
  writer.close();writer=undefined
  const saved=JSON.parse(readFileSync(snap,'utf8'))
  for(const key of Object.keys(initial) as (keyof typeof initial)[]){
   const expected=initial[key]+changes[key]+Number(key==='toolCalls')
   assert.equal(saved.totals[key],expected,'WAL cumulative field lost: '+key)
   assert.equal(saved.daily[day][key],expected,'WAL daily field lost: '+key)
  }
  assert.equal(saved.sequence,9)
  assert.ok(saved.seen.includes(fp),'Committed WAL fingerprint must survive checkpoint')
  const verified=inspectPrivateNtfsWalReplay(dir)
  assert.equal(verified.status,'verified')
  assert.equal(verified.sequence,9)
  assert.deepEqual(verified.totals,saved.totals)
  writer=new ExperimentalNtfsWalWriter(dir)
  assert.equal(writer.recordSyntheticToolCall('followup','sandbox-agent','sandbox-session',now+1),false,
   'Repeated work event after mixed-family recovery and checkpoint must be deduplicated')
 }finally{writer?.close();rmSync(parent,{recursive:true,force:true})}
})


test('native NTFS missing existing WAL is a data-loss ambiguity, never recreated',{
 skip:process.platform!=='win32'&&'Native NTFS existing-ledger WAL absence only',timeout:105_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-writer-missing-wal-'))
 const dir=join(parent,'fresh-protected-ledger')
 let writer:ExperimentalNtfsWalWriter|undefined
 try{
  writer=new ExperimentalNtfsWalWriter(dir)
  const snap=join(dir,'aggregate.v1.json')
  const wal=join(dir,'aggregate.v1.journal')
  assert.equal(existsSync(wal),true,'Fresh ledger MUST include a private WAL')
  assert.equal(writer.recordSyntheticToolCall('committed-not-checkpointed',
   'sandbox-agent','sandbox-session',now),true)
  writer.close();writer=undefined
  const savedSnapshot=readFileSync(snap)
  const signedWal=readFileSync(wal)
  assert.notEqual(signedWal.length,0,'Fixture proves acknowledged work not in snapshot')
  assert.equal(replayVerifiedV1SnapshotWal(savedSnapshot.toString('utf8'),signedWal).totals?.toolCalls,1)
  // Synthetic external deletion: refuse reinitialization and preserve every
  // remaining byte. A fresh WAL would make work vanish on normal readback.
  unlinkSync(wal)
  assert.equal(inspectPrivateNtfsWalReplay(dir).status,'unconfirmed',
   'Read-only observer cannot certify missing WAL as intact storage')
  assert.throws(()=>new ExperimentalNtfsWalWriter(dir),
   /Missing existing WAL|Incomplete ledger/)
  assert.equal(existsSync(wal),false,'No empty replacement WAL is allowed')
  assert.deepEqual(readFileSync(snap),savedSnapshot,'Existing snapshot must not change')
  assert.equal(existsSync(join(dir,'aggregate.v1.lock')),false,
   'Owner may release only the lock acquired for its own failed open')
  // Even an apparently current (checkpointed) snapshot must be refused:
  // without external proof we cannot distinguish a legitimate empty WAL
  // from a deleted WAL containing newly committed events.
  const snapshot=JSON.parse(savedSnapshot.toString('utf8'))
  snapshot.sequence=17
  writeFileSync(snap,JSON.stringify(snapshot))
  assert.throws(()=>new ExperimentalNtfsWalWriter(dir),/Missing existing WAL/)
  assert.equal(existsSync(wal),false)
 }finally{writer?.close();rmSync(parent,{recursive:true,force:true})}
})


test('native NTFS v1 snapshot full dedup window rolls safely during WAL replay and checkpoint',{
 skip:process.platform!=='win32'&&'Native NTFS rolling v1 dedup capacity only',timeout:110_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-writer-rolling-dedup-'))
 const dir=join(parent,'private-v1-ledger')
 let writer:ExperimentalNtfsWalWriter|undefined
 try{
  assert.equal(createProtectedNtfsDirectory(dir),true)
  const secret='6b'.repeat(32),day=new Date(now).toISOString().slice(0,10)
  const seen=Array.from({length:16_384},(_,i)=>
   'A'.repeat(38)+i.toString(36).padStart(5,'0'))
  const original={turnStarts:2,turnEnds:2,toolCalls:4,toolResults:2,
   completedTurnMs:8_000,checked:2,safe:1,review:0,targeted:1}
  const snap=join(dir,'aggregate.v1.json'),wal=join(dir,'aggregate.v1.journal')
  writeFileSync(snap,JSON.stringify({version:1,secret,sequence:6,
   totals:original,daily:{[day]:{...original}},seen}),{mode:0o600,flag:'wx'})
  const fp='Z'.repeat(43),changes={toolCalls:1},atMs=now,seq=7
  const mac=createHmac('sha256',Buffer.from(secret,'hex'))
   .update(JSON.stringify([seq,fp,changes,atMs])).digest('base64url')
  writeFileSync(wal,JSON.stringify({seq,fp,changes,atMs,mac})+'\n',{
   mode:0o600,flag:'wx'})
  seedSyntheticAnchor(dir)
  writer=new ExperimentalNtfsWalWriter(dir)
  assert.deepEqual(writer.snapshot,{sequence:7,toolCalls:5})
  assert.equal(writer.recordSyntheticToolCall('new-rolling-event',
   'synthetic-agent','synthetic-session',now+1),true,
   'A valid full dedup window must rotate, not freeze the writer')
  writer.checkpointForTest()
  writer.close();writer=undefined
  const saved=JSON.parse(readFileSync(snap,'utf8'))
  assert.equal(saved.seen.length,16_384,'Checkpoint never exceeds v1 seen limit')
  assert.equal(saved.seen.includes(seen[0]),false,'Oldest fp evicted by signed WAL')
  assert.equal(saved.seen.includes(seen[1]),false,'Second-oldest fp evicted by new append')
  assert.equal(saved.seen.includes(seen[2]),true)
  assert.equal(saved.seen.includes(fp),true)
  assert.equal(saved.totals.toolCalls,6)
  assert.equal(saved.totals.completedTurnMs,original.completedTurnMs)
  assert.equal(saved.daily[day].toolCalls,6)
  assert.equal(inspectPrivateNtfsWalReplay(dir).status,'verified')
  writer=new ExperimentalNtfsWalWriter(dir)
  assert.equal(writer.recordSyntheticToolCall('new-rolling-event',
   'synthetic-agent','synthetic-session',now+1),false)
 }finally{writer?.close();rmSync(parent,{recursive:true,force:true})}
})

test('native NTFS external high-water mark refuses syntactically valid WAL suffix rollback',{
 skip:process.platform!=='win32'&&'Native witnessed WAL rollback refusal only',timeout:85_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-witnessed-rollback-'))
 const dir=join(parent,'private-new-ledger')
 let writer:ExperimentalNtfsWalWriter|undefined
 try{
  writer=new ExperimentalNtfsWalWriter(dir)
  assert.equal(writer.recordSyntheticToolCall('first','test-agent','test-session',now),true)
  assert.equal(writer.recordSyntheticToolCall('second','test-agent','test-session',now+1),true)
  writer.close();writer=undefined
  const snap=readFileSync(join(dir,'aggregate.v1.json'),'utf8')
  const wal=join(dir,'aggregate.v1.journal')
  const original=readFileSync(wal)
  const anchor=readFileSync(join(dir,'aggregate.v1.anchor'),'utf8')
  assert.equal(auditExperimentalWalAnchor(snap,original,anchor),'verified')
  assert.equal(inspectPrivateNtfsAnchoredWalReplay(dir),'verified')
  const truncated=Buffer.from(original.toString('utf8').split('\n')[0]+'\n')
  writeFileSync(wal,truncated)
  assert.equal(replayVerifiedV1SnapshotWal(snap,truncated).status,'verified',
   'Existing signed v1 verification CANNOT detect a removed complete tail')
  assert.equal(replayVerifiedV1SnapshotWal(snap,truncated).sequence,1)
  assert.equal(auditExperimentalWalAnchor(snap,truncated,anchor),'unconfirmed')
  assert.equal(inspectPrivateNtfsWalReplay(dir).status,'verified',
   'Legacy v1-only reader cannot prove the missing valid suffix')
  assert.equal(inspectPrivateNtfsAnchoredWalReplay(dir),'unconfirmed',
   'New research profile reader MUST reject the missing acknowledged suffix')
  assert.throws(()=>new ExperimentalNtfsWalWriter(dir),/WAL anchor mismatch/)
  assert.deepEqual(readFileSync(wal),truncated,
   'Failed owner must not repair, truncate or replace any suspect WAL bytes')
  assert.equal(existsSync(join(dir,'aggregate.v1.lock')),false)
  writeFileSync(wal,original)
  assert.equal(inspectPrivateNtfsAnchoredWalReplay(dir),'verified')
  writer=new ExperimentalNtfsWalWriter(dir)
  assert.deepEqual(writer.snapshot,{sequence:2,toolCalls:2})
  writer.close();writer=undefined
  unlinkSync(join(dir,'aggregate.v1.anchor'))
  assert.equal(inspectPrivateNtfsAnchoredWalReplay(dir),'unconfirmed')
  assert.throws(()=>new ExperimentalNtfsWalWriter(dir),/Missing independent WAL anchor/)
  assert.deepEqual(readFileSync(wal),original,
   'A disappeared witness is not permission to retroactively certify legacy data')
 }finally{writer?.close();rmSync(parent,{recursive:true,force:true})}
})

test('native NTFS failed watermark commit never acknowledges a stranded fsynced WAL row',{
 skip:process.platform!=='win32'&&'Native forced WAL-before-anchor crash-window only',timeout:80_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-witness-crash-window-'))
 const dir=join(parent,'private-new-ledger')
 let writer:ExperimentalNtfsWalWriter|undefined
 try{
  writer=new ExperimentalNtfsWalWriter(dir)
  assert.equal(writer.recordSyntheticToolCall('ack','test-agent','test-session',now),true)
  const oldAnchor=readFileSync(join(dir,'aggregate.v1.anchor'))
  assert.throws(()=>writer!.recordSyntheticToolCall('unack','test-agent',
   'test-session',now+1,()=>{throw Error('SYNTHETIC_CRASH_AFTER_WAL_FSYNC')}),
   /SYNTHETIC_CRASH_AFTER_WAL_FSYNC/)
  writer.close();writer=undefined
  const snap=readFileSync(join(dir,'aggregate.v1.json'),'utf8')
  const journal=readFileSync(join(dir,'aggregate.v1.journal'))
  assert.equal(replayVerifiedV1SnapshotWal(snap,journal).sequence,2,
   'Unacknowledged-but-fsynced journal bytes may exist after interruption')
  assert.deepEqual(readFileSync(join(dir,'aggregate.v1.anchor')),oldAnchor,
   'Watermark was NOT durably advanced, so we cannot acknowledge event two')
  assert.equal(auditExperimentalWalAnchor(snap,journal,oldAnchor.toString('utf8')),
   'unconfirmed','No automatic recovery from ambiguous partially committed I/O')
  assert.equal(inspectPrivateNtfsAnchoredWalReplay(dir),'unconfirmed')
  assert.throws(()=>new ExperimentalNtfsWalWriter(dir),/WAL anchor mismatch/)
  assert.deepEqual(readFileSync(join(dir,'aggregate.v1.journal')),journal)
 }finally{writer?.close();rmSync(parent,{recursive:true,force:true})}
})

test('native NTFS OS-killed writer after WAL fsync does not certify an older independent witness',{
 skip:process.platform!=='win32'&&'Native OS process kill between WAL and anchor fsync only',
 timeout:100_000,
},async()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-witness-killed-'))
 const dir=join(parent,'new-private-ledger')
 const program=`import {ExperimentalNtfsWalWriter} from ${JSON.stringify(source)};\n`+
  `const w=new ExperimentalNtfsWalWriter(process.env.PICKET_TEST_DIR);\n`+
  `w.recordSyntheticToolCall('witnessed','synthetic-agent','synthetic-session',${now});\n`+
  `w.recordSyntheticToolCall('wal-only','synthetic-agent','synthetic-session',${now+1},`+
   `()=>{process.stdout.write('WAL_ONLY_FSYNCED\\n');setInterval(()=>{},1000)});\n`
 let child:ChildProcess|undefined
 try{
  child=spawn(process.execPath,['--experimental-strip-types','--input-type=module','-e',program],{
   env:{...process.env,PICKET_TEST_DIR:dir},stdio:['ignore','pipe','pipe'],windowsHide:true,
  })
  await Promise.race([
   new Promise<void>((resolve,reject)=>{
    let output=''
    child!.stdout!.on('data',bytes=>{
     output+=String(bytes)
     if(output.includes('WAL_ONLY_FSYNCED'))resolve()
    })
    child!.once('error',reject)
    child!.once('exit',()=>reject(Error('Native child exited before WAL sync evidence')))
   }),
   new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('Timed out before WAL sync')),30_000)),
  ])
  const exited=new Promise<void>(resolve=>{
   if(child!.exitCode!==null||child!.signalCode!==null)resolve()
   else child!.once('exit',()=>resolve())
  })
  child.kill('SIGKILL')
  await Promise.race([exited,new Promise<never>((_,reject)=>
   setTimeout(()=>reject(Error('Terminated child did not exit')),15_000))])
  child=undefined
  const snap=readFileSync(join(dir,'aggregate.v1.json'),'utf8')
  const wal=readFileSync(join(dir,'aggregate.v1.journal'))
  const anchor=readFileSync(join(dir,'aggregate.v1.anchor'),'utf8')
  const v1=replayVerifiedV1SnapshotWal(snap,wal)
  assert.equal(v1.status,'verified')
  assert.equal(v1.sequence,2)
  assert.equal(v1.totals?.toolCalls,2)
  assert.equal(JSON.parse(anchor).sequence,1,
   'Independent witness must not pretend unacknowledged record was committed')
  assert.equal(auditExperimentalWalAnchor(snap,wal,anchor),'unconfirmed')
  assert.equal(inspectPrivateNtfsAnchoredWalReplay(dir),'unconfirmed')
  assert.equal(existsSync(join(dir,'aggregate.v1.lock')),true,
   'Crashed owner lock cannot be silently deleted')
  assert.throws(()=>new ExperimentalNtfsWalWriter(dir),/existing lock or recovery/)
  assert.deepEqual(readFileSync(join(dir,'aggregate.v1.journal')),wal,
   'Neither failure nor observer may truncate the unconfirmed work')
 }finally{child?.kill('SIGKILL');rmSync(parent,{recursive:true,force:true})}
})
