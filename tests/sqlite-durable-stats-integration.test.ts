import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtempSync,readFileSync,readdirSync,rmSync,chmodSync,renameSync,writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {dirname,join} from 'node:path'
import {SQLiteDurableStatsCandidate} from '../src/adapters/node/sqlite-durable-stats.experimental.ts'
import {createProtectedNtfsDirectory} from '../src/adapters/node/windows-private-acl.ts'
import {completedUtcDayWork} from '../src/adapters/dsh/goal-work-enforcement.ts'
import type {WorkEvent,HumanPrompt} from '../src/core/types.ts'

const event=(id:string,type:WorkEvent['type'],at:number):WorkEvent=>({
 id,agentId:'RAW_AGENT_SECRET',sessionId:'RAW_SESSION_SECRET',type,recordedAtMs:at,
})
const prompt:HumanPrompt={
 id:'PRIVATE_MESSAGE_ID',agentId:'RAW_AGENT_SECRET',sessionId:'RAW_SESSION_SECRET',
 receivedAtMs:100,provenance:{actor:'human',assurance:'verified'},
 segments:[{kind:'text',text:'PRIVATE_PROMPT_CONTENT'}],
}
function privateDir(){
 const path=mkdtempSync(join(tmpdir(),'ap-sqlite-stats-contract-'))
 if(process.platform==='win32'){
  const selected=join(path,'private')
  assert.equal(createProtectedNtfsDirectory(selected),true)
  return selected
 }
 chmodSync(path,0o700)
 return path
}
function cleanup(dir:string){
 rmSync(process.platform==='win32'?dirname(dir):dir,{recursive:true,force:true})
}
function open(dir:string,options:{classificationEnabled?:boolean}={}){
 return new SQLiteDurableStatsCandidate(dir,options)
}
test('experimental SQLite backend implements full DurableStats work/UTC/idempotence contract',()=>{
 const dir=privateDir()
 try{
  const a=open(dir)
  try{
   const start=Date.parse('2026-10-13T09:00:00Z')
   assert.equal(a.recordWork(event('secretStart','turn-start',start)),true)
   assert.equal(a.recordWork(event('secretStart','turn-start',start)),false)
   assert.equal(a.recordWork(event('secretTool1','tool-start',start+1)),true)
   assert.equal(a.recordWork(event('secretTool2','tool-end',start+2)),true)
   assert.equal(a.recordWork(event('secretEnd','turn-end',start+7*3_600_000)),true)
   assert.equal(a.snapshot().completedTurnMs,7*3_600_000)
   assert.equal(a.snapshot().turnStarts,1)
   assert.equal(a.snapshot().toolCalls,1)
   assert.equal(a.snapshot().toolResults,1)
   assert.equal(a.trustedWorkDays(31)?.at(-1)?.totals.completedTurnMs,7*3_600_000)
   assert.equal(a.recordDetection(prompt,{verdict:'targeted-abuse',confidence:1}),false)
  }finally{a.close()}
  const b=open(dir)
  try{
   assert.equal(b.recordWork(event('secretEnd','turn-end',Date.now())),false)
   assert.equal(b.snapshot().completedTurnMs,7*3_600_000)
   assert.equal(b.recordWork(event('orphanEnd','turn-end',Date.now())),true)
   assert.equal(b.snapshot().completedTurnMs,7*3_600_000,
    'Turn opened in previous process cannot count an invented interval')
   assert.deepEqual(b.snapshotDays(31).map(x=>x.day).sort(),
    ['2026-10-13',new Date().toISOString().slice(0,10)].filter((x,i,a)=>a.indexOf(x)===i).sort())
   b.reset()
   assert.equal(b.snapshot().completedTurnMs,0)
   assert.equal(b.recordWork(event('secretTool1','tool-start',Date.now())),true)
  }finally{b.close()}
  for(const file of readdirSync(dir)){
   const bytes=readFileSync(join(dir,file)).toString('utf8')
   for(const raw of ['RAW_AGENT_SECRET','RAW_SESSION_SECRET',
     'secretStart','secretEnd','PRIVATE_MESSAGE_ID','PRIVATE_PROMPT_CONTENT'])
    assert.equal(bytes.includes(raw),false,'Raw identifier in DB '+file)
  }
 }finally{cleanup(dir)}
})
test('experimental SQLite classification is strictly opt-in and persists without plaintext',()=>{
 const dir=privateDir()
 try{
  const a=open(dir,{classificationEnabled:true})
  assert.equal(a.recordDetection(prompt,{verdict:'targeted-abuse',confidence:0.9}),true)
  assert.equal(a.recordDetection(prompt,{verdict:'targeted-abuse',confidence:0.9}),false)
  a.close()
  const b=open(dir,{classificationEnabled:true})
  try{
   assert.equal(b.snapshot().checked,1)
   assert.equal(b.snapshot().targeted,1)
  }finally{b.close()}
 }finally{cleanup(dir)}
})
test('closed ledger never offers trusted Goal work',()=>{
 const dir=privateDir()
 try{
  const s=open(dir)
  s.close()
  assert.equal(s.trustedWorkDays(31),null)
  assert.throws(()=>s.recordWork(event('id','turn-start',100)),/unavailable/)
 }finally{cleanup(dir)}
})

