import assert from 'node:assert/strict'
import test from 'node:test'
import {
  projectPersistedDshTurnWork,
  type PersistedWorkEvent,type PersistedWorkPort,
} from './helpers/dsh-persisted-turn-projection.ts'

const DAY=Date.parse('2026-10-14T01:00:00.000Z')
const hour=3_600_000
const start=(seq:number,turn:number,time:number):PersistedWorkEvent=>({
  seq,time,type:'turn/start',data:{turn},
})
const end=(seq:number,turn:number,time:number,kind='completed'):PersistedWorkEvent=>({
  seq,time,type:'turn/end',data:{turn,reason:{kind}},
})
function store(sessions:readonly {
  id:string;events:readonly PersistedWorkEvent[];inherited?:number;fork?:boolean
}[],failId?:string):PersistedWorkPort&{readonly visited:string[]}{
  const visited:string[]=[]
  return {
    visited,
    async list(){return sessions.map(s=>({
      header:{id:s.id,isSeeded:s.fork===true},
    }))},
    async open(id,access){
      assert.equal(access,'read',"never open the Host\u2019s persistence write handle")
      visited.push(id)
      if(id===failId)throw Error('Host read error')
      const s=sessions.find(x=>x.id===id)
      assert.ok(s)
      return {
        header:{id,isSeeded:s.fork===true},
        inheritedEventCount:s.inherited??0,
        async read(offset=0,length=100000){return {events:s.events.slice(offset,offset+length)}},
        async close(){},
      }
    },
  }
}
test('DSH official persisted events yield confirmed 7h then 8h across sessions',async()=>{
  const base=store([{id:'first',events:[
    start(0,1,DAY),end(1,1,DAY+7*hour),
  ]}])
  assert.deepEqual(await projectPersistedDshTurnWork(base,DAY+9*hour),{
    day:'2026-10-14',confirmedCompletedTurnMs:7*hour,coverage:'durable-prefix',
  })
  const plus=store([{id:'first',events:[start(0,1,DAY),end(1,1,DAY+7*hour)]},
    {id:'second',events:[start(0,1,DAY+7*hour),end(1,1,DAY+8*hour)]}])
  const result=await projectPersistedDshTurnWork(plus,DAY+9*hour)
  assert.equal(result?.confirmedCompletedTurnMs,8*hour)
  assert.deepEqual(plus.visited,['first','second'])
})
test('forked Session inherited prefix is never counted twice',async()=>{
  const parent=[start(0,1,DAY),end(1,1,DAY+7*hour)]
  const data=store([{id:'parent',events:parent},{
    id:'child',fork:true,inherited:2,events:[
      ...parent,start(2,2,DAY+7*hour),end(3,2,DAY+8*hour),
    ],
  }])
  assert.equal((await projectPersistedDshTurnWork(data,DAY+9*hour))?.confirmedCompletedTurnMs,8*hour)
})
test('terminal hook PRE turn/end and missing completion never fabricate work',async()=>{
  const data=store([{id:'running',events:[
    start(0,1,DAY),{seq:1,time:DAY+4*hour,type:'assistant/message',
      data:{content:'SECRET PROMPT/ATTACHMENT MUST NOT ESCAPE'}},
  ]}])
  const result=await projectPersistedDshTurnWork(data,DAY+9*hour)
  assert.equal(result?.confirmedCompletedTurnMs,0)
  assert.ok(!JSON.stringify(result).includes('SECRET'))
})
test('interrupted, aborted, blocked and max-tokens endings do not become completed work',async()=>{
  const data=store([{id:'mixed',events:[
    start(0,1,DAY),end(1,1,DAY+hour,'aborted'),
    start(2,2,DAY+hour),end(3,2,DAY+2*hour,'interrupted'),
    start(4,3,DAY+2*hour),end(5,3,DAY+3*hour,'blocked'),
    start(6,4,DAY+3*hour),end(7,4,DAY+4*hour,'max-tokens'),
    start(8,5,DAY+4*hour),end(9,5,DAY+5*hour),
  ]}])
  assert.equal((await projectPersistedDshTurnWork(data,DAY+6*hour))?.confirmedCompletedTurnMs,hour)
})
test('end UTC day defines attribution, no cross-day fake duplicated hours',async()=>{
  const a=Date.parse('2026-10-13T23:00:00Z')
  const b=Date.parse('2026-10-14T01:00:00Z')
  const data=store([{id:'cross',events:[start(0,1,a),end(1,1,b)]}])
  assert.equal((await projectPersistedDshTurnWork(data,b+hour))?.confirmedCompletedTurnMs,2*hour)
  assert.equal((await projectPersistedDshTurnWork(data,a))?.confirmedCompletedTurnMs,0)
})
test('Host log errors, missing sessions, duplicate id, sequence gaps and invalid fork cuts fail closed',async()=>{
  const fine={id:'a',events:[start(0,1,DAY),end(1,1,DAY+hour)]}
  assert.equal(await projectPersistedDshTurnWork(store([fine], 'a'),DAY+4*hour),null)
  assert.equal(await projectPersistedDshTurnWork(store([fine,fine]),DAY+4*hour),null)
  assert.equal(await projectPersistedDshTurnWork(store([{
    id:'gap',events:[start(3,1,DAY),end(4,1,DAY+hour)],
  }]),DAY+4*hour),null)
  assert.equal(await projectPersistedDshTurnWork(store([{
    id:'badfork',fork:false,inherited:2,events:[],
  }]),DAY+4*hour),null)
  assert.equal(await projectPersistedDshTurnWork(store([fine]),DAY+4*hour,
    {maxSessions:0}),null)
  assert.equal(await projectPersistedDshTurnWork(store([fine]),DAY+4*hour,
    {maxEvents:1}),null)
  assert.equal(await projectPersistedDshTurnWork(store([fine]),NaN),null)
})
test('malformed completion evidence cannot authorize an 8h physical Goal trigger',async()=>{
  const d=store([{id:'malformed',events:[
    start(0,1,DAY),end(1,2,DAY+8*hour),
  ]}])
  assert.equal(await projectPersistedDshTurnWork(d,DAY+9*hour),null)
  const orphan=store([{id:'unknown',events:[end(0,1,DAY+8*hour)]}])
  assert.equal(await projectPersistedDshTurnWork(orphan,DAY+9*hour),null)
  const forkRepair=store([{id:'child',fork:true,inherited:0,events:[
    end(0,1,DAY,'forked'),start(1,2,DAY),end(2,2,DAY+hour),
  ]}])
  assert.equal((await projectPersistedDshTurnWork(forkRepair,DAY+2*hour))?.confirmedCompletedTurnMs,hour)
})
test('no Host persistence is not an inferred zero-duration authorization',async()=>{
  const broken:PersistedWorkPort={async list(){throw Error('not installed')},
    async open(){throw Error('no connection')}}
  assert.equal(await projectPersistedDshTurnWork(broken,DAY+hour),null)
})
