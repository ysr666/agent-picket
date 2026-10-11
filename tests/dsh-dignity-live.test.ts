import assert from 'node:assert/strict'
import test from 'node:test'
import { createVolatileDignityLedger, dignitySessionKey } from '../src/adapters/dsh/dignity-live.ts'
import { registerDshDignityFetch } from '../src/adapters/dsh/dignity-fetch.ts'
import { DIGNITY_FETCH_PATH } from '../src/adapters/dsh/dignity-contract.ts'
const safe={verdict:'safe' as const,confidence:1}
const review={verdict:'suspected-abuse' as const,confidence:.63}
const attacked={verdict:'targeted-abuse' as const,confidence:.96}
test('real detector verdict drives a bounded, ephemeral non-punitive union episode, not observe-mode decision.reason',()=>{
 const l=createVolatileDignityLedger()
 l.record('user-session-one','one',safe)
 l.record('user-session-one','one',safe)
 l.record('user-session-one','two',review)
 l.record('user-session-one','three',attacked)
 const snapshot=l.snapshot(dignitySessionKey('user-session-one'))!
 assert.deepEqual([snapshot.checked,snapshot.safe,snapshot.review,snapshot.targeted],
  [3,1,1,1])
 assert.equal(snapshot.latest,'targeted')
 assert.equal(snapshot.enforcement,false)
 assert.equal(snapshot.persistence,'memory-only')
 assert.equal(l.snapshot(dignitySessionKey('other-session'))!.checked,0)
 assert.equal(l.snapshot('user-session-one'),null)
 const text=JSON.stringify(snapshot)
 for(const sensitive of ['user-session','you are','promptId','actorId','rawText'])
  assert.equal(text.includes(sensitive),false)
 l.clear()
 assert.equal(l.snapshot(dignitySessionKey('user-session-one'))!.checked,0)
})
test('authenticated official Host fetch returns only counts, denies OFF, invalid and disposed',async()=>{
 const l=createVolatileDignityLedger()
 l.record('a user session','request-secret',attacked)
 let route:{path:string;methods:string[];fetch:(r:Request)=>Promise<Response>}|undefined
 let cleanup=()=>{},stopped=0
 const ctx={
  effect(fn:()=>()=>void){cleanup=fn()},
  inject(_deps:string[],fn:(ctx:any)=>void){fn({connection:{fetch:{
   register(def:any){route=def;return async()=>{stopped++}}
  }}})},
 }
 let authorized=false
 registerDshDignityFetch(ctx,{
  authorized:()=>authorized,
  lookup:k=>l.snapshot(k),
 })
 assert.equal(route?.path,DIGNITY_FETCH_PATH)
 assert.deepEqual(route?.methods,['GET'])
 const url=(suffix:string)=>'http://localhost'+DIGNITY_FETCH_PATH+suffix
 const fetch=(suffix:string)=>route!.fetch(new Request(url(suffix)))
 const good='?sessionKey='+dignitySessionKey('a user session')
 assert.equal((await fetch(good)).status,403)
 authorized=true
 assert.equal((await fetch(good+'&leak=1')).status,400)
 assert.equal((await fetch('?sessionKey=PRIVATE_ID')).status,400)
 const response=await fetch(good)
 assert.equal(response.status,200)
 assert.equal(response.headers.get('cache-control'),'no-store')
 const data=await response.json() as any
 assert.equal(data.targeted,1)
 assert.equal(JSON.stringify(data).includes('request-secret'),false)
 authorized=false
 assert.equal((await fetch(good)).status,403)
 cleanup()
 assert.equal((await fetch(good)).status,503)
 assert.equal(stopped,1)
})

test('Host dignity route allowlists live count data even when its source carries private extras',async()=>{
 let route:{fetch:(r:Request)=>Promise<Response>}|undefined
 const ctx={
  effect(_fn:()=>()=>void){},
  inject(_deps:string[],fn:(c:any)=>void){fn({connection:{fetch:{
   register(def:any){route=def;return async()=>{}},
  }}})},
 }
 const key='c'.repeat(64)
 let source:any={schemaVersion:1,source:'dsh-host-volatile-dignity',
  checked:2,safe:1,review:0,targeted:1,latest:'targeted',
  origin:'claimed-user-source',enforcement:false,persistence:'memory-only',
  sessionId:'PRIVATE_REAL_SESSION',rawText:'PRIVATE_PROMPT_CONTENT',
  attachments:[{name:'PRIVATE_ATTACHMENT'}]}
 registerDshDignityFetch(ctx,{authorized:()=>true,lookup:()=>source})
 const get=()=>route!.fetch(new Request('http://localhost'+DIGNITY_FETCH_PATH+'?sessionKey='+key))
 const visible=await get()
 assert.equal(visible.status,200)
 const text=await visible.text()
 assert.deepEqual(Object.keys(JSON.parse(text)).sort(),[
  'schemaVersion','source','checked','safe','review','targeted','latest',
  'origin','enforcement','persistence',
 ].sort(),'Only the documented field allowlist can leave Host')
 for(const secret of ['PRIVATE_REAL_SESSION','PRIVATE_PROMPT_CONTENT','PRIVATE_ATTACHMENT'])
  assert.equal(text.includes(secret),false,'Host must not expose arbitrary metadata')
 source={...source,checked:1,rawText:'another PRIVATE_PROMPT'}
 assert.equal((await get()).status,503,
  'Malformed totals must not be serialized as trusted Host verdicts')
 source={...source,checked:2,enforcement:true}
 assert.equal((await get()).status,503,
  'Host must refuse accidental enforcement/provenance claim changes')
})
