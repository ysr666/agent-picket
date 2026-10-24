import assert from 'node:assert/strict'
import test from 'node:test'
import {canHoldCodexClientNewTurn,gateCodexClientNewTurn} from
 '../src/adapters/codex/client-new-turn-gate.ts'

const id='01a130a8-5533-7843-9fac-c79eb8f185af'
const authorized=()=>({
 source:'verified-owner-control-plane',threadId:id,
 ownerVerified:true,realStrikeOptIn:true,unionHoldAuthorized:true,
 unionHoldActive:true,turnState:'idle',canShowPreSubmitNotice:true,
})
test('a correctly authorized hold stops BEFORE reading text/files or invoking turn/start',async()=>{
 let materialized=0,turnsStarted=0
 const result=await gateCodexClientNewTurn({readHostProof:async()=>authorized()},
  id,async()=>{materialized++;turnsStarted++;return 'executed'})
 assert.deepEqual(result,{action:'held',notice:'union-new-work-hold'})
 assert.equal(materialized,0)
 assert.equal(turnsStarted,0)
})
test('must never block from an ambiguous client, forged thread, or missing notice',async()=>{
 for(const patch of [
  {ownerVerified:false},{realStrikeOptIn:false},
  {unionHoldAuthorized:false},{unionHoldActive:false},
  {canShowPreSubmitNotice:false},{turnState:'running'},
  {turnState:'unconfirmed'},{threadId:'not-the-session'},
  {source:'local-user-preference'},
 ]){
  let sends=0
  const admission={...authorized(),...patch}
  assert.equal(canHoldCodexClientNewTurn(admission,id),false)
  const r=await gateCodexClientNewTurn({
   readHostProof:async()=>admission,
  },id,async()=>{sends++;return 'native-submission'})
  assert.deepEqual(r,{action:'submitted',result:'native-submission'})
  assert.equal(sends,1)
 }
 for(const malformed of [undefined,null,{},'held',[],{...authorized(),turnState:undefined}]){
  assert.equal(canHoldCodexClientNewTurn(malformed,id),false)
 }
})
test('Host unknown/error fails open rather than silently losing input',async()=>{
 let invoked=0
 for(const source of [
  undefined,
  {readHostProof:async()=>{throw Error('Host disconnected')}},
 ]){
  const result=await gateCodexClientNewTurn(source,id,async()=>{
   invoked++
   return 'submitted by original client'
  })
  assert.deepEqual(result,{action:'submitted',result:'submitted by original client'})
 }
 assert.equal(invoked,2)
 const rejected=await gateCodexClientNewTurn(undefined,id,async()=>{
  throw Error('real native turn/start failed')
 })
 assert.equal(rejected.action,'host-error')
})
test('explicit human recovery clears hold; does not replay earlier submission',async()=>{
 let held=true,created=0
 const host={readHostProof:async()=>({...authorized(),unionHoldActive:held})}
 const start=async()=>{created++;return created}
 const first=await gateCodexClientNewTurn(host,id,start)
 assert.equal(first.action,'held')
 assert.equal(created,0)
 // This is a TEST-ONLY trusted Host change, not an implicit timer resume.
 held=false
 const second=await gateCodexClientNewTurn(host,id,start)
 assert.deepEqual(second,{action:'submitted',result:1})
 assert.equal(created,1)
})
