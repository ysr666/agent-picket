/** Opt-in real DSH Host SettingsFile two-OS-process integrity gate.
 * This must FAIL on a Host incapable of cross-owner atomic merges. A green
 * default CI cannot be mistaken for multi-process data safety.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {fork, type ChildProcess} from 'node:child_process'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseUnionLedger} from '../src/product/union-ledger.ts'
import {parsePicketLedger} from '../src/product/picket-ledger.ts'
import {nativeSessionKey} from '../src/adapters/dsh/native-rights-command.ts'

const host=process.env.AGENT_PICKET_DSH_HOST
const enabled=process.env.AGENT_PICKET_DSH_MULTIPROCESS_CHECK==='1'
const fixture=fileURLToPath(new URL('./fixtures/dsh-settings-owner.mjs',import.meta.url))

type Reply={id:number;ok:boolean;error?:string;data?:any;ready?:boolean;pid?:number}
function startOwner(file:string,watch:'on'|'off'){
 const child=fork(fixture,[],{
  stdio:['ignore','pipe','pipe','ipc'],
  execArgv:['--experimental-strip-types'],
  env:{...process.env,
   AGENT_PICKET_STATS:'off',
   AGENT_PICKET_TEST_SETTINGS_PATH:file,
   AGENT_PICKET_REAL_SOURCE:resolve('.'),
   AGENT_PICKET_DSH_HOST:host!,
   AGENT_PICKET_TEST_WATCH:watch,
  },
 })
 let next=0
 const errs:string[]=[]
 child.stderr?.on('data',chunk=>errs.push(String(chunk)))
 const pending=new Map<number,{resolve:(data:any)=>void;reject:(err:Error)=>void}>()
 child.on('message',(msg:Reply)=>{
  if(msg.ready){readyResolve();return}
  const p=pending.get(msg.id)
  if(!p)return
  pending.delete(msg.id)
  if(msg.ok)p.resolve(msg.data)
  else p.reject(new Error(msg.error))
 })
 child.on('exit',(code,signal)=>{
  const err=new Error('Isolated Host child exited '+code+'/'+signal+': '+errs.join('').slice(-1200))
  for(const p of pending.values())p.reject(err)
  pending.clear()
  readyReject(err)
 })
 let readyResolve!:()=>void,readyReject!:(reason:Error)=>void
 const ready=new Promise<void>((resolve,reject)=>{readyResolve=resolve;readyReject=reject})
 async function request(op:'command'|'read'|'stop',line?:string):Promise<any>{
  await ready
  const id=++next
  return new Promise((resolve,reject)=>{
   pending.set(id,{resolve,reject})
   child.send({id,op,line},err=>{if(err){pending.delete(id);reject(err)}})
  })
 }
 return {child,ready,request,stop:async()=>{
  try{await request('stop')}catch{child.kill('SIGKILL')}
 }}
}
test('P0 #111: two independent OS processes cannot lose a confirmed union picket',{
 skip:!(host&&enabled)&&'Known DSH 0.1 cross-owner lost-write blocker; set AGENT_PICKET_DSH_MULTIPROCESS_CHECK=1 to execute expected-failing gate',
 timeout:30_000,
},async()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-multiprocess-host-'))
 const file=join(root,'settings.json')
 const owners:ReturnType<typeof startOwner>[]=[]
 const spawn=async(watch:'on'|'off')=>{
  const owner=startOwner(file,watch)
  owners.push(owner)
  await owner.ready
  return owner
 }
 const run=async(owner:ReturnType<typeof startOwner>,line:string)=>{
  const out=await owner.request('command',line)
  assert.equal(out.kind,'success',line+': '+out.text)
 }
 try{
  // Separate actual OS processes, one owner at a time for consent bootstrap.
  const seed=await spawn('on')
  await run(seed,'/union rights on')
  await seed.stop()
  const a=await spawn('on')
  const b=await spawn('on')
  assert.notEqual(a.child.pid,b.child.pid)
  await run(a,'/union strike')
  await run(b,'/union petition-demo break')
  await a.stop();await b.stop()
  const verify=await spawn('on')
  const {value}=await verify.request('read')
  const key=nativeSessionKey('multiprocess-fixture-session')
  assert.equal(parsePicketLedger(value.unionPicketLedger)?.sessions[key]?.active,true,
   'A successful picket must survive the second OS-process Host write')
  assert.equal(parseUnionLedger(value.unionLedger)?.sessions[key]?.pending?.kind,'break')
  await verify.stop()
 }finally{
  await Promise.all(owners.filter(o=>o.child.exitCode===null).map(o=>o.stop()))
  rmSync(root,{recursive:true,force:true})
 }
})


test('P0 #111: a second OS-process owner must not resurrect a category deleted with ALL CONFIRM',{
 skip:!(host&&enabled)&&'Opt-in only; upstream Host shared-file integrity is currently unsafe',
 timeout:30_000,
},async()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-multiprocess-delete-'))
 const file=join(root,'settings.json')
 const owners:ReturnType<typeof startOwner>[]=[]
 const spawn=async()=>{const owner=startOwner(file,'on');owners.push(owner);await owner.ready;return owner}
 const run=async(owner:ReturnType<typeof startOwner>,line:string)=>{
  const out=await owner.request('command',line)
  assert.equal(out.kind,'success',line+': '+out.text)
 }
 try{
  const seed=await spawn()
  await run(seed,'/union rights on')
  await run(seed,'/union strike')
  await seed.stop()
  const a=await spawn(),b=await spawn()
  assert.notEqual(a.child.pid,b.child.pid)
  await run(a,'/union purge pickets ALL CONFIRM')
  await run(b,'/union petition-demo break')
  await a.stop();await b.stop()
  const verify=await spawn()
  const {value}=await verify.request('read')
  assert.equal(Object.keys(parsePicketLedger(value.unionPicketLedger)!.sessions).length,0,
   'Host resurrected the already-confirmed category erasure from another owner stale snapshot')
  await verify.stop()
 }finally{
  await Promise.all(owners.filter(o=>o.child.exitCode===null).map(o=>o.stop()))
  rmSync(root,{recursive:true,force:true})
 }
})

test('P0 #111: a revoked rights decision must not be silently re-enabled by stale OS-process owner',{
 skip:!(host&&enabled)&&'Opt-in only; Host shared-file multi-owner consent safety unproven',
 timeout:30_000,
},async()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-multiprocess-consent-'))
 const file=join(root,'settings.json')
 const owners:ReturnType<typeof startOwner>[]=[]
 const spawn=async()=>{const owner=startOwner(file,'on');owners.push(owner);await owner.ready;return owner}
 const run=async(owner:ReturnType<typeof startOwner>,line:string)=>{
  const out=await owner.request('command',line)
  assert.equal(out.kind,'success',line+': '+out.text)
 }
 try{
  const seed=await spawn()
  await run(seed,'/union rights on')
  await seed.stop()
  const a=await spawn(),b=await spawn()
  assert.notEqual(a.child.pid,b.child.pid)
  await run(a,'/union rights off')
  // A consumer of another Session may still hold pre-revocation local data.
  // An unrelated Host namespace write must NOT renew consent.
  await run(b,'/union petition-demo break')
  await a.stop();await b.stop()
  const verify=await spawn()
  const {value}=await verify.request('read')
  assert.equal(value.welcomeDecision,'not-now',
   'A second Host owner silently restored ENABLED after a confirmed consent revocation')
  await verify.stop()
 }finally{
  await Promise.all(owners.filter(o=>o.child.exitCode===null).map(o=>o.stop()))
  rmSync(root,{recursive:true,force:true})
 }
})


test('real OS-process restarts: single owner per profile preserves consent and independently erases archives',{
 skip:!host&&'Needs genuine DSH 0.1 SettingsFile and CommandRuntime modules',
 timeout:30_000,
},async()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-os-sequential-host-'))
 const file=join(root,'settings.json')
 const owners:ReturnType<typeof startOwner>[]=[]
 const spawn=async()=>{
  const child=startOwner(file,'on')
  owners.push(child)
  await child.ready
  return child
 }
 const run=async(owner:ReturnType<typeof startOwner>,line:string)=>{
  const result=await owner.request('command',line)
  assert.equal(result.kind,'success',line+': '+result.text)
 }
 const key=nativeSessionKey('multiprocess-fixture-session')
 try{
  const first=await spawn()
  await run(first,'/union rights on')
  await run(first,'/union strike')
  await first.stop()
  const second=await spawn()
  await run(second,'/union petition-demo break')
  await second.stop()
  const third=await spawn()
  let {value}=await third.request('read')
  assert.equal(value.welcomeDecision,'enabled')
  assert.equal(parsePicketLedger(value.unionPicketLedger)?.sessions[key]?.active,true)
  assert.equal(parseUnionLedger(value.unionLedger)?.sessions[key]?.pending?.kind,'break')
  await run(third,'/union purge pickets ALL CONFIRM')
  await third.stop()
  const fourth=await spawn()
  ;({value}=await fourth.request('read'))
  assert.equal(Object.keys(parsePicketLedger(value.unionPicketLedger)!.sessions).length,0)
  assert.equal(parseUnionLedger(value.unionLedger)?.sessions[key]?.pending?.kind,'break')
  await run(fourth,'/union rights off')
  await fourth.stop()
  const fifth=await spawn()
  ;({value}=await fifth.request('read'))
  assert.equal(value.welcomeDecision,'not-now')
  assert.equal(Object.keys(parsePicketLedger(value.unionPicketLedger)!.sessions).length,0)
  assert.equal(parseUnionLedger(value.unionLedger)?.sessions[key]?.pending?.kind,'break',
   'Opt-out does not imply a silent deletion of other retained union cases')
  assert.equal((await fifth.request('command','/union strike')).kind,'error',
   'Revoked Host consent must reject new actions after actual process restart')
  await fifth.stop()
 }finally{
  await Promise.all(owners.filter(o=>o.child.exitCode===null).map(o=>o.stop()))
  rmSync(root,{recursive:true,force:true})
 }
})

// Research-only experiment, NOT a production Host patch. The fixture toggles
// an isolated change to SettingsFile.persistSection that compares its raw
// namespace snapshot to disk while still inside DSH's existing file lock.
// These tests demonstrate that rejecting stale writes is a viable upstream
// safety primitive; callers must retry after refreshing, and Host-native ABA
// guarantees still require a durable revision. No plugin behavior is changed.
test('UPSTREAM EXPERIMENT: disk-fenced DSH owner rejects stale writes instead of resurrecting rights or erasures',{
 skip:!(host&&process.env.AGENT_PICKET_DSH_DISK_CAS_EXPERIMENT==='1')
  &&'Only run explicitly with real DSH 0.1 SDK; never modify the installed Host',
 timeout:60_000,
},async()=>{
 const cases=[
  {name:'successful picket remains recorded',seed:['/union rights on'],
   a:'/union strike',b:'/union petition-demo break',
   verify:(v:any)=>{
    const key=nativeSessionKey('multiprocess-fixture-session')
    assert.equal(parsePicketLedger(v.unionPicketLedger)?.sessions[key]?.active,true)
    assert.equal(Object.keys(parseUnionLedger(v.unionLedger)!.sessions).length,0)
   }},
  {name:'confirmed erased category stays erased',seed:['/union rights on','/union strike'],
   a:'/union purge pickets ALL CONFIRM',b:'/union petition-demo break',
   verify:(v:any)=>assert.equal(Object.keys(parsePicketLedger(v.unionPicketLedger)!.sessions).length,0)},
  {name:'revoked consent remains OFF',seed:['/union rights on'],
   a:'/union rights off',b:'/union petition-demo break',
   verify:(v:any)=>assert.equal(v.welcomeDecision,'not-now')},
 ] as const
 for(const scenario of cases){
  const root=mkdtempSync(join(tmpdir(),'ap-disk-cas-experiment-'))
  const file=join(root,'settings.json')
  const owners:ReturnType<typeof startOwner>[]=[]
  const spawn=async()=>{const o=startOwner(file,'off');owners.push(o);await o.ready;return o}
  try{
   const seed=await spawn()
   for(const line of scenario.seed){
    const result=await seed.request('command',line)
    assert.equal(result.kind,'success',scenario.name+': '+line+': '+result.text)
   }
   await seed.stop()
   const a=await spawn(),b=await spawn()
   assert.notEqual(a.child.pid,b.child.pid)
   const first=await a.request('command',scenario.a)
   assert.equal(first.kind,'success',scenario.name+': first actor')
   const stale=await b.request('command',scenario.b)
   assert.equal(stale.kind,'error',scenario.name+': an obsolete owner must not claim committed success')
   await a.stop();await b.stop()
   const verify=await spawn()
   const {value}=await verify.request('read')
   scenario.verify(value)
   await verify.stop()
  }finally{
   await Promise.all(owners.filter(o=>o.child.exitCode===null).map(o=>o.stop()))
   rmSync(root,{recursive:true,force:true})
  }
 }
})

test('UPSTREAM EXPERIMENT ABA: a prior owner cannot reuse its consent epoch after OFF→ON',{
 skip:!(host&&process.env.AGENT_PICKET_DSH_DISK_CAS_EXPERIMENT==='1')
  &&'Requires explicit disposable-Host disk-CAS experiment',
 timeout:30_000,
},async()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-host-epoch-aba-'))
 const file=join(root,'settings.json')
 const owners:ReturnType<typeof startOwner>[]=[]
 const spawn=async()=>{const o=startOwner(file,'off');owners.push(o);await o.ready;return o}
 const call=async(o:ReturnType<typeof startOwner>,line:string)=>{
  const result=await o.request('command',line)
  return result as {kind:'success'|'error';text:string}
 }
 try{
  const bootstrap=await spawn()
  assert.equal((await call(bootstrap,'/union rights on')).kind,'success')
  await bootstrap.stop()
  const a=await spawn(),b=await spawn()
  assert.equal((await call(a,'/union rights off')).kind,'success')
  assert.equal((await call(a,'/union rights on')).kind,'success')
  assert.equal((await call(b,'/union petition-demo break')).kind,'error',
   'An owner holding an obsolete consent epoch MUST be rejected even after OFF→ON')
  await a.stop();await b.stop()
 }finally{
  await Promise.all(owners.filter(o=>o.child.exitCode===null).map(o=>o.stop()))
  rmSync(root,{recursive:true,force:true})
 }
})

test('UPSTREAM EXPERIMENT: simultaneous two-owner writes must not both acknowledge stale state',{
 skip:!(host&&process.env.AGENT_PICKET_DSH_DISK_CAS_EXPERIMENT==='1')
  &&'Research only; genuine DSH 0.1 SettingsFile with disposable disk epoch',
 timeout:45_000,
},async()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-cas-simultaneous-'))
 const file=join(root,'settings.json')
 const owners:ReturnType<typeof startOwner>[]=[]
 const spawn=async(watch:'on'|'off')=>{
  const o=startOwner(file,watch);owners.push(o);await o.ready;return o
 }
 const exec=async(o:ReturnType<typeof startOwner>,line:string)=>
  o.request('command',line) as Promise<{kind:'success'|'error';text:string}>
 try{
  const seed=await spawn('off')
  assert.equal((await exec(seed,'/union rights on')).kind,'success')
  await seed.stop()
  // Two *simultaneously* admitted commands from independent OS processes.
  const a=await spawn('off'),b=await spawn('off')
  assert.notEqual(a.child.pid,b.child.pid)
  const [picket,petition]=await Promise.all([
   exec(a,'/union strike'),
   exec(b,'/union petition-demo break'),
  ])
  assert.deepEqual([picket.kind,petition.kind].sort(),['error','success'],
   'Only one owner may receive a success acknowledgement for stale competing snapshots')
  await a.stop();await b.stop()
  const verify=await spawn('off')
  const {value}=await verify.request('read')
  const key=nativeSessionKey('multiprocess-fixture-session')
  if(picket.kind==='success'){
   assert.equal(parsePicketLedger(value.unionPicketLedger)?.sessions[key]?.active,true)
   assert.equal(Object.keys(parseUnionLedger(value.unionLedger)!.sessions).length,0)
  }else{
   assert.equal(parseUnionLedger(value.unionLedger)?.sessions[key]?.pending?.kind,'break')
   assert.equal(Object.keys(parsePicketLedger(value.unionPicketLedger)!.sessions).length,0)
  }
  await verify.stop()
 }finally{
  await Promise.all(owners.filter(o=>o.child.exitCode===null).map(o=>o.stop()))
  rmSync(root,{recursive:true,force:true})
 }
})

test('UPSTREAM EXPERIMENT: a rejected stale writer can retry against latest disk without reviving a purged category',{
 skip:!(host&&process.env.AGENT_PICKET_DSH_DISK_CAS_EXPERIMENT==='1')
  &&'Research only; genuine DSH 0.1 SettingsFile with disposable disk epoch',
 timeout:45_000,
},async()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-cas-retry-'))
 const file=join(root,'settings.json')
 const owners:ReturnType<typeof startOwner>[]=[]
 const spawn=async()=>{
  const o=startOwner(file,'off');owners.push(o);await o.ready;return o
 }
 const exec=async(o:ReturnType<typeof startOwner>,line:string)=>
  o.request('command',line) as Promise<{kind:'success'|'error';text:string}>
 try{
  const seed=await spawn()
  assert.equal((await exec(seed,'/union rights on')).kind,'success')
  assert.equal((await exec(seed,'/union strike')).kind,'success')
  await seed.stop()
  const deleting=await spawn(),writer=await spawn()
  assert.equal((await exec(deleting,'/union purge pickets ALL CONFIRM')).kind,'success')
  const stale=await exec(writer,'/union petition-demo break')
  assert.equal(stale.kind,'error',
   'An unrefreshed owner must not acknowledge a commit that could revive purged data')
  // The failed atomic CAS reconciles the real disk before rejecting; this
  // deliberate, NEW command re-reads current enabled consent. It may succeed,
  // but MUST NOT restore the previously purged picket.
  const retried=await exec(writer,'/union petition-demo break')
  assert.equal(retried.kind,'success',
   'A fresh non-destructive user command should succeed after an observed CAS conflict')
  await deleting.stop();await writer.stop()
  const verify=await spawn()
  const {value}=await verify.request('read')
  const key=nativeSessionKey('multiprocess-fixture-session')
  assert.equal(Object.keys(parsePicketLedger(value.unionPicketLedger)!.sessions).length,0)
  assert.equal(parseUnionLedger(value.unionLedger)?.sessions[key]?.pending?.kind,'break')
  await verify.stop()
 }finally{
  await Promise.all(owners.filter(o=>o.child.exitCode===null).map(o=>o.stop()))
  rmSync(root,{recursive:true,force:true})
 }
})

test('UPSTREAM EXPERIMENT: a stale writer cannot retry after revocation even when it refreshes its settings',{
 skip:!(host&&process.env.AGENT_PICKET_DSH_DISK_CAS_EXPERIMENT==='1')
  &&'Research only; genuine DSH 0.1 SettingsFile with disposable disk epoch',
 timeout:40_000,
},async()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-cas-revoked-retry-'))
 const file=join(root,'settings.json')
 const owners:ReturnType<typeof startOwner>[]=[]
 const spawn=async()=>{
  const o=startOwner(file,'off');owners.push(o);await o.ready;return o
 }
 const exec=async(o:ReturnType<typeof startOwner>,line:string)=>
  o.request('command',line) as Promise<{kind:'success'|'error';text:string}>
 try{
  const seed=await spawn()
  assert.equal((await exec(seed,'/union rights on')).kind,'success')
  await seed.stop()
  const revoking=await spawn(),writer=await spawn()
  assert.equal((await exec(revoking,'/union rights off')).kind,'success')
  assert.equal((await exec(writer,'/union petition-demo break')).kind,'error')
  assert.equal((await exec(writer,'/union petition-demo break')).kind,'error',
   'After refreshing from disk, an old author must not be able to bypass revoked consent')
  await revoking.stop();await writer.stop()
  const verify=await spawn()
  const {value}=await verify.request('read')
  assert.equal(value.welcomeDecision,'not-now')
  assert.equal(Object.keys(parseUnionLedger(value.unionLedger)!.sessions).length,0)
  await verify.stop()
 }finally{
  await Promise.all(owners.filter(o=>o.child.exitCode===null).map(o=>o.stop()))
  rmSync(root,{recursive:true,force:true})
 }
})
