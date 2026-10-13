import assert from 'node:assert/strict'
import test from 'node:test'
import {createHmac} from 'node:crypto'
import {auditExperimentalWalAnchor,inspectPrivateNtfsAnchoredWalReplay,validExperimentalWalAnchor} from '../src/adapters/node/windows-wal-anchor.experimental.ts'
import {replayVerifiedV1SnapshotWal} from '../src/adapters/node/windows-wal-replay.ts'
const zero={turnStarts:0,turnEnds:0,toolCalls:0,toolResults:0,
 completedTurnMs:0,checked:0,safe:0,review:0,targeted:0}
const secret='a7'.repeat(32),atMs=1760000000000
const snapshot=(sequence:number,toolCalls:number)=>JSON.stringify({
 version:1,secret,sequence,totals:{...zero,toolCalls},daily:{},seen:[],
})
const make=(seq:number)=>{
 const fp=String(seq).padStart(43,'A'),changes={toolCalls:1}
 const mac=createHmac('sha256',Buffer.from(secret,'hex'))
  .update(JSON.stringify([seq,fp,changes,atMs])).digest('base64url')
 return {seq,fp,changes,atMs,mac}
}
const row1=make(1),row2=make(2)
const lines=(...rows:ReturnType<typeof make>[])=>
 Buffer.from(rows.map(x=>JSON.stringify(x)+'\n').join(''))
const anchor=(snap:string,wal:Buffer,seq:number,toolCalls:number,mac:string|null)=>
 JSON.stringify({version:2,sequence:seq,toolCalls,tipMac:mac,
  stateDigest:replayVerifiedV1SnapshotWal(snap,wal).stateDigest})

test('independent research watermark spots a missing fully valid WAL suffix',()=>{
 const snap=snapshot(0,0),original=lines(row1,row2)
 const trusted=anchor(snap,original,2,2,row2.mac)
 assert.equal(auditExperimentalWalAnchor(snap,original,trusted),'verified')
 const truncated=lines(row1)
 assert.deepEqual(replayVerifiedV1SnapshotWal(snap,truncated).status,'verified',
  'Original HMAC v1 replay cannot detect a deleted complete signed suffix')
 assert.equal(auditExperimentalWalAnchor(snap,truncated,trusted),'unconfirmed',
  'Independent durable high-watermark must reject silent rollback')
 assert.equal(auditExperimentalWalAnchor(snap,Buffer.alloc(0),trusted),'unconfirmed')
 assert.equal(auditExperimentalWalAnchor(snap,original,anchor(snap,original,3,3,row2.mac)),'unconfirmed')
 assert.equal(auditExperimentalWalAnchor(snap,original,anchor(snap,original,2,2,row1.mac)),'unconfirmed')
 assert.equal(auditExperimentalWalAnchor(snap,original,anchor(snap,original,2,3,row2.mac)),'unconfirmed')
})
test('legitimate checkpoint and pre-WAL-rotation crash windows remain inspectable',()=>{
 const prior=lines(row1,row2)
 const checkpoint=JSON.stringify({...JSON.parse(snapshot(2,2)),
  daily:{[new Date(atMs).toISOString().slice(0,10)]:{...zero,toolCalls:2}},
  seen:[row1.fp,row2.fp],
 })
 const trusted=anchor(snapshot(0,0),prior,2,2,row2.mac)
 assert.equal(auditExperimentalWalAnchor(checkpoint,prior,trusted),'verified',
  'A checkpointed snapshot may coexist with the old fully fsynced WAL')
 assert.equal(auditExperimentalWalAnchor(checkpoint,Buffer.alloc(0),trusted),'verified',
  'Committed snapshot plus freshly swapped WAL has same high-water mark')
 assert.equal(auditExperimentalWalAnchor(snapshot(1,1),Buffer.alloc(0),trusted),'unconfirmed')
 assert.equal(auditExperimentalWalAnchor(snapshot(3,3),Buffer.alloc(0),trusted),'unconfirmed',
  'An anchor lag after fsynced WAL must never be silently accepted')
})
test('synthetic anchor decoder rejects bad shape, bytes, negative and corrupt values',()=>{
 assert.equal(validExperimentalWalAnchor(JSON.parse(anchor(snapshot(0,0),Buffer.alloc(0),0,0,null))),true)
 assert.equal(validExperimentalWalAnchor(JSON.parse(anchor(snapshot(0,0),lines(row1,row2),2,2,row2.mac))),true)
 for(const v of [{version:2,sequence:0,toolCalls:0,tipMac:row2.mac,stateDigest:'A'.repeat(43)},
  {version:2,sequence:1,toolCalls:1,tipMac:null,stateDigest:'A'.repeat(43)},
  {version:2,sequence:1,toolCalls:-1,tipMac:row1.mac,stateDigest:'A'.repeat(43)},
  {version:2,sequence:1.5,toolCalls:1,tipMac:row1.mac,stateDigest:'A'.repeat(43)},
  {version:2,sequence:1,toolCalls:1,tipMac:row1.mac,stateDigest:'A'.repeat(43),unexpected:1},
  {version:2,sequence:Number.MAX_SAFE_INTEGER+1,toolCalls:1,tipMac:row1.mac,stateDigest:'A'.repeat(43)},
  {version:1,sequence:1,toolCalls:1,tipMac:row1.mac},
  {version:2,sequence:1,toolCalls:1,tipMac:row1.mac,stateDigest:'bad'},
 ])assert.equal(validExperimentalWalAnchor(v),false)
 for(const v of ['{}','bad-json',' '.repeat(513)])assert.equal(
  auditExperimentalWalAnchor(snapshot(0,0),Buffer.alloc(0),v),'unconfirmed')
})


