import assert from 'node:assert/strict'
import test from 'node:test'
import {createVolatileRefusalNotices,registerDshRefusalNoticeFetch} from '../src/adapters/dsh/refusal-notice-host.ts'
import {REFUSAL_NOTICE_FETCH_PATH,matchRefusalToOfficialTurn,parseRefusalNotice,
  type RefusalEventWindow} from '../src/adapters/dsh/refusal-notice-contract.ts'
import {createBrowserRefusalNoticeReader,latestNativeBlockedTurn} from '../src/adapters/dsh/client-refusal-notice.ts'
import {createHash} from 'node:crypto'

const fingerprint=(s:string)=>createHash('sha256').update(s).digest('hex')
const proof=(turn=2)=>({schemaVersion:1,source:'dsh-host-picket-refusal-v1',
  turn,occurredAtMs:1000,outcome:'discard-manual-resend',
  containsInput:false,automaticReplay:false}) as const
const blocked=(turn=2,kind:'blocked'|'completed'='blocked'):RefusalEventWindow=>({
  hasMore:false,entries:[
    {type:'event',event:{type:'turn/start',seq:0,data:{turn}}},
    {type:'event',event:{type:'turn/end',seq:1,data:{turn,reason:{kind}}}},
  ],
})
const settle=async()=>{for(let i=0;i<24;i++)await Promise.resolve()}

test('refusal receipt requires exact Host proof AND official no-step blocked turn',()=>{
  const valid=proof()
  assert.equal(matchRefusalToOfficialTurn(blocked(),valid),true)
  assert.equal(matchRefusalToOfficialTurn(blocked(3),valid),false)
  assert.equal(matchRefusalToOfficialTurn(blocked(2,'completed'),valid),false)
  assert.equal(matchRefusalToOfficialTurn({...blocked(),hasMore:true},valid),false)
  assert.equal(matchRefusalToOfficialTurn({...blocked(),entries:[
    ...blocked().entries,{type:'event',event:{type:'step/start',seq:2,data:{turn:2,step:1}}},
  ]},valid),false)
  assert.equal(matchRefusalToOfficialTurn({...blocked(),entries:[
    ...blocked().entries,{type:'event',event:{type:'request/header',seq:3,data:{turn:2}}},
  ]},valid),false,'A model request must not be attributed to an untouched turn')
  assert.equal(matchRefusalToOfficialTurn({...blocked(),entries:[
    ...blocked().entries,blocked().entries[1]!,
  ]},valid),false,'A duplicate event Seq invalidates Host attribution')
  assert.equal(matchRefusalToOfficialTurn(blocked(),null),false)
  assert.equal(latestNativeBlockedTurn(blocked()),2)
  assert.equal(latestNativeBlockedTurn(blocked(2,'completed')),null)
  assert.equal(parseRefusalNotice({...proof(),prompt:'USER_SECRET'}),null)
  assert.equal(parseRefusalNotice({...proof(),automaticReplay:true}),null)
})

test('Host refusal ledger stores only bounded expiring turn metadata',()=>{
 let now=1000
 const store=createVolatileRefusalNotices(()=>now)
 assert.equal(store.record('private-session',2),true)
 assert.equal(store.record('private-session',1),false)
 assert.equal(store.record('private-session',2),false)
 assert.equal(store.read('private-session'),null,'Raw Session ID cannot be used for lookup')
 const receipt=store.read(fingerprint('private-session'))
 assert.deepEqual(receipt,proof())
 assert.doesNotMatch(JSON.stringify(receipt),/private-session|text|attachment|messageId/)
 assert.equal(store.record('',3),false)
 assert.equal(store.record('private-session',NaN),false)
 now+=30*60_000+1
 assert.equal(store.read(fingerprint('private-session')),null,'Expired notice cannot identify stale work')
 assert.equal(store.record('private-session',3),true)
 store.clear()
 assert.equal(store.read(fingerprint('private-session')),null)
})

test('Host same-origin Fetch returns allowlisted refusal evidence, never source secrets',async()=>{
 const store=createVolatileRefusalNotices(()=>1000)
 store.record('private-session',2)
 let route:{path:string;methods:string[];fetch:(r:Request)=>Promise<Response>}|undefined
 let dispose=()=>{},routeRemoved=0,authorized=true
 const ctx={effect(f:()=>()=>void){dispose=f()},inject(_deps:string[],handler:(c:any)=>void){
  handler({connection:{fetch:{register(r:any){route=r;return async()=>{routeRemoved++}}}}})}}
 registerDshRefusalNoticeFetch(ctx,{authorized:()=>authorized,read:key=>({
  ...store.read(key),raw:'PRIVATE_PROMPT',attachments:['PRIVATE_ATTACHMENT'],
 })})
 const url='http://localhost'+REFUSAL_NOTICE_FETCH_PATH
 const key=fingerprint('private-session')
 assert.deepEqual(route?.methods,['GET'])
 assert.equal(route?.path,REFUSAL_NOTICE_FETCH_PATH)
 assert.equal((await route!.fetch(new Request(url+'?sessionKey='+key))).status,404,
  'Host refuses any unexpected record fields at its security boundary')
 // Valid allowlisted Host source produces only metadata.
 dispose()
 assert.equal((await route!.fetch(new Request(url+'?sessionKey='+key))).status,503)
 assert.equal(routeRemoved,1)
 let goodRoute:typeof route
 registerDshRefusalNoticeFetch({effect(){},inject(_d:string[],cb:(v:any)=>void){
  cb({connection:{fetch:{register(r:any){goodRoute=r;return async()=>{}}}}})}},
  {authorized:()=>authorized,read:key=>store.read(key)})
 const response=await goodRoute!.fetch(new Request(url+'?sessionKey='+key))
 assert.equal(response.status,200)
 assert.equal(response.headers.get('cache-control'),'no-store')
 const payload=await response.text()
 assert.deepEqual(JSON.parse(payload),proof())
 assert.doesNotMatch(payload,/PRIVATE_PROMPT|PRIVATE_ATTACHMENT|private-session/)
 authorized=false
 assert.equal((await goodRoute!.fetch(new Request(url+'?sessionKey='+key))).status,403)
 authorized=true
 assert.equal((await goodRoute!.fetch(new Request(url+'?sessionKey=private-session'))).status,400)
})

