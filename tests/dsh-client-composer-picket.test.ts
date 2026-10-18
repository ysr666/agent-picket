import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDshLocalComposerPicket,type DshComposerBlocks,
} from '../src/adapters/dsh/client-composer-picket.ts'

const setup=()=>{
  let selected='session-A',member=true
  const events:string[]=[]
  const data=new Map<string,{reason:string}|undefined>()
  const blocks:DshComposerBlocks={
    set(id,block){data.set(id,block);events.push(id+':'+(block?.reason??'clear'))},
    storeFor(id){return {getSnapshot:()=>data.get(id)}},
  }
  const port=createDshLocalComposerPicket({
    currentSession:()=>selected,member:()=>member,
    reason:()=> 'Agent Picket: this tab only; resume via Union HQ',
  })
  port.attach(blocks)
  return {port,blocks,data,events,select:(id:string)=>{selected=id;port.refresh()},
    revoke:()=>{member=false;port.refresh()}}
}

test('an explicit local picket pauses the actual composer without touching content or Host admission',()=>{
  const {port,data,events}=setup()
  assert.equal(port.snapshot().state,'ready')
  const result=port.start()
  assert.equal(result.state,'active')
  assert.equal(result.hostEnforcement,false)
  assert.equal(result.interceptsMessages,false)
  assert.match(data.get('session-A')?.reason??'',/this tab only/)
  assert.equal(port.start().state,'active')
  assert.equal(events.length,1,'no repeated write or duplicate pause')
  assert.equal(port.stop().state,'ready')
  assert.equal(data.get('session-A'),undefined)
  assert.equal(events.length,2)
})

test('never overwrites or clears another plugin composer block',()=>{
  const {port,data}=setup()
  data.set('session-A',{reason:'A different plugin is handling input'})
  assert.equal(port.start().state,'occupied')
  assert.equal(data.get('session-A')?.reason,'A different plugin is handling input')
  data.delete('session-A')
  assert.equal(port.start().state,'active')
  data.set('session-A',{reason:'Different plugin replaced the pause'})
  assert.equal(port.stop().state,'occupied')
  assert.equal(data.get('session-A')?.reason,'Different plugin replaced the pause')
})

test('session A to B and consent revocation cannot strand an old composer pause',()=>{
  const {port,data,select,revoke}=setup()
  port.start()
  select('session-B')
  assert.equal(data.get('session-A'),undefined)
  assert.equal(port.snapshot().state,'ready')
  port.start()
  revoke()
  assert.equal(data.get('session-B'),undefined)
  assert.equal(port.snapshot().state,'unavailable')
})

test('fiber disposal and service replacement clear only Picket-owned local blocks',()=>{
  const {port,blocks,data}=setup()
  port.start()
  port.attach(null)
  assert.equal(data.get('session-A'),undefined)
  assert.equal(port.snapshot().state,'unavailable')
  port.attach(blocks)
  assert.equal(port.start().state,'active')
  port.dispose()
  assert.equal(data.get('session-A'),undefined)
  assert.equal(port.snapshot().state,'unavailable')
})

test('missing/throwing Host service fails open and never reports enforcement',()=>{
  const {port,blocks}=setup()
  port.attach({
    set(){throw Error('cannot write')},
    storeFor(){return {getSnapshot:()=>undefined}},
  })
  assert.equal(port.start().state,'unavailable')
  port.attach(blocks)
  assert.equal(port.snapshot().state,'ready')
  port.attach({
    set(){},
    storeFor(){throw Error('Host service gone')},
  })
  assert.equal(port.start().state,'unavailable')
})

test('errors from subscribers do not affect a valid local pause',()=>{
  const {port}=setup()
  let observed=0
  port.subscribe(()=>{throw Error('bad render')})
  const stop=port.subscribe(()=>{observed++})
  assert.equal(port.start().state,'active')
  assert.equal(observed,1)
  stop()
  port.stop()
  assert.equal(observed,1)
})
