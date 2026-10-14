/**
 * Published official DSH CLI + profile INSTALLED Agent Picket tarball.
 * No user Home, API key or model/network activity. Synthetic work only.
 * A real first-run UI click and real browser attachments remain separate gates.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo=resolve(fileURLToPath(new URL('..',import.meta.url)))
const rootDeps=join(repo,'.dsh-host-probe','node_modules')
const cli=join(rootDeps,'@deepseek-ai/dsh/lib/bin.js')
const fixture=join(repo,'tests/fixtures/dsh-packaged-agent-picket-goal.mjs')
const sleep=ms=>new Promise(done=>setTimeout(done,ms))
const parent=mkdtempSync(join(tmpdir(),'picket-dsh-installed-'))
let archive=''
try{
  const packArgs=['pack','--ignore-scripts','--silent','--pack-destination',parent]
  const packed=spawnSync(
    process.platform==='win32'?'cmd.exe':'npm',
    process.platform==='win32'
      ? ['/d','/s','/c','npm pack --ignore-scripts --silent --pack-destination "'+parent+'"']
      : packArgs,
    {cwd:repo,encoding:'utf8',timeout:35000,windowsHide:true,
      env:{...process.env,npm_config_offline:'true'}})
  assert.equal(packed.status,0,'isolated npm pack: '+String(packed.stderr).slice(-500))
  archive=join(parent,packed.stdout.trim().split(/\r?\n/).at(-1))
  assert.ok(archive.endsWith('.tgz')&&existsSync(archive),'packaged tarball is required')
  for(const [hours,consent] of [[7,true],[8,false],[8,true]]){
    const temp=mkdtempSync(join(parent,'host-'))
    const home=join(temp,'home')
    const log=join(temp,'events.log')
    const patch=join(temp,'probe.patch.yml')
    const {writeFileSync}=await import('node:fs')
    writeFileSync(patch,[
      '- insert:',
      '    - id: packaged-picket-host-fixture',
      '      name: '+JSON.stringify(fixture),
      '      inject: [llm, goals, agents, sessionPersistence, settings]',
    ].join('\n')+'\n')
    const env={...process.env,
      DSH_HOME:home,AGENT_PICKET_DSH_HOST:rootDeps,
      PICKET_PACKAGED_PROBE_LOG:log,
      PICKET_PACKAGED_HOURS:String(hours),
      PICKET_PACKAGED_CONSENT:consent?'on':'off',
      AGENT_PICKET_STATS:'off',
      AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW:'on',
      DSH_TELEMETRY_DISABLED:'1',
      DEEPSEEK_API_KEY:'',OPENAI_API_KEY:'',
      HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9',
      ALL_PROXY:'http://127.0.0.1:9',
    }
    // This is the supported profile plugin install path, NOT a direct import
    // of the source plugin or a --patch reference pretending installation.
    const installEnv={...process.env,DSH_HOME:home,
      DEEPSEEK_API_KEY:'',OPENAI_API_KEY:'',
      DSH_TELEMETRY_DISABLED:'1'}
    // Installation legitimately resolves the tarball's declared dependencies.
    // The dummy network proxy is deliberately applied ONLY when the offline
    // Host runs, never to the package-manager installation subprocess.
    const install=spawnSync(process.execPath,[cli,'plugin','--profile','sdk',
      'add',archive],{cwd:temp,env:installEnv,encoding:'utf8',timeout:110000,
      maxBuffer:1024*1024})
    assert.equal(install.status,0,
      'official DSH profile install failed: '+String(install.stderr).slice(-800)
      +' stdout='+String(install.stdout).slice(-400))
    let child
    try{
      child=spawn(process.execPath,[cli,'--profile','sdk','--patch',patch],{
        cwd:temp,env,stdio:['pipe','pipe','pipe'],windowsHide:true,
      })
      let nextId=0
      const pending=new Map()
      const errors=[]
      createInterface({input:child.stdout}).on('line',line=>{
        try{
          const response=JSON.parse(line)
          if(typeof response.id==='number'&&pending.has(response.id)){
            pending.get(response.id)(response)
            pending.delete(response.id)
          }
        }catch{errors.push('Unexpected non-JSON DSH SDK stdout')}
      })
      child.stderr.on('data',chunk=>{
        // Never emit the authentication token, raw prompt or user data.
        errors.push(String(chunk).slice(-1000))
      })
      async function rpc(method,params={}){
        const id=++nextId
        const result=new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>{pending.delete(id)
            reject(Error('SDK RPC timeout '+method+': '+errors.slice(-3).join(' / ')))},30000)
          pending.set(id,r=>{clearTimeout(timer);resolve(r)})
        })
        child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')
        const returned=await result
        assert.equal(returned.error,undefined,
          'SDK '+method+' '+JSON.stringify(returned.error)+' '+errors.slice(-2).join(' / '))
        return returned.result
      }
      const snapshot=()=>existsSync(log)?readFileSync(log,'utf8').trim().split(/\r?\n/u):[]
      async function until(check,what){
        for(let i=0;i<400;i++){
          if(check(snapshot()))return snapshot()
          if(child.exitCode!==null)break
          await sleep(35)
        }
        throw Error(what+'; structural fixture markers='+snapshot().slice(-35).join(',')+
          '; Host startup='+errors.slice(-8).join(' / '))
      }
      await rpc('initialize',{cwd:temp,provider:'packaged-picket-offline',model:'offline'})
      const accepted=await rpc('session/prompt',{
        sessionId:'packaged-picket-real-profile-goal',
        contentBlocks:[{type:'text',text:'START_PACKAGED_GOAL'}],
      })
      assert.equal(typeof accepted.messageId,'string')
      await until(s=>s.includes('official-ctx:loaded')&&
        s.includes('installed-settings:present')&&
        s.includes('real-goal:created:active'),
      'installed Picket must expose settings and create real Goal')
      if(hours===8&&consent){
        await until(s=>s.some(row=>row.startsWith('official-goal:block:blocked:')),
          'actual packaged plugin must durably record official blocked Goal')
        await sleep(250)
        assert.equal(snapshot().filter(s=>s==='model-call').length,1,
          'no second autonomous model request while genuinely blocked')
        const before=snapshot().find(s=>s.startsWith('official-goal:revision:'))
        assert.ok(before,'real Host Goal revision missing')
        // User request is not an autonomous Goal message. It must be admitted
        // and may exercise Host CAS resume rather than Picket's rejection.
        const human=await rpc('session/prompt',{
          sessionId:'packaged-picket-real-profile-goal',
          contentBlocks:[{type:'text',text:'RESUME_PACKAGED_GOAL'}],
        })
        assert.equal(typeof human.messageId,'string')
        await until(s=>s.includes('before-resume:blocked:disarmed')&&
          s.includes('resumed:active:true'),
          'read real blocked/disarmed Goal projection and perform official CAS resume')
        await until(s=>s.filter(x=>x==='model-call').length>=3,
          'resumed Goal should execute remaining rounds')
        assert.equal(snapshot().filter(s=>s.startsWith('official-goal:block:')).length,1,
          'no duplicate union stop after the explicit Host resume')
      }else{
        await until(s=>s.filter(x=>x==='model-call').length>=2,
          '7h or real Host consent off must not stop next autonomous Goal')
        assert.equal(snapshot().filter(s=>s.startsWith('official-goal:block:')).length,0)
      }
      assert.equal(snapshot().includes('effective-consent:'+
        (consent?'authorized-v1':'off')),true,
      'Host-owned persisted settings must reflect the synthetic consent setup')
      await rpc('shutdown',{})
      process.stdout.write(JSON.stringify({
        scope:'installed-agent-picket-in-official-sdk-profile',
        os:process.platform,hours,consent,
        blocked:snapshot().some(s=>s.startsWith('official-goal:block:')),
      })+'\n')
    }finally{
      if(child&&child.exitCode===null)child.kill('SIGTERM')
      await sleep(200)
      if(child&&child.exitCode===null)child.kill('SIGKILL')
    }
  }
  process.stdout.write('DSH_PACKAGED_PICKET_OFFICIAL_GOAL_PASS\n')
}finally{
  rmSync(parent,{recursive:true,force:true})
}
