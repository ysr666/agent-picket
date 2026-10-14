/** Published DSH SDK Host cold restart + official Goal resume. No network model. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const repo=resolve(fileURLToPath(new URL('..',import.meta.url)))
const deps=join(repo,'.dsh-host-probe/node_modules')
const bin=join(deps,'@deepseek-ai/dsh/lib/bin.js')
const fixture=join(repo,'tests/fixtures/dsh-official-persistence-goal-host.mjs')
const delay=ms=>new Promise(done=>setTimeout(done,ms))
const root=mkdtempSync(join(tmpdir(),'picket-dsh-goal-cold-'))
const log=join(root,'events.log')
const patch=join(root,'profile.patch.yml')
const home=join(root,'home')
const scenarioLines=()=>existsSync(log)?readFileSync(log,'utf8').trim().split(/\r?\n/u):[]
writeFileSync(patch,[
  '- insert:',
  '    - id: picket-official-goal',
  "      name: '@deepseek-ai/dsh-goal'",
  '    - id: picket-official-goal-driver',
  "      name: '@deepseek-ai/dsh-goal-round-driver'",
  '    - id: picket-official-goal-probe',
  '      name: '+JSON.stringify(fixture),
  '      inject: [llm, goals, agents, sessionPersistence]',
].join('\n')+'\n')

function start(){
  const child=spawn(process.execPath,[bin,'--profile','sdk-minimal','--patch',patch],{
    cwd:root,stdio:['pipe','pipe','pipe'],windowsHide:true,
    env:{...process.env,DSH_HOME:home,AGENT_PICKET_DSH_HOST:deps,
      AGENT_PICKET_NATIVE_GOAL_LOG:log,AGENT_PICKET_NATIVE_GOAL_HOURS:'8',
      AGENT_PICKET_NATIVE_GOAL_CONSENT:'yes',
      DSH_TELEMETRY_DISABLED:'1',HTTP_PROXY:'http://127.0.0.1:9',
      HTTPS_PROXY:'http://127.0.0.1:9',ALL_PROXY:'http://127.0.0.1:9'},
  })
  const pending=new Map(),errors=[]
  let id=0
  createInterface({input:child.stdout}).on('line',line=>{
    try{const value=JSON.parse(line)
      if(typeof value.id==='number'&&pending.has(value.id)){
        pending.get(value.id)(value);pending.delete(value.id)
      }
    }catch{errors.push('bad SDK JSON frame')}
  })
  child.stderr.on('data',data=>errors.push(String(data).slice(-400)))
  async function rpc(method,params={}){
    const key=++id
    const awaited=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(key)
        reject(Error('DSH SDK RPC timeout '+method+' '+errors.slice(-4).join(';')))},15000)
      pending.set(key,value=>{clearTimeout(timer);resolve(value)})
    })
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n')
    const response=await awaited
    assert.equal(response.error,undefined,JSON.stringify(response.error))
    return response.result
  }
  async function stop(){
    if(child.exitCode===null)child.kill('SIGTERM')
    for(let i=0;i<50&&child.exitCode===null;i++)await delay(20)
    if(child.exitCode===null)child.kill('SIGKILL')
  }
  return {child,rpc,stop,errors}
}
async function until(predicate,label){
  for(let i=0;i<200;i++){
    if(predicate(scenarioLines()))return scenarioLines()
    await delay(40)
  }
  throw Error(label+'; log='+scenarioLines().slice(-25).join(','))
}
function filesUnder(dir){
  if(!existsSync(dir))return []
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const p=join(dir,entry.name)
    return entry.isDirectory()?filesUnder(p):[p]
  })
}
let app
try{
  app=start()
  await app.rpc('initialize',{cwd:root,provider:'picket-offline-persisted',model:'offline'})
  await app.rpc('session/prompt',{sessionId:'picket-offline-host-goal',
    contentBlocks:[{type:'text',text:'START_OFFLINE_GOAL'}]})
  await until(s=>s.includes('block:blocked:disarmed:revision-plus-one=true'),
    'Host should commit block before cold restart')
  assert.equal(scenarioLines().filter(x=>x==='model-call').length,1)
  await app.rpc('shutdown')
  await app.stop()
  const recordings=filesUnder(join(home,'sessions'))
  assert.ok(recordings.length>0,'official profile must materialize session files')
  assert.ok(recordings.some(p=>readFileSync(p,'utf8').includes('picket-work-limit')),
    'Host goal/change persisted block reason before process exit')
  app=start()
  await app.rpc('initialize',{cwd:root,provider:'picket-offline-persisted',model:'offline'})
  await delay(170)
  assert.equal(scenarioLines().filter(x=>x==='model-call').length,1,
    'Host cold boot cannot autonomously resume a blocked Goal')
  const control='picket-goal-cold-control'
  await app.rpc('session/prompt',{sessionId:control,
    contentBlocks:[{type:'text',text:'ATTACH_RESTORED_GOAL'}]})
  await until(s=>s.includes('cold-restored:blocked')
    &&s.includes('cold-reason:picket-work-limit')
    &&s.includes('cold-union-history:true'),
    'official registry must reattach blocked Goal from durable session')
  await app.rpc('session/prompt',{sessionId:control,
    contentBlocks:[{type:'text',text:'RESUME_RESTORED_GOAL'}]})
  await until(s=>s.includes('cold-resumed:active:revision-plus-one=true'),
    'official Host must resume exact cold-restored Goal revision')
  await until(s=>s.filter(x=>x==='model-call').length>=4,
    'cold-restored Goal must continue remaining automatic rounds')
  assert.equal(scenarioLines().filter(x=>x==='official-goal-change:block').length,1,
    'Host history prevents duplicate union strike on restart and resume')
  await app.rpc('shutdown')
  process.stdout.write('OFFICIAL_DSH_COLD_GOAL_RESUME_PASS phase=blocked->active, persisted=true, duplicateStrike=0\n')
}finally{
  if(app)await app.stop()
  rmSync(root,{recursive:true,force:true})
}
