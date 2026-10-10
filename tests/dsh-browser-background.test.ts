import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../src/adapters/dsh/client.ts'
import { parseUnionLedger } from '../src/product/union-ledger.ts'

test('live DSH Client monitors complete work in background with drawer CLOSED and cleans up',async()=>{
  let value={welcomeDecision:'enabled',unionLedger:''}
  const listeners=new Set<()=>void>()
  const statsListeners=new Set<()=>void>()
  let writes=0,cleanup:(()=>void)|undefined
  let eventSource={entries:[
    {type:'event',event:{type:'turn/start',seq:1,time:100}},
    {type:'event',event:{type:'turn/end',seq:2,time:2*3_600_000+100}},
  ],hasMore:false,revision:1}
  const ctx:any={
    sessions:{
      list:{getSnapshot:()=>({current:'session-background'}),subscribe:()=>()=>{}},
      scope:()=>undefined,
      binding:()=>({eventSource:{
        getSnapshot:()=>eventSource,
        subscribe:(fn:()=>void)=>{statsListeners.add(fn);return()=>{statsListeners.delete(fn)}},
      }}),
    },
    provide:()=>()=>{}, on:()=>{},
    locale:{getLocale:()=>({active:'zh-CN'}),subscribe:()=>()=>{}},
    slots:{inject(_name:string,callback:()=>void){callback()},register(){}},
    settingsScope:{bind:()=>({
      getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision:writes+1,value}),
      subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}},
      set:async(field:string,next:string)=>{
        assert.equal(field,'unionLedger')
        value={...value,unionLedger:next}
        writes++
        for(const fn of listeners)fn()
      },
    })},
    inject(_services:string[],callback:(ctx:unknown)=>void){callback(ctx)},
    effect(register:()=>()=>void){cleanup=register()},
  }
  const react:any={createElement(){},useEffect(){},useState(x:unknown){return [x,()=>{}]},useRef(x:unknown){return {current:x}}}
  apply(ctx,react,{createPortal:()=>null})
  for(let i=0;i<25 && writes===0;i++)
    await new Promise(r=>setTimeout(r,10))
  assert.equal(writes,1,'background observer must create a persisted demand')
  const entries=Object.values(parseUnionLedger(value.unionLedger)!.sessions)
  assert.equal(entries.length,1)
  assert.equal(entries[0]?.pending?.kind,'break')
  assert.equal(entries[0]?.pending?.raisedAtElapsedMs,2*3_600_000)
  assert.equal(statsListeners.size,1)
  assert.ok(cleanup,'Cordis effect owns listener disposal')
  cleanup!()
  assert.equal(statsListeners.size,0)
  assert.equal(listeners.size,0)
  assert.equal(writes,1)
  assert.equal(JSON.stringify(value).includes('prompt'),false)
})
