import assert from 'node:assert/strict'
import test from 'node:test'
import {createHmac} from 'node:crypto'
import {DurableStats} from '../src/adapters/node/durable-stats.ts'
import {mkdtempSync,writeFileSync,readFileSync,rmSync,appendFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createProtectedNtfsDirectory} from '../src/adapters/node/windows-private-acl.ts'
import {inspectPrivateNtfsWalReplay,replayVerifiedV1SnapshotWal} from '../src/adapters/node/windows-wal-replay.ts'
const secret='af'.repeat(32)
const fp=(v:string)=>Buffer.from(v.padEnd(32,'_')).toString('base64url').slice(0,43)
const emptyTotals={turnStarts:0,turnEnds:0,toolCalls:0,toolResults:0,completedTurnMs:0,
 checked:0,safe:0,review:0,targeted:0}
const snapshot=(seq=0,tools=0)=>JSON.stringify({version:1,secret,sequence:seq,
 totals:{...emptyTotals,toolCalls:tools},daily:{},seen:seq?[fp('one')]:[]})
const row=(seq:number,id:string,value=1)=>{
 const fpValue=fp(id),atMs=1_760_000_000_000,changes={toolCalls:value}
 const mac=createHmac('sha256',Buffer.from(secret,'hex'))
  .update(JSON.stringify([seq,fpValue,changes,atMs])).digest('base64url')
 return JSON.stringify({seq,fp:fpValue,changes,atMs,mac})+'\n'
}
const journal=(...rows:string[])=>Buffer.from(rows.join(''),'utf8')

test('real v1 SHA256/HMAC WAL counts exactly once and identifies torn tail without writing',()=>{
 const first=row(1,'one'),second=row(2,'two'),third=row(3,'three')
 const bytes=journal(first,second,third.slice(0,28))
 const original=Buffer.from(bytes)
 const result=replayVerifiedV1SnapshotWal(snapshot(),bytes)
 assert.equal(result.status,'verified')
 assert.equal(result.sequence,2)
 assert.equal(result.applied,2)
 assert.equal(result.totals?.toolCalls,2)
 assert.equal(result.tornTail,true)
 assert.deepEqual(bytes,original,'The verifier must not truncate torn tails')
})
test('crash after reset snapshot but before old WAL replacement does not resurrect erased work',()=>{
 const previousSecret=secret
 const postResetSecret='ce'.repeat(32)
 const old=journal(row(1,'one'))
 const reset=JSON.stringify({version:1,secret:postResetSecret,sequence:1,
  totals:{...emptyTotals},daily:{},seen:[]})
 const restored=replayVerifiedV1SnapshotWal(reset,old)
 assert.equal(restored.status,'verified',
  'Reset rotates the key; committed old entries are skipped by sequence, not new-key MAC')
 assert.equal(restored.sequence,1)
 assert.equal(restored.applied,0)
 assert.equal(restored.totals?.toolCalls,0)
 assert.equal(previousSecret.length,64)
})

test('actual DurableStats-signed WAL is accepted with matching counters and no content mutation',{
 skip:process.platform==='win32'&&'Windows DurableStats stays disabled',
},()=>{
 const dir=mkdtempSync(join(tmpdir(),'ap-v1-interoperability-'))
 try{
  const ledger=new DurableStats(dir)
  ledger.recordWork({type:'tool-start',id:'real-event-one',agentId:'private-agent',
   sessionId:'private-session',recordedAtMs:1_760_000_000_000})
  ledger.recordWork({type:'tool-start',id:'real-event-two',agentId:'private-agent',
   sessionId:'private-session',recordedAtMs:1_760_000_000_020})
  ledger.close()
  const sn=readFileSync(join(dir,'aggregate.v1.json'),'utf8')
  const w=readFileSync(join(dir,'aggregate.v1.journal'))
  const result=replayVerifiedV1SnapshotWal(sn,w)
  assert.equal(result.status,'verified')
  assert.equal(result.sequence,2)
  assert.equal(result.applied,2)
  assert.equal(result.totals?.toolCalls,2)
  assert.deepEqual(readFileSync(join(dir,'aggregate.v1.journal')),w)
  assert.doesNotMatch(JSON.stringify(result),/private-agent|private-session|real-event/)
 }finally{rmSync(dir,{recursive:true,force:true})}
})

test('committed snapshot and old journal rows do not count again',()=>{
 const parsed=replayVerifiedV1SnapshotWal(snapshot(1,1),journal(row(1,'one'),row(2,'two')))
 assert.equal(parsed.status,'verified')
 assert.equal(parsed.totals?.toolCalls,2)
 assert.equal(parsed.applied,1)
})
test('committed corrupt MAC, duplicate seq, gap, duplicate fingerprint, invalid snapshot all fail closed',()=>{
 const good=row(1,'one')
 const invalid=[
  journal(good.replace('"toolCalls":1','"toolCalls":2')),
  journal(good,good),
  journal(row(2,'two')),
  journal(row(1,'one'),row(2,'one')),
  journal('{"oops":1}\n'),
 ]
 for(const bytes of invalid)assert.equal(replayVerifiedV1SnapshotWal(snapshot(),bytes).status,'unconfirmed')
 assert.equal(replayVerifiedV1SnapshotWal('{"bad":true}',journal(good)).status,'unconfirmed')
})
test('native Windows disk layout WAL recovery reads signed records and refuses unknown/active locks',{
 skip:process.platform!=='win32'&&'Real NTFS replay verification only',timeout:75_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'ap-wal-ntfs-recovery-'))
 const dir=join(parent,'secured-ledger')
 try{
  assert.equal(createProtectedNtfsDirectory(dir),true)
  const snapPath=join(dir,'aggregate.v1.json'),walPath=join(dir,'aggregate.v1.journal')
  writeFileSync(snapPath,snapshot(),{mode:0o600,flag:'wx'})
  writeFileSync(walPath,row(1,'one'),{mode:0o600,flag:'wx'})
  appendFileSync(walPath,row(2,'two'))
  const saved=readFileSync(walPath)
  const good=inspectPrivateNtfsWalReplay(dir)
  assert.equal(good.status,'verified')
  assert.equal(good.totals?.toolCalls,2)
  assert.equal(good.sequence,2)
  assert.deepEqual(readFileSync(walPath),saved,'No modification during verification')
  appendFileSync(walPath,'{"seq":3,"half":"not fsynced')
  const interrupted=readFileSync(walPath)
  const torn=inspectPrivateNtfsWalReplay(dir)
  assert.equal(torn.status,'verified')
  assert.equal(torn.sequence,2)
  assert.equal(torn.tornTail,true)
  assert.deepEqual(readFileSync(walPath),interrupted,
    'Read-only replay must not truncate a torn final WAL row')
  writeFileSync(walPath,row(1,'one').replace('"toolCalls":1','"toolCalls":2'))
  const corrupt=readFileSync(walPath)
  assert.equal(inspectPrivateNtfsWalReplay(dir).status,'unconfirmed',
    'A fully committed corrupt row must fail without editing it')
  assert.deepEqual(readFileSync(walPath),corrupt)
  writeFileSync(walPath,saved)
  writeFileSync(join(dir,'aggregate.v1.lock'),'not-yet-proven',{flag:'wx',mode:0o600})
  assert.equal(inspectPrivateNtfsWalReplay(dir).status,'unconfirmed')
 }finally{rmSync(parent,{recursive:true,force:true})}
})
