import assert from 'node:assert/strict'
import test from 'node:test'
import { projectLifetimeWork, registerDshLifetimeWorkFetch,
  LIFETIME_WORK_FETCH_PATH } from '../src/adapters/dsh/lifetime-work-rpc.ts'

const blank=()=>({turnStarts:3,turnEnds:2,toolCalls:5,toolResults:5,
 completedTurnMs:67_000,checked:9,safe:4,review:3,targeted:2,
 prompt:'SECRET_MESSAGE',sessionId:'private-session',fingerprint:'PRIVATE'})
const today=Date.parse('2026-10-11T12:00:00Z')
test('work-only projection excludes all abusive verdict counters and raw fields',()=>{
 const output=projectLifetimeWork(blank(),[
  {day:'2026-10-10',totals:blank()}],7,today)
 const content=JSON.stringify(output)
 for(const secret of ['checked','targeted','safe','review','SECRET_MESSAGE','sessionId','fingerprint']){
  assert.equal(content.includes(secret),false,secret)
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
test('official exact Fetch route denies OFF, invalid query and revocation',async()=>{
 let handler:((request:Request)=>Promise<Response>)|undefined
 let unregistered=0,cleanup=()=>{}
 const ctx={
  effect(fn:()=>()=>void){cleanup=fn()},
  inject(_services:string[],fn:(s:any)=>void){fn({connection:{fetch:{
   register(route:{path:string;methods:readonly string[];fetch:(r:Request)=>Promise<Response>}){
    assert.equal(route.path,LIFETIME_WORK_FETCH_PATH)
    assert.deepEqual(route.methods,['GET'])
    handler=route.fetch
    return async()=>{unregistered++}
   },
  }}})},
 }
 let enabled=true,read=0
 registerDshLifetimeWorkFetch(ctx,{
  authorized:()=>enabled,
  store:()=>({snapshot(){read++;return blank()},snapshotDays(){return []}}),
  now:()=>today,
 })
 const invoke=(query='?windowDays=7',signal?:AbortSignal)=>
  handler!(new Request('http://localhost'+LIFETIME_WORK_FETCH_PATH+query,
   {signal}))
 enabled=false
 assert.equal((await invoke()).status,403)
 assert.equal(read,0)
 enabled=true
 assert.equal((await invoke('?windowDays=7&extra=unsafe')).status,400)
 assert.equal(read,0)
 const allowed=await invoke()
 assert.equal(allowed.status,200)
 assert.equal(allowed.headers.get('cache-control'),'no-store')
 const result=await allowed.json() as any
 assert.equal(result.recentDays.length,7)
 assert.equal(read,1)
 enabled=false
 assert.equal((await invoke()).status,403)
 cleanup()
 assert.equal((await invoke()).status,503)
 assert.equal(unregistered,1)
})
test('optional Host Connection service absence never registers nor throws',()=>{
 registerDshLifetimeWorkFetch({}, {authorized:()=>true,store:()=>undefined})
})
test('official service reconnect re-registers after old scoped fiber ends',()=>{
 let rebind:((s:any)=>void)|undefined
 const mainCleanups:Array<()=>void>=[]
 let count=0,shutdowns=0
 const ctx={
  effect(fn:()=>()=>void){mainCleanups.push(fn())},
  inject(_deps:string[],fn:(s:any)=>void){rebind=fn},
 }
 registerDshLifetimeWorkFetch(ctx,{authorized:()=>true,store:()=>undefined})
 const createConnection=()=>{
  let close=()=>{}
  rebind!({connection:{fetch:{register(_spec:unknown){
   count++
   return async()=>{shutdowns++}
  }}},effect(fn:()=>()=>void){close=fn()}})
  return close
 }
 createConnection()()
 createConnection()()
 assert.equal(count,2)
 mainCleanups.forEach(fn=>fn())
 assert.equal(shutdowns,2)
})
