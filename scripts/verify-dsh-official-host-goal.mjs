/**
 * Real published DSH CLI + SDK-minimal Profile integration test.
 * Offline synthetic Turn data, no paid model or human source. This verifies
 * Goal's actual Host phase before any second autonomous model request.
 * It is not a Web/Desktop release signoff or production work-coverage proof.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here=dirname(fileURLToPath(import.meta.url))
const repo=resolve(here,'..')
const nodeRoot=resolve(repo,'.dsh-host-probe/node_modules')
const bin=join(nodeRoot,'@deepseek-ai/dsh/lib/bin.js')
const fixture=resolve(repo,'tests/fixtures/dsh-official-persistence-goal-host.mjs')
const delay=ms=>new Promise(r=>setTimeout(r,ms))

async function scenario(hours,consent){
  const work=mkdtempSync(join(tmpdir(),'picket-offline-host-'))
  const patch=join(work,'test.patch.yml')
  const events=join(work,'test.log')
  writeFileSync(patch,[
    '- insert:',
    '    - id: picket-test-official-goals',
    "      name: '@deepseek-ai/dsh-goal'",
    '    - id: picket-test-official-goal-round-driver',
    "      name: '@deepseek-ai/dsh-goal-round-driver'",
    '    - id: picket-test-official-work',
    '      name: '+JSON.stringify(fixture),
    '      inject: [llm, goals, agents, sessionPersistence]',
  ].join('\n')+'\n')
  let child
  let runError=''
  try{
    child=spawn(process.execPath,[bin,'--profile','sdk-minimal','--patch',patch],{
      cwd:work,
      env:{...process.env, DSH_HOME:join(work,'home'),
        AGENT_PICKET_DSH_HOST:nodeRoot,
        AGENT_PICKET_NATIVE_GOAL_LOG:events,
        AGENT_PICKET_NATIVE_GOAL_HOURS:String(hours),
        AGENT_PICKET_NATIVE_GOAL_CONSENT:consent?'yes':'no',
        DSH_TELEMETRY_DISABLED:'1',
        HTTP_PROXY:'http://127.0.0.1:9',
        HTTPS_PROXY:'http://127.0.0.1:9',
        ALL_PROXY:'http://127.0.0.1:9',
      },
      stdio:['pipe','pipe','pipe'],windowsHide:true,
    })
    const requests=new Map()
    const errors=[]
    createInterface({input:child.stdout}).on('line',str=>{
      try{
        const data=JSON.parse(str)
        if(typeof data.id==='number'&&requests.has(data.id)){
          requests.get(data.id)(data)
          requests.delete(data.id)
        }
      }catch{errors.push('non-JSON output')}
    })
    child.stderr.on('data',d=>errors.push(String(d).slice(-500)))
    const snapshot=()=>existsSync(events)?readFileSync(events,'utf8').trim().split(/\r?\n/u):[]
    let nextId=0
    async function rpc(method,params={}){
      const id=++nextId
      const response=new Promise((res,rej)=>{
        const timeout=setTimeout(()=>{requests.delete(id);rej(Error(
          'Official SDK RPC timeout '+method+' '+errors.slice(-3).join(' / ')))},18000)
        requests.set(id,value=>{clearTimeout(timeout);res(value)})
      })
      child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')
      const result=await response
      assert.equal(result.error,undefined,JSON.stringify(result.error)+' '+errors.join(' '))
      return result.result
    }
    async function until(predicate,label){
      for(let i=0;i<300;i++){
        if(predicate(snapshot()))return snapshot()
        if(child.exitCode!==null)break
        await delay(35)
      }
      throw Error(label+'; logs='+snapshot().join(',')+'; stderr='+errors.slice(-8).join(' / '))
    }
    await rpc('initialize',{cwd:work,provider:'picket-offline-persisted',model:'offline'})
    const created=await rpc('session/prompt',{
      sessionId:'picket-offline-host-goal',contentBlocks:[{type:'text',text:'START_OFFLINE_GOAL'}],
    })
    assert.equal(typeof created.messageId,'string')
    await until(s=>s.includes('inject-sessionPersistence:true')&&s.includes('inject-goals:true')
      &&s.includes('created:active'),'official Host injection and Goal creation')
    if(hours===8&&consent){
      await until(s=>s.includes('block:blocked:disarmed:revision-plus-one=true')&&
        s.includes('official-goal-change:block'),'official persisted-work Goal block')
      await delay(250)
      const all=snapshot()
      assert.equal(all.filter(s=>s==='model-call').length,1,
        'Official Goal must block next autonomous round BEFORE another model request')
      assert.ok(all.includes('durable-work:28800000'),
        'actual official persistence must supply exactly 8h')
    }else{
      await until(s=>s.filter(x=>x==='model-call').length>=2,
        '7h or no consent must not stop the next automatic model call')
      assert.ok(!snapshot().includes('official-goal-change:block'))
    }
    await rpc('shutdown')
    return {scenario:hours+'h / '+(consent?'consent':'no-consent'),
      modelCalls:snapshot().filter(s=>s==='model-call').length,
      genuineHostGoalBlock: snapshot().includes('official-goal-change:block')}
  }catch(error){
    runError=String(error)
    throw error
  }finally{
    if(child&&child.exitCode===null)child.kill('SIGTERM')
    await delay(200)
    if(child&&child.exitCode===null)child.kill('SIGKILL')
    if(runError)process.stderr.write('HOST_PROBE_ERROR='+runError+'\n')
    rmSync(work,{recursive:true,force:true})
  }
}
if(!existsSync(bin))throw Error('Install @deepseek-ai/dsh@0.2.0-rc.2 in .dsh-host-probe first')
for(const [hours,consent] of [[7,true],[8,false],[8,true]]){
  const result=await scenario(hours,consent)
  process.stdout.write(JSON.stringify({scope:'official-published-sdk-host-offline-only',...result})+'\n')
}
process.stdout.write('OFFICIAL_DSH_SDK_PERSISTED_WORK_GOAL_PROBE_PASS\n')
