import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { apply } from '../src/adapters/dsh/client.ts'

const host=process.env.AGENT_PICKET_DSH_HOST
test('real Cordis 4 Client: service provides read-only Session event snapshots and cleans up on unload', {
  skip: !host && 'Set AGENT_PICKET_DSH_HOST for actual Cordis Client service test',
},async()=>{
  const { Context }=await import(pathToFileURL(join(host!,'@deepseek-ai/cordis/lib/index.js')).href)
  const ctx=new Context()
  const listeners=new Set<()=>void>()
  let feed={entries:[
    {type:'event',event:{type:'turn/start',seq:1,time:100,data:{text:'PRIVATE_TEXT_121'}}},
    {type:'event',event:{type:'tool/call',seq:2,time:130,data:{text:'PRIVATE_TEXT_121'}}},
    {type:'event',event:{type:'turn/end',seq:3,time:230,data:{text:'PRIVATE_TEXT_121'}}},
  ],hasMore:false,revision:1}
  ;(ctx as any).sessions={
    binding(id:string){return id==='correct' ?{eventSource:{
      getSnapshot(){return feed},
      subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
    }}:undefined},
    scope(){return undefined},
  }
  const fiber=ctx.plugin({name:'agent-picket-client-bridge-test',apply})
  try{
    await new Promise(resolve=>setTimeout(resolve,25))
    const dashboard=(ctx as any).get('agentPicketDashboard')
    assert.ok(dashboard,'No provider was installed in real Cordis')
    const snapshot=dashboard.getSnapshot('correct')
    assert.equal(snapshot.sessionWork.turnEnds,1)
    assert.equal(snapshot.sessionWork.toolCalls,1)
    assert.equal(snapshot.sessionWork.completedTurnMs,130)
    assert.equal(dashboard.getSnapshot('wrong').coverage,'not-loaded')
    assert.equal(JSON.stringify(snapshot).includes('PRIVATE_TEXT_121'),false)
    let updated=0
    const stop=dashboard.subscribe('correct',()=>updated++)
    feed={...feed,revision:2} as typeof feed
    for(const callback of listeners)callback()
    assert.equal(updated,1)
    stop()
    assert.equal(listeners.size,0)
  }finally{await fiber.dispose()}
  assert.equal((ctx as any).get('agentPicketDashboard'),undefined,
    'Unloading Client plugin must revoke access to service')
})
