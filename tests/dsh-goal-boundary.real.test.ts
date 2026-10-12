import assert from 'node:assert/strict'
import test from 'node:test'
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process'
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
const dshBin=process.env.AGENT_PICKET_DSH_BIN
const hostRoot=process.env.AGENT_PICKET_DSH_HOST
const run=!!dshBin&&!!hostRoot&&process.env.AGENT_PICKET_GOAL_BOUNDARY_NATIVE==='1'
test('isolated real DSH Goal driver settles round before blocking, and resumes with Host state',{
 skip:!run&&'Set isolated DSH bin/root and AGENT_PICKET_GOAL_BOUNDARY_NATIVE=1',timeout:40_000,
},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ap-goal-native-'))
 const log=join(dir,'events.log')
 const fixture=resolve(fileURLToPath(new URL('./fixtures/dsh-goal-boundary-smoke.mjs',import.meta.url)))
 const patch=join(dir,'goal.patch.yml')
 writeFileSync(patch,`- insert:\n    - id: test-goal-domain\n      name: '@deepseek-ai/dsh-goal'\n    - id: test-goal-driver\n      name: '@deepseek-ai/dsh-goal-round-driver'\n    - id: test-goal-fixture\n      name: ${JSON.stringify(fixture)}\n      inject: [llm, goals, agents]\n`)
 const logs:string[]=[],notifications:any[]=[],pending=new Map<number,(value:any)=>void>()
 let child:ChildProcessWithoutNullStreams|undefined
 try{
  child=spawn(dshBin!,['--profile','sdk-minimal','--patch',patch],{
   stdio:'pipe',env:{...process.env,DSH_HOME:join(dir,'home'),
    AGENT_PICKET_PROBE_LOG:log,HTTP_PROXY:'http://127.0.0.1:9',
    HTTPS_PROXY:'http://127.0.0.1:9',ALL_PROXY:'http://127.0.0.1:9'},
  })
  createInterface({input:child.stdout}).on('line',line=>{
    try{const value=JSON.parse(line);if(typeof value.id==='number'){
     pending.get(value.id)?.(value);pending.delete(value.id)
    }else notifications.push(value)}catch{logs.push(line.slice(0,300))}
  })
  child.stderr.on('data',v=>logs.push(String(v).slice(0,500)))
  let id=0
  const request=async(method:string,params:object)=>{
   const key=++id
   const response=new Promise<any>(resolve=>pending.set(key,resolve))
   child!.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n')
   const frame=await response
   assert.equal(frame.error,undefined,JSON.stringify(frame)+' / '+logs.join(''))
   return frame.result
  }
  const wait=async(testFn:()=>boolean,message:string)=>{
   for(let i=0;i<150;i++){
    if(testFn())return
    if(child!.exitCode!==null)break
    await new Promise(resolve=>setTimeout(resolve,30))
   }
   assert.fail(message+': '+(existsSync(log)?readFileSync(log,'utf8'):'')+' errors '+logs.join(''))
  }
  const lines=()=>existsSync(log)?readFileSync(log,'utf8').split('\n').filter(Boolean):[]
  await request('initialize',{cwd:dir,provider:'picket-goal-offline',model:'offline-test'})
  const sid='picket-goal-native-session'
  await request('session/prompt',{sessionId:sid,contentBlocks:[{type:'text',text:'START_GOAL_PROBE'}]})
  await wait(()=>lines().includes('strike-result:blocked')&&lines().filter(v=>v==='turn-end:completed').length>=2,'Goal reached an actual native blocked phase after completing one autonomous round')
  const count=lines().filter(v=>v==='model-call').length
  assert.equal(count,2,'initial human turn + one automatic Goal round must finish')
  assert.ok(lines().includes('goal-rounds:1'))
  await new Promise(resolve=>setTimeout(resolve,180))
  assert.equal(lines().filter(v=>v==='model-call').length,2,
   'After genuine Host Goal.block(), driver must not dispatch next round')
  await request('session/prompt',{sessionId:sid,contentBlocks:[{type:'text',text:'RESUME_GOAL_PROBE'}]})
  await wait(()=>lines().includes('goal-resumed:active'),'Official GoalService.resume() accepted resumed state')
  await wait(()=>lines().filter(v=>v==='model-call').length>=4,'Human resume turn and next Goal round')
  assert.ok(lines().includes('goal-created:active'))
  assert.ok(lines().includes('strike-result:blocked'))
  assert.ok(lines().includes('goal-resumed:active'))
  assert.ok(notifications.some(v=>v.method==='session.event'),'Real DSH event stream was present')
  await request('shutdown',{})
 }finally{
  if(child?.exitCode===null)child.kill('SIGTERM')
  await new Promise(resolve=>setTimeout(resolve,200))
  if(child?.exitCode===null)child.kill('SIGKILL')
  rmSync(dir,{recursive:true,force:true})
 }
})
