import assert from 'node:assert/strict'
import test from 'node:test'
import { projectLifetimeWork, registerDshLifetimeWorkFetch } from '../src/adapters/dsh/lifetime-work-rpc.ts'
import { LIFETIME_WORK_FETCH_PATH } from '../src/adapters/dsh/lifetime-work-contract.ts'

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

test('30-day work rollup preserves exact nonzero UTC days across a month boundary',()=>{
 const now=Date.parse('2026-03-01T01:05:00.000Z')
 const first=Date.parse('2026-01-31T00:00:00.000Z')
 const totals=blank()
 const daily=Array.from({length:30},(_,index)=>{
   const day=new Date(first+index*86_400_000).toISOString().slice(0,10)
   return {day,totals:{...totals,completedTurnMs:(index+1)*60_000}}
 })
 const response=projectLifetimeWork(totals,daily,30,now)
 assert.equal(response.recentDays.length,30)
 assert.equal(response.recentDays[0]?.day,'2026-01-31')
 assert.equal(response.recentDays.at(-1)?.day,'2026-03-01')
 assert.equal(response.recentDays[0]?.work.completedTurnMs,60_000)
 assert.equal(response.recentDays[28]?.work.completedTurnMs,29*60_000)
 assert.equal(response.recentDays[29]?.work.completedTurnMs,30*60_000)
 assert.equal(JSON.stringify(response).includes('targeted'),false)
})

test('Host lifetime Fetch must not serve a response after plugin scope is disposed during projection',async()=>{
 let handler:((request:Request)=>Promise<Response>)|undefined
 let cleanup=()=>{},registered=0,unregistered=0
 const ctx={
   effect(fn:()=>()=>void){cleanup=fn()},
   inject(_services:string[],fn:(s:any)=>void){fn({connection:{fetch:{
     register(route:{fetch:(r:Request)=>Promise<Response>}){
       handler=route.fetch;registered++
       return async()=>{unregistered++}
     },
   }}})},
 }
 let snapshots=0
 registerDshLifetimeWorkFetch(ctx,{
  authorized:()=>true,
  store:()=>({
    snapshot(){
      snapshots++
      // A different Host fiber can dispose this plugin in the middle of
      // an already accepted request (even with authorization unchanged).
      cleanup()
      return blank()
    },
    snapshotDays(){return []},
  }),
  now:()=>today,
 })
 assert.equal(registered,1)
 const result=await handler!(new Request('http://localhost'+LIFETIME_WORK_FETCH_PATH+'?windowDays=7'))
 assert.equal(result.status,503,'Disposed Host owner must never return durable data')
 assert.equal((await result.json() as any).error,'unavailable')
 assert.equal(unregistered,1)
 assert.equal(snapshots,1)
})

test('detached Host Connection fiber cannot complete a previously admitted work Fetch',async()=>{
 let handler:((request:Request)=>Promise<Response>)|undefined
 let detach=()=>{},removed=0
 const ctx={
   effect(_fn:()=>()=>void){},
   inject(_deps:string[],onBind:(child:any)=>void){
     onBind({connection:{fetch:{register(route:any){
       handler=route.fetch
       return async()=>{removed++}
     }}},effect(fn:()=>()=>void){detach=fn()}})
   },
 }
 registerDshLifetimeWorkFetch(ctx,{
   authorized:()=>true,
   store:()=>({snapshot(){
     detach() // Connection provider changed while an admitted GET was being read
     return blank()
   },snapshotDays:()=>[]}),
   now:()=>today,
 })
 const response=await handler!(new Request('http://localhost'+LIFETIME_WORK_FETCH_PATH+'?windowDays=7'))
 assert.equal(response.status,503,
   'Detached connection cannot transmit work aggregates even with permission ON')
 assert.equal(removed,1)
})
