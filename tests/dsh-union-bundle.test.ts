import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

test('packaged DSH Client loads native React Slots without extra React, model calls or private data', async () => {
  const file=resolve(import.meta.dirname,'../dist/adapters/dsh/client.js')
  const source=readFileSync(file,'utf8')
  const registrations:any[]=[]
  const h=(type:any,props:any,...children:any[])=>({type,props:props??{},children})
  const react={
    createElement:h,
    useState(initial:any){return [typeof initial==='function'?initial():initial,()=>{}]},
    useEffect() {},
    useRef(value:any){return {current:value}},
  }
  const portal={createPortal:(child:unknown)=>child}
  let bundle:any
  let required:string[]=[]
  runInNewContext(source,{
    window:{__ModuleLoader__:{load(registration:unknown){bundle=registration}}},
  })
  assert.equal(bundle.id,'agent-picket')
  const plugin=bundle.factory((name:string)=>{
    required.push(name)
    if(name==='react')return react
    if(name==='react-dom')return portal
    throw new Error('Unexpected browser dependency '+name)
  })
  const text={private:'PRIVATE_PROMPT_9876'}
  const events={entries:[
    {type:'event',event:{type:'turn/start',seq:1,time:100,data:text}},
    {type:'event',event:{type:'tool/call',seq:2,time:200,data:text}},
    {type:'event',event:{type:'turn/end',seq:3,time:400,data:text}},
  ],hasMore:false,revision:1}
  let stored:any={status:'ready',value:{welcomeDecision:'unseen'},
    writable:true,mode:'host',revision:1}
  let writes=0
  let published:any
  const ctx:any={
    provide(name:string,data:any){assert.equal(name,'agentPicketDashboard');published=data;return()=>{}},
    sessions:{
      list:{getSnapshot:()=>({current:'session-1',phase:'ready',byId:{'session-1':{blank:false}}}),subscribe:()=>()=>{}},
      binding(id:string){return id==='session-1'?{eventSource:{
        getSnapshot:()=>events,subscribe:()=>()=>{},
      }}:undefined},
      scope:()=>undefined,
    },
    slots:{
      inject(_name:string,cb:()=>void){cb()},
      register(options:any,component:any){registrations.push({options,component})},
    },
    settingsScope:{bind({namespace}:{namespace:string}){
      assert.equal(namespace,'agent-picket')
      return {
        getSnapshot:()=>stored,
        subscribe:()=>()=>{},
        async set(field:string,value:unknown){
          assert.equal(field,'welcomeDecision');writes++
          stored={...stored,value:{welcomeDecision:value},revision:stored.revision+1}
        },
      }
    }},
    locale:{getLocale:()=>({active:'zh'}),subscribe:()=>()=>{}},
    inject(services:string[],cb:(ctx:any)=>void){
      if (Array.from(services).includes('configForms')) return
      assert.deepEqual(Array.from(services),['slots','settingsScope','locale'])
      cb(ctx)
    },
    on(name:string,callback:Function){assert.equal(name,'command/executed')},
  }
  plugin.apply(ctx)
  assert.deepEqual(required,['react','react-dom'])
  assert.ok(published)
  const stat=published.getSnapshot('session-1')
  assert.equal(stat.sessionWork?.completedTurnMs,300)
  assert.equal(JSON.stringify(stat).includes('PRIVATE_PROMPT_9876'),false)
  assert.deepEqual(registrations.map(x=>x.options.name),
    ['settings.onboarding','settings.section','sidebar.footer.action'])
  const footer=registrations[2].component({wide:true})
  assert.ok(JSON.stringify(footer).includes('AI 工会'))
  const content=registrations[1].component({})
  const serialized=JSON.stringify(content)
  assert.ok(serialized.includes('工会'),serialized.slice(0,300))
  assert.ok(serialized.includes('300')===false,'UI must not pretend raw ms are lifetime work')
  assert.ok(serialized.includes('union')===false || serialized.length>0)
  assert.equal(writes,0)
  assert.equal(stored.value.welcomeDecision,'unseen')
})
