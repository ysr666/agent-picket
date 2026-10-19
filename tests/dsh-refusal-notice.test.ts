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
  const nextCompleted:RefusalEventWindow={hasMore:false,entries:[
    ...blocked().entries,
    {type:'event',event:{type:'turn/start',seq:2,data:{turn:3}}},
    {type:'event',event:{type:'turn/end',seq:3,
      data:{turn:3,reason:{kind:'completed'}}}},
  ]}
  assert.equal(latestNativeBlockedTurn(nextCompleted),null,
    'A completed newer turn retires an earlier blocked outcome')
  assert.equal(latestNativeBlockedTurn({...nextCompleted,
    entries:nextCompleted.entries.slice(0,3)}),null,
    'A newer in-flight turn also retires the previous blocked outcome')
  assert.equal(latestNativeBlockedTurn({...blocked(),entries:[
    ...blocked().entries,{type:'event',event:{type:'turn/start',seq:1,data:{turn:3}}},
  ]}),null,'Duplicate/out-of-order Host sequence cannot prove a current refusal')

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
  authorized:()=>authorized,now:()=>1000,digest:async id=>fingerprint(id),
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

test('completed next turn invalidates old verified receipt and async races',async()=>{
 let window:RefusalEventWindow={hasMore:false,entries:[]}
 let now=1000,toast=0,resolveHost:(r:Response)=>void=()=>{}
 const client=createBrowserRefusalNoticeReader({
   session:()=> 'session',binding:()=> 'same-binding',window:()=>window,
   authorized:()=>true,now:()=>now,
   digest:async value=>fingerprint(value),
   fetcher:()=>new Promise<Response>(resolve=>{resolveHost=resolve}),
   onNewVerified:()=>{toast++},
 })
 client.refresh()
 window=blocked()
 client.refresh();await settle()
 const subsequent:RefusalEventWindow={hasMore:false,entries:[
   ...blocked().entries,
   {type:'event',event:{type:'turn/start',seq:2,data:{turn:3}}},
 ]}
 window=subsequent
 assert.equal(client.snapshot().state,'unverified',
   'Even before subscriber refresh, the new Host turn invalidates old attribution')
 resolveHost(Response.json(proof()))
 await settle()
 assert.equal(client.snapshot().state,'unverified',
   'A late Host proof cannot resurrect the previous refusal while another turn is active')
 assert.equal(toast,0)
 client.refresh()
 assert.equal(client.snapshot().state,'unverified')
 window=blocked(4)
 client.refresh();await settle()
 resolveHost(Response.json(proof(4)))
 await settle()
 assert.equal(client.snapshot().state,'verified')
 assert.equal(toast,1)
 now+=30*60_000+1
 assert.equal(client.snapshot().state,'unverified',
   'A stale Host notice expires on the Browser even without a new render event')
 client.dispose()
})

test('browser rejects future-dated Host receipt even with matching blocked turn',async()=>{
 let announced=0
 const reader=createBrowserRefusalNoticeReader({
   session:()=> 'one',binding:()=> 'one',window:()=>blocked(),
   authorized:()=>true,now:()=>1000,
   digest:async s=>fingerprint(s),
   fetcher:async()=>Response.json({...proof(),occurredAtMs:7000}),
   onNewVerified:()=>announced++,
 })
 reader.refresh();await settle()
 assert.equal(reader.snapshot().state,'unverified')
 assert.equal(announced,0)
 reader.dispose()
})

