/**
 * Actual DSH 0.1.7/0.2.x JSON Storage SDK in independent OS processes.
 * Observes KV storage contract, NOT Host SettingsForms authorization CAS.
 * Research test outcomes are not release-acceptance results.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {fork} from 'node:child_process'
import {mkdtempSync,rmSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'

const sdk=process.env.AGENT_PICKET_MODERN_STORAGE_SDK
const active=process.env.AGENT_PICKET_MODERN_STORAGE_CHECK==='1'
const fixture=fileURLToPath(new URL('./fixtures/dsh-storage-json-owner.mjs',import.meta.url))
type Reply={ready?:boolean;id?:number;ok?:boolean;error?:string;data?:any}
function start(root:string,layout:'single'|'per-record'){
 const child=fork(fixture,[],{
  stdio:['ignore','pipe','pipe','ipc'],
  env:{...process.env,AGENT_PICKET_STORAGE_SDK:sdk!,
   AGENT_PICKET_STORAGE_ROOT:root,AGENT_PICKET_STORAGE_LAYOUT:layout},
 })
 let next=0,resolveReady!:()=>void,rejectReady!:(e:Error)=>void
 const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject})
 const pending=new Map<number,{resolve:(d:any)=>void;reject:(e:Error)=>void}>()
 let stderr=''
 child.stderr?.on('data',d=>stderr+=String(d))
 child.on('message',(m:Reply)=>{
  if(m.ready){resolveReady();return}
  if(typeof m.id!=='number')return
  const p=pending.get(m.id)
  if(!p)return
  pending.delete(m.id)
  if(m.ok)p.resolve(m.data)
  else p.reject(new Error(m.error??'Unknown storage SDK error'))
 })
 child.on('exit',(code,signal)=>{
  const err=new Error('Storage SDK child exited: '+code+'/'+signal+'; '+stderr.slice(-900))
  rejectReady(err)
  for(const p of pending.values())p.reject(err)
  pending.clear()
 })
 async function request(op:'put'|'delete'|'read'|'stop',key?:string,value?:unknown):Promise<any>{
  await ready
  const id=++next
  return new Promise((resolve,reject)=>{
   pending.set(id,{resolve,reject})
   child.send({id,op,key,value},e=>{if(e){pending.delete(id);reject(e)}})
  })
 }
 return {child,ready,request,stop:async()=>{
  if(child.exitCode!==null||child.killed)return
  try{await request('stop')}catch{child.kill('SIGKILL')}
 }}
}
async function scenario(layout:'single'|'per-record',
 run:(x:{spawn:()=>Promise<ReturnType<typeof start>>})=>Promise<void>){
 const root=mkdtempSync(join(tmpdir(),'picket-modern-storage-'))
 const owners:ReturnType<typeof start>[]=[]
 const spawn=async()=>{
  const o=start(root,layout);owners.push(o);await o.ready;return o
 }
 try{await run({spawn})}
 finally{
  await Promise.all(owners.map(o=>o.stop()))
  rmSync(root,{recursive:true,force:true})
 }
}
const opts={skip:(!active||!sdk)&&'Opt-in with genuine modern DSH Storage SDK',
 timeout:30_000} as const

test('MODERN STORAGE single: unrelated old-owner upsert resurrects an erased record',opts,async()=>{
 await scenario('single',async({spawn})=>{
  const seed=await spawn()
  await seed.request('put','picket',{active:true})
  await seed.request('put','consent',{enabled:true})
  await seed.stop()
  const a=await spawn(),b=await spawn()
  assert.notEqual(a.child.pid,b.child.pid)
  await a.request('delete','picket')
  await b.request('put','petition',{kind:'break'})
  await a.stop();await b.stop()
  const cold=await spawn(),state=(await cold.request('read')).tables.ledger
  assert.equal(state.picket?.active,true,
   'Single-unit last-write-wins can resurrect a record erased by another process')
  assert.equal(state.petition?.kind,'break')
 })
})
test('MODERN STORAGE single: unrelated old-owner upsert restores prior consent record',opts,async()=>{
 await scenario('single',async({spawn})=>{
  const seed=await spawn()
  await seed.request('put','consent',{enabled:true})
  await seed.stop()
  const a=await spawn(),b=await spawn()
  await a.request('put','consent',{enabled:false})
  await b.request('put','petition',{kind:'break'})
  await a.stop();await b.stop()
  const cold=await spawn(),state=(await cold.request('read')).tables.ledger
  assert.equal(state.consent.enabled,true,'Old whole-unit snapshot restores earlier value')
 })
})
test('MODERN STORAGE per-record: unrelated upsert preserves other key erasure',opts,async()=>{
 await scenario('per-record',async({spawn})=>{
  const seed=await spawn()
  await seed.request('put','picket',{active:true})
  await seed.stop()
  const a=await spawn(),b=await spawn()
  await a.request('delete','picket')
  await b.request('put','petition',{kind:'break'})
  await a.stop();await b.stop()
  const cold=await spawn(),state=(await cold.request('read')).tables.ledger
  assert.equal(state.picket,undefined)
  assert.equal(state.petition?.kind,'break')
 })
})
test('MODERN STORAGE per-record: same-key old-owner write can recreate deleted record',opts,async()=>{
 await scenario('per-record',async({spawn})=>{
  const seed=await spawn()
  await seed.request('put','union_state',{consent:true,picket:true})
  await seed.stop()
  const a=await spawn(),b=await spawn()
  await a.request('delete','union_state')
  await b.request('put','union_state',{consent:true,picket:true})
  await a.stop();await b.stop()
  const cold=await spawn(),state=(await cold.request('read')).tables.ledger
  assert.equal(state.union_state?.picket,true,
   'Per-record atomic replacement does not imply same-key version CAS')
 })
})
test('MODERN STORAGE migrated legacy single-unit file can re-seed deleted last per-record entry',opts,async()=>{
 const root=mkdtempSync(join(tmpdir(),'picket-modern-migration-'))
 const owners:ReturnType<typeof start>[]=[]
 const spawn=async(layout:'single'|'per-record')=>{
  const o=start(root,layout);owners.push(o);await o.ready;return o
 }
 try{
  const legacy=await spawn('single')
  await legacy.request('put','case',{kind:'question-rule',retained:true})
  await legacy.stop()
  const migrated=await spawn('per-record')
  const loaded=(await migrated.request('read')).tables.ledger
  assert.equal(loaded.case?.retained,true,'Legacy single-unit bootstrap imported its record')
  await migrated.request('delete','case')
  assert.equal(existsSync(join(root,'picket_storage_probe','ledger','case.json')),false,
   'Explicit delete did remove the only new-layout record from disk')
  assert.equal(existsSync(join(root,'picket_storage_probe.json')),true,
   'The legacy whole-unit file was intentionally preserved during migration')
  const afterDelete=(await migrated.request('read')).tables.ledger
  assert.equal(afterDelete.case?.retained,true,
   'After deleting the last per-record JSON, legacy file re-seeds the erased record')
  await migrated.stop()
  const cold=await spawn('per-record')
  assert.equal((await cold.request('read')).tables.ledger.case?.retained,true,
   'A cold restarted SDK also reimports the case from retained legacy document')
 }finally{
  await Promise.all(owners.map(o=>o.stop()))
  rmSync(root,{recursive:true,force:true})
 }
})

test('MODERN MIGRATION SAFETY: erased last migrated record must stay erased on reopen',{
 skip:(!(active&&sdk)||process.env.AGENT_PICKET_MODERN_MIGRATION_GATE!=='1')
  &&'Run only as the strict real-SDK migration erasure release gate',
 timeout:30_000,
},async()=>{
 const root=mkdtempSync(join(tmpdir(),'picket-modern-migration-release-gate-'))
 const owners:ReturnType<typeof start>[]=[]
 const spawn=async(layout:'single'|'per-record')=>{
  const o=start(root,layout);owners.push(o);await o.ready;return o
 }
 try{
  const prior=await spawn('single')
  await prior.request('put','case',{kind:'question-rule',retained:true})
  await prior.stop()
  const migrated=await spawn('per-record')
  assert.equal((await migrated.request('read')).tables.ledger.case?.retained,true)
  await migrated.request('delete','case')
  assert.equal(existsSync(join(root,'picket_storage_probe','ledger','case.json')),false)
  await migrated.stop()
  const cold=await spawn('per-record')
  assert.equal((await cold.request('read')).tables.ledger.case,undefined,
   'MIGRATION_ERASURE_NO_GO: a previously deleted record must never reappear from retained old-layout data')
 }finally{
  await Promise.all(owners.map(o=>o.stop()))
  rmSync(root,{recursive:true,force:true})
 }
})