test('candidate enforces below-threshold then 8h trusted UTC-day Goal evidence',()=>{
 const dir=privateDir()
 const start=Date.parse('2026-10-13T08:00:00Z')
 try{
  const a=open(dir)
  try{
   a.recordWork(event('s1','turn-start',start))
   a.recordWork(event('e1','turn-end',start+7*3_600_000))
   assert.equal(completedUtcDayWork(a.trustedWorkDays(31)??undefined,start+7*3_600_000),7*3_600_000)
   a.recordWork(event('s2','turn-start',start+7*3_600_000))
   a.recordWork(event('e2','turn-end',start+8*3_600_000))
   assert.equal(completedUtcDayWork(a.trustedWorkDays(31)??undefined,start+8*3_600_000),8*3_600_000)
  }finally{a.close()}
  const b=open(dir)
  assert.equal(completedUtcDayWork(b.trustedWorkDays(31)??undefined,start+8*3_600_000),8*3_600_000)
  b.close()
 }finally{cleanup(dir)}
})

test('an open SQLite DB path replacement cannot authorize stale Goal work',{
 skip:process.platform==='win32'&&'Windows locked database rename semantics require native review',
},()=>{
 const dir=privateDir(),start=Date.parse('2026-10-13T08:00:00Z')
 try{
  const s=open(dir)
  try{
   s.recordWork(event('start','turn-start',start))
   s.recordWork(event('end','turn-end',start+8*3_600_000))
   assert.equal(s.trustedWorkDays(31)?.at(-1)?.totals.completedTurnMs,8*3_600_000)
   renameSync(join(dir,'work.v2.sqlite'),join(dir,'removed.sqlite'))
   writeFileSync(join(dir,'work.v2.sqlite'),'')
   assert.equal(s.trustedWorkDays(31),null)
   assert.equal(completedUtcDayWork(s.trustedWorkDays(31)??undefined,start+8*3_600_000),null)
  }finally{s.close()}
 }finally{cleanup(dir)}
})


test('Windows private ACL revocation invalidates real 8h Goal evidence immediately',{
 skip:process.platform!=='win32'&&'Requires actual Windows NTFS ACL change',
 timeout:50_000,
},()=>{
 const dir=privateDir()
 const start=Date.parse('2026-10-13T08:00:00Z')
 const dbPath=join(dir,'work.v2.sqlite')
 let ledger:SQLiteDurableStatsCandidate|undefined
 try{
  ledger=open(dir)
  ledger.recordWork(event('start','turn-start',start))
  ledger.recordWork(event('end','turn-end',start+8*3_600_000))
  assert.equal(completedUtcDayWork(ledger.trustedWorkDays(31)??undefined,
   start+8*3_600_000),8*3_600_000)
  // Deliberately broaden the ACL of the *open* SQLite main file; the
  // batched verifier must not keep a previously cached "private" verdict.
  const granted=spawnSync('icacls',[dbPath,'/grant','*S-1-1-0:(R)'],{
   encoding:'utf8',windowsHide:true,timeout:10_000,
  })
  assert.equal(granted.status,0,granted.stderr??'Cannot inject test ACL')
  assert.equal(ledger.trustedWorkDays(31),null,
   'A public read ACE revokes permission to use even already-recorded 8h')
  assert.equal(completedUtcDayWork(ledger.trustedWorkDays(31)??undefined,
    start+8*3_600_000),null,'No physical Goal threshold from compromised DB')
  assert.throws(()=>ledger!.recordWork(event('more','tool-start',start+10)),
   /unavailable/,'Store remains faulted after native DACL tamper')
 }finally{
  ledger?.close()
  cleanup(dir)
 }
})
