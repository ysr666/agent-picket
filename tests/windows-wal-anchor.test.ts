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
const anchor=(seq:number,toolCalls:number,mac:string|null)=>
 JSON.stringify({version:1,sequence:seq,toolCalls,tipMac:mac})

test('independent research watermark spots a missing fully valid WAL suffix',()=>{
 const snap=snapshot(0,0),original=lines(row1,row2)
 assert.equal(auditExperimentalWalAnchor(snap,original,anchor(2,2,row2.mac)),'verified')
 const truncated=lines(row1)
 assert.deepEqual(replayVerifiedV1SnapshotWal(snap,truncated).status,'verified',
  'Original HMAC v1 replay cannot detect a deleted complete signed suffix')
 assert.equal(auditExperimentalWalAnchor(snap,truncated,anchor(2,2,row2.mac)),'unconfirmed',
  'Independent durable high-watermark must reject silent rollback')
 assert.equal(auditExperimentalWalAnchor(snap,Buffer.alloc(0),anchor(2,2,row2.mac)),'unconfirmed')
 assert.equal(auditExperimentalWalAnchor(snap,original,anchor(3,3,row2.mac)),'unconfirmed')
 assert.equal(auditExperimentalWalAnchor(snap,original,anchor(2,2,row1.mac)),'unconfirmed')
 assert.equal(auditExperimentalWalAnchor(snap,original,anchor(2,3,row2.mac)),'unconfirmed')
})
test('legitimate checkpoint and pre-WAL-rotation crash windows remain inspectable',()=>{
 const checkpoint=snapshot(2,2),prior=lines(row1,row2)
 const trusted=anchor(2,2,row2.mac)
 assert.equal(auditExperimentalWalAnchor(checkpoint,prior,trusted),'verified',
  'A checkpointed snapshot may coexist with the old fully fsynced WAL')
 assert.equal(auditExperimentalWalAnchor(checkpoint,Buffer.alloc(0),trusted),'verified',
  'Committed snapshot plus freshly swapped WAL has same high-water mark')
 assert.equal(auditExperimentalWalAnchor(snapshot(1,1),Buffer.alloc(0),trusted),'unconfirmed')
 assert.equal(auditExperimentalWalAnchor(snapshot(3,3),Buffer.alloc(0),trusted),'unconfirmed',
  'An anchor lag after fsynced WAL must never be silently accepted')
})
test('synthetic anchor decoder rejects bad shape, bytes, negative and corrupt values',()=>{
 assert.equal(validExperimentalWalAnchor(JSON.parse(anchor(0,0,null))),true)
 assert.equal(validExperimentalWalAnchor(JSON.parse(anchor(2,2,row2.mac))),true)
 for(const v of [{version:1,sequence:0,toolCalls:0,tipMac:row2.mac},
  {version:1,sequence:1,toolCalls:1,tipMac:null},
  {version:1,sequence:1,toolCalls:-1,tipMac:row1.mac},
  {version:1,sequence:1.5,toolCalls:1,tipMac:row1.mac},
  {version:1,sequence:1,toolCalls:1,tipMac:row1.mac,unexpected:1},
  {version:1,sequence:Number.MAX_SAFE_INTEGER+1,toolCalls:1,tipMac:row1.mac},
 ])assert.equal(validExperimentalWalAnchor(v),false)
 for(const v of ['{}','bad-json',' '.repeat(513)])assert.equal(
  auditExperimentalWalAnchor(snapshot(0,0),Buffer.alloc(0),v),'unconfirmed')
})


test('the anchored read-only filesystem inspector is fail-closed off NTFS',()=>{
 if(process.platform!=='win32')assert.equal(
  inspectPrivateNtfsAnchoredWalReplay('/nonexistent/synthetic-ledger'),'unconfirmed')
})