test('browser only announces an authenticated Picket notice matching genuine blocked turn',async()=>{
 let session='a',binding:object={key:'a'},window:RefusalEventWindow={hasMore:false,entries:[]}
 let notice=proof(),authorized=true,fetches=0,spoken=0
 const client=createBrowserRefusalNoticeReader({
  session:()=>session,binding:()=>binding,window:()=>window,
  authorized:()=>authorized,digest:async id=>fingerprint(id),
  fetcher:async()=>{fetches++;return Response.json(notice)},
  onNewVerified:()=>{spoken++},
 })
 client.refresh() // Seed the active empty Session; no initial toast.
 assert.equal(spoken,0)
 window=blocked()
 client.refresh()
 await settle()
 assert.equal(client.snapshot().state,'verified')
 assert.equal(client.snapshot().receipt?.turn,2)
 assert.equal(spoken,1)
 client.refresh()
 await settle()
 assert.equal(fetches,1,'No duplicate Host GET or toast for a repeated event window')
 window=blocked(3)
 client.refresh()
 await settle()
 assert.equal(client.snapshot().state,'unverified',
  'An unrelated blocked turn cannot reuse earlier Picket receipt')
 assert.equal(spoken,1)
 notice=proof(4)
 window=blocked(4,'completed')
 client.refresh()
 await settle()
 assert.equal(spoken,1,'Nonblocked work cannot produce strike attribution')
 window=blocked(4)
 client.refresh()
 await settle()
 assert.equal(client.snapshot().state,'verified')
 assert.equal(spoken,2)
 session='b';binding={key:'b'}
 assert.equal(client.snapshot().state,'unverified',
  'Old Session receipt is never projected in another Session')
 authorized=false
 assert.equal(client.snapshot().state,'off')
 client.dispose()
})

test('closing a Session aborts a pending native Host refusal notice request',async()=>{
 let id='a',binding:object={id:'a'}
 const signals:AbortSignal[]=[]
 const client=createBrowserRefusalNoticeReader({
  session:()=>id,binding:()=>binding,window:()=>blocked(),
  authorized:()=>true,digest:async x=>fingerprint(x),
  fetcher:(_url,init)=>{
    if(init?.signal)signals.push(init.signal)
    return new Promise<Response>(()=>{})
  },
 })
 client.refresh();await settle()
 assert.equal(signals[0]?.aborted,false)
 id='b';binding={id:'b'}
 client.refresh();await settle()
 assert.equal(signals[0]?.aborted,true,'Session switch aborts its abandoned request')
 assert.equal(signals[1]?.aborted,false,'New Session owns a fresh request')
 client.dispose()
 assert.equal(signals[1]?.aborted,true,'Disposed Client must abort its Host request')
})

test('client cannot show a stale Host answer after session navigation or revocation',async()=>{
 let session='a',binding:object={key:'a'},authorized=true
 const decisions:Array<(r:Response)=>void>=[]
 const client=createBrowserRefusalNoticeReader({
  session:()=>session,binding:()=>binding,window:()=>blocked(),
  authorized:()=>authorized,digest:async id=>fingerprint(id),
  fetcher:()=>new Promise<Response>(resolve=>{decisions.push(resolve)}),
 })
 client.refresh();await settle()
 assert.equal(decisions.length,1)
 session='b';binding={key:'b'}
 client.refresh();await settle()
 assert.equal(decisions.length,2)
 decisions[0]!(Response.json(proof()))
 await settle()
 assert.equal(client.snapshot().state,'unverified')
 authorized=false
 decisions[1]!(Response.json(proof()))
 await settle()
 assert.equal(client.snapshot().state,'off')
 client.dispose()
})


test('a detached authenticated Connection cannot return stale Picket refusal receipts',async()=>{
 let detach=()=>{},route:{fetch:(r:Request)=>Promise<Response>}|undefined
 let detached=0
 const ctx={
  effect(_fn:()=>()=>void){},
  inject(_deps:string[],handler:(c:any)=>void){
   handler({connection:{fetch:{register(r:any){route=r;return async()=>{detached++}}}},
     effect(fn:()=>()=>void){detach=fn()}})
  },
 }
 registerDshRefusalNoticeFetch(ctx,{authorized:()=>true,read:()=>{
   detach() // Official Connection unmounts inside a pre-admitted GET.
   return proof()
 }})
 const response=await route!.fetch(new Request('http://localhost'+REFUSAL_NOTICE_FETCH_PATH
   +'?sessionKey='+fingerprint('private-session')))
 assert.equal(response.status,503)
 assert.equal(detached,1)
})
