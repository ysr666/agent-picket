import assert from 'node:assert/strict'
import test from 'node:test'
import { projectLifetimeWork, registerDshLifetimeWorkRpc,
  LIFETIME_WORK_RPC_CHANNEL,LIFETIME_WORK_RPC_ENDPOINT } from '../src/adapters/dsh/lifetime-work-rpc.ts'

const blank=()=>({turnStarts:3,turnEnds:2,toolCalls:5,toolResults:5,
 completedTurnMs:67_000,checked:9,safe:4,review:3,targeted:2,
 prompt:'SECRET_MESSAGE',sessionId:'private-session',fingerprint:'PRIVATE'})
const today=Date.parse('2026-10-11T12:00:00Z')
test('work-only projection excludes all abusive verdict counters and raw fields',()=>{
 const output=projectLifetimeWork(blank(),[
  {day:'2026-10-10',totals:blank()}],7,today)
 const text=JSON.stringify(output)
 for(const secret of ['checked','targeted','safe','review','SECRET_MESSAGE','sessionId','fingerprint']){
  assert.equal(text.includes(secret),false,secret)
 }
 assert.equal(output.lifetime.completedTurnMs,67000)
 assert.equal(output.recentDays.length,7)
 assert.equal(output.recentDays.at(-2)?.work.completedTurnMs,67000)
 assert.equal(output.recentDays.at(-1)?.work.completedTurnMs,0)
})
test('reject unsafe metrics and malformed date/duplicates',()=>{
 assert.throws(()=>projectLifetimeWork({...blank(),toolCalls:-1},[],7,today))
 assert.throws(()=>projectLifetimeWork(blank(),[{day:'2026-02-29',totals:blank()}],7,today))
 assert.throws(()=>projectLifetimeWork(blank(),[
  {day:'2026-10-10',totals:blank()}, {day:'2026-10-10',totals:blank()}],7,today))
})
test('the registered official channel denies on OFF, invalid payload and revoke-in-flight',async()=>{
 let handler:((endpoint:string,payload:unknown,signal:AbortSignal,peer:unknown)=>Promise<any>)|undefined
 let unregistered=0
 let cleanup=()=>{}
 const ctx={
  effect(fn:()=>()=>void){cleanup=fn()},
  inject(_services:string[],fn:(s:any)=>void){fn({connection:{rpc:{
   handle(channel:string,h:typeof handler){
    assert.equal(channel,LIFETIME_WORK_RPC_CHANNEL);handler=h
    return async()=>{unregistered++}
   },
  }}})},
 }
 let enabled=true,read=0
 registerDshLifetimeWorkRpc(ctx,{
  authorized:()=>enabled,
  store:()=>({snapshot(){read++;return blank()},snapshotDays(){return []}}),
  now:()=>today,
 })
 const invoke=(payload:unknown,signal=new AbortController().signal)=>
  handler!(LIFETIME_WORK_RPC_ENDPOINT,payload,signal,{})
 enabled=false
 assert.equal((await invoke({windowDays:7})).error.code,'not_authorized')
 assert.equal(read,0)
 enabled=true
 assert.equal((await invoke({windowDays:7,extra:'private'})).error.code,'invalid_request')
 assert.equal(read,0)
 assert.equal((await invoke({windowDays:7})).ok,true)
 assert.equal(read,1)
 enabled=false
 const d=await invoke({windowDays:7})
 assert.equal(d.ok,false)
 cleanup()
 assert.equal((await invoke({windowDays:7})).ok,false)
 assert.equal(unregistered,1)
})
test('unsupported Host does not register any surface or throw',()=>{
 registerDshLifetimeWorkRpc({}, {authorized:()=>true,store:()=>undefined})
})

test('lifetime service follows a replaced Host Connection without stale handler reuse',async()=>{
 let reconnect:((child:any)=>void)|undefined
 const callbacks:Array<()=>void>=[]
 let calls=0,shutdowns=0
 const ctx={
  effect(fn:()=>()=>void){callbacks.push(fn())},
  inject(_deps:string[],fn:(child:any)=>void){reconnect=fn},
 }
 registerDshLifetimeWorkRpc(ctx,{
  authorized:()=>true,
  store:()=>({snapshot:()=>blank(),snapshotDays:()=>[]}),now:()=>today,
 })
 const makeHost=()=>{
  let ownShutdown:()=>void=()=>{}
  const host={connection:{rpc:{handle(_channel:string,fn:unknown){
   calls++
   assert.equal(typeof fn,'function')
   return async()=>{shutdowns++}
  }}},effect(fn:()=>()=>void){ownShutdown=fn()}}
  reconnect!(host)
  return ()=>ownShutdown()
 }
 const stopFirst=makeHost()
 assert.equal(calls,1)
 stopFirst()
 const stopSecond=makeHost()
 assert.equal(calls,2,'new trusted Connection must get a new endpoint')
 stopSecond()
 callbacks.forEach(fn=>fn())
 assert.ok(shutdowns>=2)
})
