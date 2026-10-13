import assert from 'node:assert/strict'
import test from 'node:test'
import {createDshGoalRecoveryPort} from '../src/adapters/dsh/client.ts'

type Projection={goal:unknown;roundsStarted?:number}
function setup(initial:Projection|null,{
 enabled=true,session='session-one',response={ok:true,value:{phase:'active',id:'goal-one',revision:4}} as any
}={}){
 let current=session
 let view=initial
 let count=0
 const calls:any[]=[]
 const active={
  session:{projections:{faceOf(name:string){assert.equal(name,'goal')
   return {getSnapshot:()=>view}}}}
 }
 const bindings=new Map<string,typeof active>()
 bindings.set(session,active)
 const port=createDshGoalRecoveryPort({
  currentSession:()=>current,
  binding:(id:string)=>bindings.get(id),
  resume:enabled?async (...args:any[])=>{count++;calls.push(args);return response}:undefined,
 })
 return {port,get count(){return count},calls,setView:(v:Projection|null)=>{view=v},
  select:(id:string)=>{current=id}}
}
const blocked=(overrides:Record<string,unknown>={})=>({roundsStarted:2,goal:{
 id:'goal-one',revision:3,phase:'blocked',
 blockedReason:{code:'picket-work-limit',message:'Do not leak this arbitrary Host text'},
 maxGoalRounds:15,objective:'Private user objective',...overrides,
}})
test('only genuine current union-blocked Goal is actionable; no raw objective returned',()=>{
 const t=setup(blocked())
 const v=t.port.read()
 assert.deepEqual(v,{sessionId:'session-one',goalId:'goal-one',revision:3,canResume:true})
 assert.doesNotMatch(JSON.stringify(v),/Private user objective/)
 t.setView(blocked({maxGoalRounds:2}))
 assert.equal(t.port.read()?.canResume,false)
 t.setView(blocked())
 for(const bad of [
  null,{goal:null},blocked({phase:'active'}),blocked({blockedReason:{code:'other'}}),
  blocked({revision:-1}),blocked({id:''}),
 ]){t.setView(bad);assert.equal(t.port.read(),null)}
})
test('official Goal CAS resume occurs only once, with exact Host session and revision',async()=>{
 const t=setup(blocked())
 const ref=t.port.read()!
 const value=await t.port.resume(ref)
 assert.equal(value,'requested')
 assert.equal(t.count,1)
 assert.deepEqual(t.calls,[['session-one',{id:'goal-one',revision:3}]])
 t.setView(blocked({revision:4}))
 await assert.rejects(t.port.resume(ref),/changed/)
 assert.equal(t.count,1)
})
test('official Goal service absent despite writable settings cannot show an enabled resume',()=>{
 const proj=blocked()
 let service=false
 const original={session:{projections:{faceOf:()=>({getSnapshot:()=>proj})}}}
 const port=createDshGoalRecoveryPort({
  currentSession:()=> 's',binding:()=>original,
  resume:async()=>({ok:true,value:{}}),isAvailable:()=>service,
 })
 assert.equal(port.read()?.canResume,false)
 service=true
 assert.equal(port.read()?.canResume,true)
})
test('unavailable Host RPC and switched/rebound Session fail closed before RPC',async()=>{
 const t=setup(blocked(),{enabled:false})
 const row=t.port.read()!
 assert.equal(row.canResume,false)
 await assert.rejects(t.port.resume(row),/unavailable/)
 const yes=setup(blocked()),before=yes.port.read()!
 yes.select('session-two')
 await assert.rejects(yes.port.resume(before),/changed/)
 yes.select('session-one');yes.setView(blocked({revision:4}))
 await assert.rejects(yes.port.resume(before),/changed/)
 assert.equal(yes.count,0)
})
test('Host refusal, malformed approval and uncertain response never declare recovery',async()=>{
 for(const reply of [{ok:false,error:{code:'stale'}},{ok:true,value:null},
  {ok:true,value:{id:'some-other-goal',phase:'active'}}]){
  const t=setup(blocked(),{response:reply})
  await assert.rejects(t.port.resume(t.port.read()!),/confirm|refused/)
  assert.equal(t.count,1)
 }
})
test('simultaneous double-resume is single-flight without implicit retry',async()=>{
 let done!: (value:any)=>void
 const wait=new Promise(resolve=>{done=resolve})
 let calls=0
 const projection=blocked()
 const original={session:{projections:{faceOf:()=>({getSnapshot:()=>projection})}}}
 const t=createDshGoalRecoveryPort({
  currentSession:()=> 's',
  binding:()=>original,
  resume:async()=>{calls++;return wait},
 })
 const hold=t.read()!
 const first=t.resume(hold)
 await assert.rejects(t.resume(hold),/pending/)
 assert.equal(calls,1)
 done({ok:true,value:{id:'goal-one',revision:4,phase:'active'}})
 assert.equal(await first,'requested')
})