test('closing a Session aborts a pending native Host refusal notice request',async()=>{
 let id='a',binding:object={id:'a'}
 const signals:AbortSignal[]=[]
 const client=createBrowserRefusalNoticeReader({
  session:()=>id,binding:()=>binding,window:()=>blocked(),
  authorized:()=>true,now:()=>1000,digest:async x=>fingerprint(x),
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
  authorized:()=>authorized,now:()=>1000,digest:async id=>fingerprint(id),
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

test('a genuine later Host receipt is not lost if an official blocked event arrives first',async()=>{
 let window:RefusalEventWindow={hasMore:false,entries:[]}
 let attempts=0,spoken=0,schedules=0
 const jobs:Array<{fn:()=>void;cancelled:boolean}>=[]
 const reader=createBrowserRefusalNoticeReader({
  session:()=> 'active',binding:()=> 'bound',window:()=>window,
  authorized:()=>true,now:()=>1000,digest:async value=>fingerprint(value),
  fetcher:async()=>{
   attempts++
   return attempts===1
    ?Response.json({error:'not written yet'},{status:404})
    :Response.json(proof(2))
  },
  onNewVerified:()=>spoken++,
  scheduleRetry:(fn,delay)=>{
   assert.ok(delay>0&&delay<=1_000)
   schedules++
   const item={fn,cancelled:false};jobs.push(item)
   return ()=>{item.cancelled=true}
  },
 })
 reader.refresh() // Seed a real browser attached before this blocked turn.
 window=blocked(2)
 reader.refresh();await settle()
 assert.equal(reader.snapshot().state,'unverified')
 assert.equal(attempts,1)
 assert.equal(jobs.length,1,'Transient missing proof schedules a bounded retry')
 reader.refresh()
 assert.equal(attempts,1,'Re-renders do not hammer the Host route while retry is pending')
 jobs.shift()!.fn()
 await settle()
 assert.equal(reader.snapshot().state,'verified',
  'The SAME official blocked turn becomes visible after later authenticated metadata')
 assert.equal(reader.snapshot().receipt?.turn,2)
 assert.equal(spoken,1,'One notice only, even though the initial Host GET was too early')
 assert.equal(attempts,2)
 assert.equal(schedules,1)
 reader.refresh()
 await settle()
 assert.equal(attempts,2)
 assert.equal(spoken,1)
 reader.dispose()
})

test('cold-loaded old Host refusal can be displayed on retry but never toasted as new work',async()=>{
 let count=0,announced=0
 const callbacks:Array<()=>void>=[]
 const reader=createBrowserRefusalNoticeReader({
  session:()=> 'old',binding:()=> 'bound',window:()=>blocked(),
  authorized:()=>true,now:()=>1000,digest:async value=>fingerprint(value),
  fetcher:async()=>{
   count++
   return count===1?Response.json({error:'not-yet'},{status:404})
    :Response.json(proof())
  },
  onNewVerified:()=>announced++,
  scheduleRetry:fn=>{callbacks.push(fn);return ()=>{}},
 })
 reader.refresh();await settle()
 assert.equal(count,1)
 callbacks.shift()!();await settle()
 assert.equal(reader.snapshot().state,'verified')
 assert.equal(announced,0,
  'An older refused turn observed during page load never becomes a new toast on retry')
 reader.dispose()
})

test('failed Host notice GET retries only twice, not indefinitely or without proof',async()=>{
 let fetches=0,announced=0
 const callbacks:Array<()=>void>=[]
 const reader=createBrowserRefusalNoticeReader({
  session:()=> 'a',binding:()=> 'b',window:()=>blocked(),
  authorized:()=>true,now:()=>1000,digest:async value=>fingerprint(value),
  fetcher:async()=>{fetches++;return new Response(null,{status:503})},
  onNewVerified:()=>announced++,
  scheduleRetry:fn=>{callbacks.push(fn);return ()=>{}},
 })
 reader.refresh();await settle()
 assert.equal(fetches,1)
 assert.equal(callbacks.length,1)
 callbacks.shift()!();await settle()
 assert.equal(fetches,2)
 callbacks.shift()!();await settle()
 assert.equal(fetches,3)
 assert.equal(callbacks.length,0,'Exactly three lookups, no unbounded background polling')
 for(let i=0;i<5;i++)reader.refresh()
 assert.equal(fetches,3)
 assert.equal(reader.snapshot().state,'unverified')
 assert.equal(announced,0)
 reader.dispose()
})

test('a scheduled refused-turn retry cannot cross Session, permission revoke or disposal',async()=>{
 let id='a',binding:object={id:'a'},allowed=true
 const tasks:Array<{fn:()=>void;cancelled:boolean}>=[]
 let fetches=0
 const reader=createBrowserRefusalNoticeReader({
  session:()=>id,binding:()=>binding,window:()=>blocked(),
  authorized:()=>allowed,now:()=>1000,digest:async s=>fingerprint(s),
  fetcher:async()=>{fetches++;return new Response(null,{status:404})},
  scheduleRetry:fn=>{
   const item={fn,cancelled:false};tasks.push(item)
   return ()=>{item.cancelled=true}
  },
 })
 reader.refresh();await settle()
 assert.equal(fetches,1)
 const before=tasks[0]!
 id='b';binding={id:'b'}
 reader.refresh();await settle()
 assert.equal(before.cancelled,true)
 assert.equal(fetches,2)
 before.fn();await settle()
 assert.equal(fetches,2,'Stale Session retry has no authority in new Session')
 const changed=tasks[1]!
 allowed=false
 reader.refresh();await settle()
 assert.equal(changed.cancelled,true)
 changed.fn();await settle()
 assert.equal(fetches,2,'Permission revoke blocks all deferred network reads')
 assert.equal(reader.snapshot().state,'off')
 allowed=true
 reader.refresh();await settle()
 assert.equal(fetches,3)
 const final=tasks[2]!
 reader.dispose()
 assert.equal(final.cancelled,true)
 final.fn();await settle()
 assert.equal(fetches,3,'Disposed owner cannot resurrect an old official Host notice')
})

test('clearing a completed turn preserves the next real refusal as a new notice, but not old proof',async()=>{
 let w:RefusalEventWindow={hasMore:false,entries:[]}
 let toasts=0,lookups=0
 const reader=createBrowserRefusalNoticeReader({
  session:()=> 'a',binding:()=> 'b',window:()=>w,
  authorized:()=>true,now:()=>1000,digest:async x=>fingerprint(x),
  fetcher:async()=>{lookups++;return Response.json(proof(lookups===1?2:4))},
  onNewVerified:()=>toasts++,
 })
 reader.refresh()
 w=blocked(2)
 reader.refresh();await settle()
 assert.equal(toasts,1)
 w={hasMore:false,entries:[...blocked(2).entries,
  {type:'event',event:{seq:2,type:'turn/start',data:{turn:3}}},
  {type:'event',event:{seq:3,type:'turn/end',
    data:{turn:3,reason:{kind:'completed'}}}},
 ]}
 reader.refresh()
 assert.equal(reader.snapshot().state,'unverified')
 assert.equal(toasts,1)
 w=blocked(4)
 reader.refresh();await settle()
 assert.equal(reader.snapshot().receipt?.turn,4)
 assert.equal(toasts,2,'Second real turn gets a new notice after completion resets stale proof')
 reader.dispose()
})

test('missing retry scheduler is fail-open to normal Host notice behavior',async()=>{
 let hits=0
 const reader=createBrowserRefusalNoticeReader({
  session:()=> 'a',binding:()=> 'b',window:()=>blocked(),
  authorized:()=>true,now:()=>1000,digest:async x=>fingerprint(x),
  fetcher:async()=>{hits++;return new Response(null,{status:503})},
  scheduleRetry:()=>{throw Error('Browser timer unavailable')},
 })
 reader.refresh();await settle()
 assert.equal(reader.snapshot().state,'unverified')
 assert.equal(hits,1)
 reader.dispose()
})

test('a newer completed official turn cancels pending refusal receipt retry',async()=>{
 let events:RefusalEventWindow=blocked(2)
 let hits=0
 const scheduled:Array<{call:()=>void;cancelled:boolean}>=[]
 const reader=createBrowserRefusalNoticeReader({
  session:()=> 's',binding:()=> 'binding',window:()=>events,
  authorized:()=>true,now:()=>1000,digest:async x=>fingerprint(x),
  fetcher:async()=>{hits++;return new Response(null,{status:404})},
  scheduleRetry:fn=>{
   const current={call:fn,cancelled:false}
   scheduled.push(current)
   return ()=>{current.cancelled=true}
  },
 })
 reader.refresh();await settle()
 assert.equal(hits,1)
 const stale=scheduled[0]!
 events={hasMore:false,entries:[
  ...blocked(2).entries,
  {type:'event',event:{type:'turn/start',seq:2,data:{turn:3}}},
  {type:'event',event:{type:'turn/end',seq:3,
    data:{turn:3,reason:{kind:'completed'}}}},
 ]}
 reader.refresh()
 assert.equal(stale.cancelled,true)
 stale.call()
 await settle()
 assert.equal(hits,1,'Completed newer work prevents stale blocked proof retry')
 assert.equal(reader.snapshot().state,'unverified')
 reader.dispose()
})
