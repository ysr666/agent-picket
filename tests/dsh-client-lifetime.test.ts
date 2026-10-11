import assert from 'node:assert/strict'
import test from 'node:test'
import { createBrowserLifetimeWorkReader } from '../src/adapters/dsh/client-lifetime.ts'

const stamp=Date.parse('2026-10-11T12:00:00Z')
const zero={turnStarts:1,turnEnds:1,toolCalls:3,toolResults:3,completedTurnMs:9000}
function response(days:7|30=7){
 const dates=Array.from({length:days},(_,i)=>({
  day:new Date(Date.UTC(2026,9,11)-(days-1-i)*86_400_000).toISOString().slice(0,10),
  work:{...zero},
 }))
 return {schemaVersion:1,source:'dsh-host-durable-work',
  windowDays:days,generatedAtMs:stamp,
  durationBasis:'completed-turn-wall-clock-including-waits',
  lifetime:{...zero},recentDays:dates}
}
const fetchOk=(d:7|30=7)=>Promise.resolve(new Response(JSON.stringify(response(d)),{status:200}))
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
test('no fetch before official opt-in, clean disposal and no storage',async()=>{
 let allowed=false,calls=0
 const read=createBrowserLifetimeWorkReader({
  authorized:()=>allowed,
  fetcher:async()=>{calls++;return fetchOk()},
 })
 assert.equal(read.snapshot().status,'off')
 read.setScope(false,'session-1')
 await settle()
 assert.equal(calls,0)
 allowed=true
 read.setScope(true,'session-1')
 await settle()
 assert.equal(calls,1)
 assert.equal(read.snapshot().status,'available')
 assert.equal(read.snapshot().data?.lifetime.completedTurnMs,9000)
 read.dispose()
 assert.equal(read.snapshot().data,null)
 assert.equal(read.snapshot().status,'off')
 read.setScope(true,'session-2')
 await settle()
 assert.equal(calls,1)
})
test('authorization revocation synchronously removes cached personal aggregates',async()=>{
 let authorized=true
 const reader=createBrowserLifetimeWorkReader({authorized:()=>authorized,
  fetcher:()=>fetchOk()})
 reader.setScope(true,'session-a')
 await settle()
 assert.equal(reader.snapshot().status,'available')
 authorized=false
 assert.deepEqual(reader.snapshot(),{status:'off',data:null},
   'even before Host change notification, read must fail closed')
 reader.setScope(false,'session-a')
 assert.deepEqual(reader.snapshot(),{status:'off',data:null})
 authorized=true
 reader.setScope(true,'session-a')
 await settle()
 assert.equal(reader.snapshot().status,'available')
})
test('session swap and in-flight revoke cannot resurrect a stale response',async()=>{
 let allowed=true
 let releases:Array<(result:Response)=>void>=[]
 const read=createBrowserLifetimeWorkReader({
  authorized:()=>allowed,
  fetcher:()=>new Promise<Response>(resolve=>{releases.push(resolve)}),
 })
 read.setScope(true,'private-a')
 assert.equal(read.snapshot().status,'loading')
 read.setScope(true,'private-b')
 assert.equal(read.snapshot().status,'loading')
 assert.equal(releases.length,2)
 releases[0]!(new Response(JSON.stringify(response())))
 await settle()
 assert.equal(read.snapshot().status,'loading')
 allowed=false;read.setScope(false,null)
 releases[1]!(new Response(JSON.stringify(response())))
 await settle()
 assert.deepEqual(read.snapshot(),{status:'off',data:null})
})
test('explicit 30-day refresh changes requested horizon, not cached 7-day response',async()=>{
 const sent:string[]=[]
 const reader=createBrowserLifetimeWorkReader({authorized:()=>true,
  fetcher:async (url)=>{sent.push(String(url));return fetchOk(
    String(url).includes('windowDays=30')?30:7)},
 })
 reader.setScope(true,'a')
 await settle()
 assert.equal(reader.snapshot().data?.recentDays.length,7)
 await reader.refresh(30)
 assert.equal(reader.snapshot().data?.recentDays.length,30)
 assert.equal(sent.length,2)
 assert.match(sent[0]!,/windowDays=7$/)
 assert.match(sent[1]!,/windowDays=30$/)
})
test('malformed aggregate with injected text and classification is rejected',async()=>{
 const dirty={...response(),lifetime:{...zero,targeted:12},prompt:'secret'}
 const reader=createBrowserLifetimeWorkReader({authorized:()=>true,
  fetcher:async()=>new Response(JSON.stringify(dirty))})
 reader.setScope(true,'s')
 await settle()
 assert.deepEqual(reader.snapshot(),{status:'unavailable',data:null})
})
test('HTTP 403 and 401 produce unavailable, never a zero-work claim',async()=>{
 for(const code of [401,403,503]){
  const reader=createBrowserLifetimeWorkReader({authorized:()=>true,
   fetcher:async()=>new Response('denied',{status:code})})
  reader.setScope(true,'s');await settle()
  assert.equal(reader.snapshot().status,'unavailable')
  assert.equal(reader.snapshot().data,null)
 }
})
