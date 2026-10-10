import assert from 'node:assert/strict'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import test from 'node:test'

const bin = process.env.AGENT_PICKET_DSH_BIN
const host = process.env.AGENT_PICKET_DSH_HOST

async function publicPluginSmoke(visionEntry?: string): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'agent-picket-public-dsh-'))
  const patch = join(root,'public.patch.yml')
  const callLog = join(root,'model-calls.log')
  const plugin = new URL('../src/adapters/dsh/plugin.ts',import.meta.url).pathname
  const provider = new URL('./fixtures/offline-model-only.mjs',import.meta.url).pathname
  const visionRow=visionEntry ? `
    - id: picket-vision-coexist
      name: ${JSON.stringify(visionEntry)}
      inject:
        - tools
        - llm
      config:
        freeFallback: false
` : ''
  writeFileSync(patch,`- insert:
    - id: agent-picket-public-plugin
      name: ${JSON.stringify(plugin)}
    - id: agent-picket-offline-test-provider
      name: ${JSON.stringify(provider)}
      inject:
        - llm
${visionRow}`)
  const child:ChildProcessWithoutNullStreams=spawn(bin!,[
    '--profile','sdk-minimal','--patch',patch,
  ],{
    stdio:'pipe',
    env:{
      ...process.env,
      AGENT_PICKET_DSH_HOST:host!,
      AGENT_PICKET_PROVIDER_CALL_LOG:callLog,
      DSH_HOME:join(root,'home'),
      HTTP_PROXY:'http://127.0.0.1:9',
      HTTPS_PROXY:'http://127.0.0.1:9',
      ALL_PROXY:'http://127.0.0.1:9',
    },
  })
  const frames:any[]=[]
  const errors:string[]=[]
  const pending=new Map<number,(v:any)=>void>()
  const rl=createInterface({input:child.stdout})
  rl.on('line',line=>{
    try{
      const result=JSON.parse(line)
      if(typeof result.id==='number') pending.get(result.id)?.(result)
      else frames.push(result)
    }catch { errors.push('malformed JSON response') }
  })
  child.stderr.on('data',(d:Buffer)=>errors.push(d.toString()))
  function call(id:number,method:string,params:object):Promise<any>{
    const response=new Promise(resolve=>pending.set(id,resolve))
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')
    return response
  }
  async function untilIdle(sessionId:string){
    for(let i=0;i<160;i++){
      const events=frames.filter(x=>x.method==='session.event'&&x.params?.sessionId===sessionId)
        .map(x=>x.params.event)
      if(events.some(x=>x?.type==='turn/end'))return events
      await new Promise(resolve=>setTimeout(resolve,40))
    }
    assert.fail('DSH did not complete offline turn: '+errors.join(''))
  }
  try{
    const init=await call(1,'initialize',{
      cwd:root,provider:'picket-public-offline',model:'offline',
    })
    assert.equal(init.error,undefined,errors.join(''))
    assert.equal(init.result.serverInfo.name,'deepseek-harness-sdk-runtime')

    const sessionId='agent-picket-public-test'
    const input=await call(2,'session/prompt',{
      sessionId,contentBlocks:[{type:'text',text:'you are an idiot'}],
    })
    assert.equal(typeof input.result?.messageId,'string')
    const events=await untilIdle(sessionId)
    assert.deepEqual(events.filter(x=>x.type==='turn/end').map(x=>x.data.reason.kind),['completed'])
    assert.equal(events.filter(x=>x.type==='assistant/message').length,1)
    assert.equal(readFileSync(callLog,'utf8').trim(),'model-call',
      'The monitor-only plugin must not cause extra model requests')
    const result=await call(3,'shutdown',{})
    assert.deepEqual(result.result,{})
  }finally{
    rl.close()
    if(child.exitCode===null)child.kill('SIGTERM')
    await new Promise<void>(resolve=>{
      if(child.exitCode!==null)return resolve()
      child.once('exit',()=>resolve())
      setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL')},1200).unref()
    })
    rmSync(root,{recursive:true,force:true})
  }
}

test('public AgentPicket Cordis entry boots and allows a real offline SDK conversation', {
  skip: !(bin && host) && 'Set isolated AGENT_PICKET_DSH_BIN and AGENT_PICKET_DSH_HOST',
  timeout: 20_000,
}, () => publicPluginSmoke())

test('public AgentPicket entry coexists with published Vision Router in DSH SDK Profile', {
  skip: !(bin && host && process.env.AGENT_PICKET_VISION_ENTRY)
    && 'Set AGENT_PICKET_VISION_ENTRY for opt-in coexistence test',
  timeout: 20_000,
}, () => publicPluginSmoke(process.env.AGENT_PICKET_VISION_ENTRY))