test('the anchored read-only filesystem inspector is fail-closed off NTFS',()=>{
 if(process.platform!=='win32')assert.equal(
  inspectPrivateNtfsAnchoredWalReplay('/nonexistent/synthetic-ledger'),'unconfirmed')
})

test('native test harness synchronous crash marker really blocks until process termination',{
 timeout:15_000,
},async()=>{
 const {spawn}=await import('node:child_process')
 // Unlike setInterval, Atomics.wait blocks the CURRENT callback. sync stdout
 // guarantees the parent can witness the exact boundary before termination.
 const code="import {writeSync} from 'node:fs';"+
  "writeSync(1,'AT_SYNC_BOUNDARY\\n');"+
  'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);'+
  "writeSync(1,'UNSAFE_AFTER_BOUNDARY\\n');"
 const child=spawn(process.execPath,['--input-type=module','-e',code],{
  stdio:['ignore','pipe','pipe'],windowsHide:true,
 })
 let output=''
 try{
  const marker=new Promise<void>((resolve,reject)=>{
   child.stdout!.on('data',data=>{
    output+=String(data)
    if(output.includes('AT_SYNC_BOUNDARY'))resolve()
   })
   child.once('error',reject)
   child.once('exit',()=>reject(Error('Crash marker child exited too early')))
  })
  await Promise.race([marker,new Promise<never>((_,reject)=>
   setTimeout(()=>reject(Error('Synchronous marker not observed')),5_000).unref())])
  await new Promise(resolve=>setTimeout(resolve,100))
  assert.doesNotMatch(output,/UNSAFE_AFTER_BOUNDARY/,
   'The test hook MUST remain stopped, not merely schedule an interval')
  const exited=new Promise<void>(resolve=>{
   if(child.exitCode!==null||child.signalCode!==null)resolve()
   else child.once('exit',()=>resolve())
  })
  child.kill('SIGKILL')
  await Promise.race([exited,new Promise<never>((_,reject)=>
   setTimeout(()=>reject(Error('Synthetic crash hook did not terminate')),5_000).unref())])
  assert.doesNotMatch(output,/UNSAFE_AFTER_BOUNDARY/)
 }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')}
})

test('v2 anchor binds every recovered counter, day, dedup fingerprint and secret',()=>{
 const day=new Date(atMs).toISOString().slice(0,10)
 const original=JSON.stringify({version:1,secret,sequence:2,
  totals:{...zero,toolCalls:2,turnStarts:3,completedTurnMs:600},
  daily:{[day]:{...zero,toolCalls:2,turnStarts:3,completedTurnMs:600}},
  seen:[row1.fp,row2.fp],
 })
 const wal=Buffer.alloc(0)
 const trusted=anchor(original,wal,2,2,row2.mac)
 assert.equal(auditExperimentalWalAnchor(original,wal,trusted),'verified')
 const mutate=(fn:(v:any)=>void)=>{
  const v=JSON.parse(original)
  fn(v)
  const altered=JSON.stringify(v)
  assert.equal(replayVerifiedV1SnapshotWal(altered,wal).status,'verified',
   'Legacy v1 reader does not authenticate snapshots against external anchor')
  assert.equal(auditExperimentalWalAnchor(altered,wal,trusted),'unconfirmed',
   'Witness must bind the entire recovered logical state')
 }
 mutate(v=>{v.totals.turnStarts=0})
 mutate(v=>{v.totals.completedTurnMs=0})
 mutate(v=>{v.daily[day].turnStarts=0})
 mutate(v=>{v.daily[day].toolCalls=0})
 mutate(v=>{v.seen.pop()})
 mutate(v=>{v.seen.reverse()})
 mutate(v=>{v.secret='f0'.repeat(32)})
 assert.equal(validExperimentalWalAnchor(JSON.parse(trusted)),true)
})
