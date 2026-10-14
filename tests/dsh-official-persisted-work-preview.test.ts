import assert from 'node:assert/strict'
import test from 'node:test'
import {
  inspectOfficialPersistedDay,registerOfficialPersistedGoalPreview,
  type OfficialPersistedEvent,type OfficialPersistedPort,
} from '../src/adapters/dsh/official-persisted-work-preview.ts'

const NOW=Date.parse('2026-10-14T12:00:00.000Z')
const HOUR=3_600_000
const st=(seq:number,turn:number,time:number):OfficialPersistedEvent=>({
  seq, type:'turn/start', time,data:{turn},
})
const en=(seq:number,turn:number,time:number,kind='completed'):OfficialPersistedEvent=>({
  seq,type:'turn/end',time,data:{turn,reason:{kind}},
})
type Corpus={id:string;rows:readonly OfficialPersistedEvent[];fork?:boolean;cut?:number}
function provider(corpus:readonly Corpus[],fault=false):OfficialPersistedPort{
  return {
    async list(){
      if(fault)throw Error('Host persistence unavailable')
      return corpus.map(s=>({header:{id:s.id,isSeeded:s.fork===true}}))
    },
    async open(id,access){
      assert.equal(access,'read')
      const session=corpus.find(x=>x.id===id)
      assert.ok(session)
      return {header:{id,isSeeded:session.fork===true},
        inheritedEventCount:session.cut??0,
        async read(offset=0,length=256){
          return {events:session.rows.slice(offset,offset+length)}
        },async close(){},
      }
    },
  }
}
const hours=(count:number):Corpus=>({id:'prior',rows:[
  st(0,1,NOW-count*HOUR),en(1,1,NOW-500,count===8?'completed':'completed'),
]})
function setup(storage:OfficialPersistedPort,{consent=true,foreign=false,
  history=[] as unknown[],late=()=>{},
}={}){
  const consentValue={kind:'agent-picket-real-goal-strike-v1',
    hostAuthenticated:true,enabled:true} as const
  const agent={id:'agent1',session:{id:'session1',snapshotEvents:()=>history}}
  const goal={id:'goal1',revision:9,phase:'active' as const,
    activation:'armed' as const,roundsStarted:1}
  const blocks:{id:string;revision:number}[]=[]
  let preStep:((payload:any,next:()=>Promise<unknown>)=>Promise<unknown>)|undefined
  const owner={
    agents:{get:()=>foreign?undefined:agent},
    sessionPersistence:storage,
    goals:{get:()=>goal,block:(_agent:unknown,ref:{id:string;revision:number})=>{
      blocks.push(ref)
      return {...goal,phase:'blocked' as const,
        activation:'disarmed' as const,revision:ref.revision+1}
    }},
    on:(_name:string,callback:(payload:any,next:()=>Promise<unknown>)=>Promise<unknown>)=>{
      preStep=callback
    },
  }
  registerOfficialPersistedGoalPreview({inject:(_services:any,cb:any)=>cb(owner)},{
    consent:()=>consent?consentValue:null,
    now:()=>{late();return NOW},
  })
  const goalMsg={source:{kind:'goal',goalId:'goal1',revision:9,round:1}}
  async function attempt(messages:readonly unknown[]=[goalMsg]){
    assert.ok(preStep)
    return preStep({agent,messages},async()=>({kind:'enter'}))
  }
  return {attempt,blocks,goalMsg}
}
test('official provider projects completed Turn lower bound without claiming full coverage',async()=>{
  const work=await inspectOfficialPersistedDay(provider([{id:'prior',
    rows:[st(0,1,NOW-8*HOUR),en(1,1,NOW)]}]),NOW)
  assert.deepEqual(work,{day:'2026-10-14',
    confirmedCompletedTurnMs:8*HOUR,coverage:'durable-prefix-lower-bound'})
})
test('actual pre-step adapter blocks ONLY a single automatic Goal round at >=8h',async()=>{
  const t=setup(provider([{id:'prior',rows:[
    st(0,1,NOW-8*HOUR),en(1,1,NOW)]}]))
  assert.deepEqual(await t.attempt(),{kind:'reject'})
  assert.deepEqual(t.blocks,[{id:'goal1',revision:9}])
})
test('below 8h, revoked consent and mixed human/Goal messages pass downstream',async()=>{
  const eight=provider([{id:'prior',rows:[st(0,1,NOW-8*HOUR),en(1,1,NOW)]}])
  const seven=setup(provider([{id:'prior',rows:[
    st(0,1,NOW-7*HOUR),en(1,1,NOW)]}]))
  const revoked=setup(eight,{consent:false})
  const mixed=setup(eight)
  assert.deepEqual(await seven.attempt(),{kind:'enter'})
  assert.deepEqual(await revoked.attempt(),{kind:'enter'})
  assert.deepEqual(await mixed.attempt([mixed.goalMsg,{source:{kind:'user'}}]),{kind:'enter'})
  assert.equal(seven.blocks.length+revoked.blocks.length+mixed.blocks.length,0)
})
test('unknown provider, malformed event seq, failed Turns and unfinished Turn never create a block',async()=>{
  const data=[
    provider([],true),
    provider([{id:'bad',rows:[st(3,1,NOW-8*HOUR),en(4,1,NOW)]}]),
    provider([{id:'failed',rows:[st(0,1,NOW-8*HOUR),en(1,1,NOW,'aborted')]}]),
    provider([{id:'running',rows:[st(0,1,NOW-8*HOUR)]}]),
  ]
  for(const port of data){
    const t=setup(port)
    assert.deepEqual(await t.attempt(),{kind:'enter'})
    assert.equal(t.blocks.length,0)
  }
})
test('fork child does not count parent history twice',async()=>{
  const parent=[st(0,1,NOW-7*HOUR),en(1,1,NOW-HOUR)]
  const fork=provider([{id:'parent',rows:parent},
    {id:'child',fork:true,cut:2,rows:[
      ...parent,st(2,2,NOW-HOUR),en(3,2,NOW),
    ]}])
  const projection=await inspectOfficialPersistedDay(fork,NOW)
  assert.equal(projection?.confirmedCompletedTurnMs,7*HOUR)
  const t=setup(fork)
  assert.deepEqual(await t.attempt(),{kind:'enter'})
})
test('Host agent identity, previously blocked history and fresh consent fence stop repeated CAS',async()=>{
  const eight=provider([{id:'prior',rows:[st(0,1,NOW-8*HOUR),en(1,1,NOW)]}])
  const foreign=setup(eight,{foreign:true})
  assert.deepEqual(await foreign.attempt(),{kind:'enter'})
  const blocked=setup(eight,{history:[{type:'goal/change',data:{
    operation:'block',updatedAt:NOW-100,
    goal:{id:'goal1',blockedReason:{code:'picket-work-limit'}}}}]})
  assert.deepEqual(await blocked.attempt(),{kind:'enter'})
  assert.equal(foreign.blocks.length+blocked.blocks.length,0)
})
test('a true read error is unavailable, not the false zero of a separate Windows ledger',async()=>{
  assert.equal(await inspectOfficialPersistedDay(provider([],true),NOW),null)
  assert.equal(await inspectOfficialPersistedDay(provider([]),NOW),null)
})
