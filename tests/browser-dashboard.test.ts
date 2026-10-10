import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createBrowserDashboardBridge, projectBrowserEventWindow,
  type BrowserSessionEntry, type BrowserSessionWindow,
} from '../src/adapters/dsh/client-dashboard.ts'

function row(type:string, seq:number, time:number, data?:unknown):BrowserSessionEntry {
  return {type:'event',event:{type,seq,time,data}}
}
const secret={transcript:'CONFIDENTIAL_PROMPT_12224',rawMessage:'PRIVATE_USER_ID_455'}
const entries:BrowserSessionEntry[]=[
  row('user/message',1,100,secret),
  row('turn/start',2,120,secret),
  {type:'transient',event:{type:'assistant/live-chunk',seq:3,time:130,data:secret}},
  row('tool/call',4,140,secret),
  row('tool/result',5,200,secret),
  row('turn/end',6,320,secret),
]
function window(entriesIn=entries,hasMore=false,revision=2):BrowserSessionWindow {
  return {entries:entriesIn,hasMore,revision}
}
test('projector derives live Host event counts but never exposes payload or session identity',()=>{
  const view=projectBrowserEventWindow(window())
  assert.deepEqual(view.sessionWork,{
    turnStarts:1,turnEnds:1,toolCalls:1,toolResults:1,completedTurnMs:200,
  })
  assert.equal(view.coverage,'complete')
  assert.equal(view.sourceEventCount,4)
  assert.equal(view.lifetime,null)
  assert.equal(view.lifetimeVisibility,'not-exposed-by-client')
  assert.equal(view.containsOriginalMessages,false)
  assert.equal(view.schemaVersion,1)
  assert.doesNotMatch(JSON.stringify(view),/CONFIDENTIAL_PROMPT|PRIVATE_USER_ID|user\/message|transcript/)
})
test('partial history cannot be mistaken for lifetime or complete session history',()=>{
  const view=projectBrowserEventWindow(window(entries.slice(3),true))
  assert.equal(view.coverage,'partial')
  assert.equal(view.sessionWork?.turnStarts,0)
  assert.equal(view.sessionWork?.toolCalls,1)
  assert.equal(view.sessionWork?.completedTurnMs,0)
  assert.equal(view.lifetime,null)
})
test('replacing/prepending history is recalculated not double-counted',()=>{
  const a=projectBrowserEventWindow(window([...entries,...entries],false,7))
  assert.equal(a.sessionWork?.turnEnds,1)
  assert.equal(a.sourceEventCount,4)
  assert.equal(a.revision,7)
})
test('bridge scopes to retained sessions, publishes event-source changes, unsubscribes',()=>{
  let entriesA = window(entries,true,10)
  const listeners = new Set<()=>void>()
  const service=createBrowserDashboardBridge({
    binding(id) {
      if(id!=='a')return undefined
      return {eventSource:{
        getSnapshot:()=>entriesA,
        subscribe(fn){listeners.add(fn);return()=>{listeners.delete(fn)}},
      }}
    },
  })
  assert.equal(service.getSnapshot('not-retained').coverage,'not-loaded')
  assert.equal(service.getSnapshot('a').coverage,'partial')
  const events:number[]=[]
  const stop=service.subscribe('a',v=>events.push(v.sessionWork?.turnEnds??-1))
  assert.equal(listeners.size,1)
  entriesA=window([...entries,row('turn/start',7,400,secret),row('turn/end',8,470,secret)],false,11)
  for(const cb of listeners)cb()
  assert.deepEqual(events,[2])
  assert.equal(service.getSnapshot('a').sessionWork?.completedTurnMs,270)
  stop()
  stop()
  assert.equal(listeners.size,0)
  for(const cb of listeners)cb()
  assert.deepEqual(events,[2])
  assert.equal(service.subscribe('missing',()=>{} ) instanceof Function,true)
})
test('subscription observers cannot affect Host when throwing',()=>{
  const listeners = new Set<()=>void>()
  const bridge=createBrowserDashboardBridge({
    binding(){return {eventSource:{
      getSnapshot:()=>window(),
      subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
    }}},
  })
  bridge.subscribe('a',()=>{throw new Error('UI failure')})
  assert.doesNotThrow(()=>{for(const fn of listeners)fn()})
})
