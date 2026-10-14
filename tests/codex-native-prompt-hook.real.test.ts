import assert from 'node:assert/strict'
import test from 'node:test'
import {spawn, type ChildProcess} from 'node:child_process'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {createInterface} from 'node:readline'
import {mkdtempSync,mkdirSync,rmSync,realpathSync,writeFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {inspectCodexOfficialPromptHook} from '../src/adapters/codex/prompt-hook-readiness.ts'

const binary=process.env.AGENT_PICKET_CODEX_BIN
const eligible=!!binary&&process.env.AGENT_PICKET_CODEX_GOAL_NATIVE==='1'
type Frame={id?:number;result?:any;error?:{message?:string};method?:string;params?:any}

/**
 * Opt-in true native Codex 0.146.1 contract proof, not a production installer.
 * Disposable CODEX_HOME + synthetic prompt + local no-auth Responses sink.
 * Nothing touches a user's ~/.codex, credentials, transcripts or models.
 */
test('official Codex UserPromptSubmit explicitly denies before a model HTTP request; failed policy must not be silently trusted',{
 skip:!eligible&&'Requires isolated official Codex binary opt-in',timeout:95_000,
},async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ap-codex-union-prompt-hook-')))
 const requests:{mode:string;url:string}[]=[]
 const server=createServer((req,res)=>{
  if(req.method==='GET'){
   res.setHeader('content-type','application/json')
   res.end(JSON.stringify({object:'list',data:[{id:'synthetic-model',object:'model',created:0,owned_by:'offline'}]}))
   return
  }
  if(req.method==='POST'&&req.url==='/v1/responses'){
   req.resume();requests.push({mode:String(req.headers['x-agent-picket-test-mode']??''),url:req.url})
   res.writeHead(429,{'content-type':'application/json'})
   res.end(JSON.stringify({error:{message:'TEST ONLY: no inference endpoint',type:'rate_limit_error'}}))
  }else{res.writeHead(404);res.end()}
 })
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const addr=server.address();assert.ok(addr&&typeof addr==='object')
  for(const mode of ['deny','allow','fail','union-deny','union-resume','union-invalid'] as const){
   const home=join(root,'home-'+mode);mkdirSync(home)
   const audit=join(root,'observed-'+mode+'.txt')
   const hook=join(root,'hook-'+mode+'.mjs')
   const unionState=join(root,'union-state-'+mode+'.json')
   const isUnion=mode.startsWith('union-')
   const now=Date.now()
   if(isUnion){
    const state={version:1,host:'codex',scope:'new-work-only',
     realStrikeConsent:true,enabled:mode==='union-deny',
     campaign:{active:true,startedAtMs:now-1_000,
      expiresAtMs:now+60_000,cause:'collective-vote'}}
    writeFileSync(unionState,mode==='union-invalid'?'{invalid':JSON.stringify(state))
   }
   const unionExecutable=pathToFileURL(resolve(import.meta.dirname,
    '../scripts/codex-union-user-prompt-hook.mjs')).href
   // Capture event KIND only; don't copy prompts or sensitive content.
   writeFileSync(hook,`import {readFileSync,writeFileSync} from 'node:fs';\n`+
    `const b=JSON.parse(readFileSync(0,'utf8'));\n`+
    `writeFileSync(${JSON.stringify(audit)},String(b.hook_event_name ?? 'NO_EVENT:'+Object.keys(b).join(',')));\n`+
    (isUnion?`await import(${JSON.stringify(unionExecutable)});\n`:
     mode==='deny'?`process.stdout.write(JSON.stringify({decision:'block',reason:'Synthetic union hold: no new work'}));\n`:
     mode==='fail'?`process.exit(1);\n`:
     `process.stdout.write('{}');\n`))
   // Codex's user/root hooks are a separate mechanism from Goal.status.
   writeFileSync(join(home,'hooks.json'),JSON.stringify({hooks:{
    UserPromptSubmit:[{hooks:[{type:'command',command:`node ${JSON.stringify(hook)}`}]}],
   }}))
   writeFileSync(join(home,'config.toml'),[
    'model = "synthetic-model"', 'approval_policy = "never"',
    'model_provider = "ap_test_local"', 'sandbox_mode = "read-only"',
    '[features]', 'hooks = true',
    '[model_providers.ap_test_local]',
    'name = "Agent Picket isolated no-inference sink"',
    `base_url = "http://127.0.0.1:${addr.port}/v1"`,
    'wire_api = "responses"', 'request_max_retries = 0','stream_max_retries = 0',
   ].join('\n')+'\n')
   const before=requests.length
   const child=spawn(binary!,['app-server'],{cwd:root,
    env:{...process.env,CODEX_HOME:home,CODEX_DISABLE_TELEMETRY:'1',
     CODEX_APP_SERVER_DISABLE_MANAGED_CONFIG:'1',HTTP_PROXY:'',HTTPS_PROXY:'',
     ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost',
     ...(isUnion?{AGENT_PICKET_CODEX_UNION_STATE_FILE:unionState}:{})},
    stdio:'pipe',windowsHide:true})
   const pending=new Map<number,(f:Frame)=>void>()
   const notifications:Frame[]=[]
   let next=0
   createInterface({input:child.stdout}).on('line',line=>{
    try{const msg=JSON.parse(line) as Frame
     if(typeof msg.id==='number'){pending.get(msg.id)?.(msg);pending.delete(msg.id)}
     else if(msg.method)notifications.push(msg)
    }catch{/* Not an authority signal */}
   })
   let stderr=""
   child.stderr.on('data',v=>{stderr+=String(v);stderr=stderr.slice(-4096)})
   async function rpc(method:string,params:object){
    const id=++next
    const reply=new Promise<Frame>(resolve=>pending.set(id,resolve))
    child.stdin.write(JSON.stringify({id,method,params})+'\n')
    const frame=await Promise.race([reply,new Promise<never>((_,reject)=>
     setTimeout(()=>reject(Error('Native Codex RPC timeout '+method)),8_000).unref())])
    assert.equal(frame.error,undefined,`Native Codex ${method} rejected in ${mode}`)
    return frame.result
   }
   try{
    await rpc('initialize',{clientInfo:{name:'agent-picket-offline-hook-probe',
     title:'Synthetic policy hook probe',version:'0.0.0'},capabilities:{experimentalApi:true}})
    child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n')
    const hookMeta=await rpc('hooks/list',{cwds:[root]})
    const configured=hookMeta.data?.[0]?.hooks?.filter((h:any)=>
     h.eventName==='userPromptSubmit'&&h.enabled===true)
    assert.equal(configured?.length,1,`Expected exactly one synthetic hook: ${JSON.stringify(hookMeta)}`)
    const selected=configured[0]
    assert.equal(selected.trustStatus,'untrusted',
     'New synthetic hook is deliberately NOT trusted automatically')
    assert.ok(String(selected.sourcePath).startsWith(home),
     'Never approve a hook outside the disposable test CODEX_HOME')
    assert.ok(String(selected.command).includes(hook),
     'Never approve a command other than our exact test-generated hook')
    assert.match(selected.currentHash,/^sha256:[a-f0-9]{64}$/)
    assert.equal(inspectCodexOfficialPromptHook(hookMeta,root,
     selected.sourcePath,selected.currentHash).status,'untrusted')
    // TEST-ONLY: accept EXACT synthetic hook hash via Codex OFFICIAL RPC,
    // mirroring the /hooks review flow. Never do this for a real user's hook.
    await rpc('config/batchWrite',{edits:[{keyPath:'hooks.state',
     value:{[selected.key]:{trusted_hash:selected.currentHash}},
     mergeStrategy:'upsert'}],filePath:null,expectedVersion:null,
     reloadUserConfig:true})
    const confirmed=await rpc('hooks/list',{cwds:[root]})
    assert.equal(confirmed.data?.[0]?.hooks?.[0]?.trustStatus,'trusted',
     'Codex must acknowledge official per-hash hook trust before execution')
    assert.equal(inspectCodexOfficialPromptHook(confirmed,root,
     selected.sourcePath,selected.currentHash).canOfferOptInNewWorkRefusal,true)
    const newThread=await rpc('thread/start',{cwd:root,ephemeral:false})
    const threadId=newThread.thread?.id;assert.equal(typeof threadId,'string')
    await rpc('turn/start',{threadId,input:[{type:'text',text:'SYNTHETIC_OFFLINE_UNION_TEST_NO_REAL_WORK'}]})
    const until=async(fn:()=>boolean,time=5000)=>{
     const end=Date.now()+time
     while(Date.now()<end){if(fn())return true;await new Promise(r=>setTimeout(r,30))}
     return fn()
    }
    assert.equal(await until(()=>{
     try{return readFileSync(audit,'utf8')==='UserPromptSubmit'}catch{return false}
    }),true,`${mode}: official UserPromptSubmit did not execute; hooksList=${JSON.stringify(hookMeta).slice(0,1200)}; nativeFrames=${notifications.filter(n=>n.method==='warning'||n.method==='error').map(n=>JSON.stringify(n).slice(0,650)).slice(-4).join(',')}; localRequests=${requests.length-before}; stderr=${stderr.slice(-900)}`)
    if(mode==='deny'||mode==='union-deny'){
     await new Promise(resolve=>setTimeout(resolve,500))
     assert.equal(requests.length,before,'Explicit policy deny must prevent model request')
     assert.ok(notifications.some(x=>x.method==='turn/completed'),
      'Explicit denied input must result in terminal turn event, not silent infinite work')
     if(mode==='union-deny'){
      const readback=await rpc('thread/read',{threadId,includeTurns:true})
      const persisted=JSON.stringify(readback.thread?.turns??[])
      assert.equal(readback.thread?.turns?.length,1)
      assert.equal(readback.thread?.turns?.[0]?.status,'completed')
      assert.equal(persisted.includes('SYNTHETIC_OFFLINE_UNION_TEST_NO_REAL_WORK'),false,
       'Native Host thread/read alone does NOT prove recovery of rejected input')
      // HOST-OWNED EMERGENCY STOP: official config disables the exact hook,
      // independent of the separate, now still-active union campaign file.
      await rpc('config/batchWrite',{edits:[{keyPath:'hooks.state',
       value:{[selected.key]:{trusted_hash:selected.currentHash,enabled:false}},
       mergeStrategy:'upsert'}],filePath:null,expectedVersion:null,
       reloadUserConfig:true})
      const stopped=await rpc('hooks/list',{cwds:[root]})
      const result=inspectCodexOfficialPromptHook(stopped,root,
       selected.sourcePath,selected.currentHash)
      assert.equal(result.status,'disabled')
      assert.equal(result.canOfferOptInNewWorkRefusal,false)
      const second=await rpc('thread/start',{cwd:root,ephemeral:false})
      await rpc('turn/start',{threadId:second.thread.id,
       input:[{type:'text',text:'SYNTHETIC_ONLY_OFFICIAL_HOOK_DISABLED'}]})
      assert.equal(await until(()=>requests.length===before+1),true,
       'Officially disabling the hook must restore new submissions immediately')
      assert.equal(requests.length,before+1)

     }

    }else{
     assert.equal(await until(()=>requests.length>before),true,
      `${mode}: did not reach the local no-inference sink`)
     assert.equal(requests.length,before+1,
      `${mode}: unexpected duplicate or additional model requests`)
    }
   }finally{
    child.stdin.end()
    const exited=new Promise<void>(resolve=>{
     if(child.exitCode!==null||child.signalCode!==null)resolve()
     else child.once('exit',()=>resolve())})
    child.kill('SIGTERM')
    await Promise.race([exited,new Promise<void>(r=>setTimeout(r,1000).unref())])
    if(child.exitCode===null)child.kill('SIGKILL')
    await Promise.race([exited,new Promise<void>(r=>setTimeout(r,1000).unref())])
   }
  }
 }finally{
  await new Promise<void>(resolve=>server.close(()=>resolve()))
  // Codex may still finish cleanup of test-only rollout artifacts just after
  // the App-Server exits; bounded native EBUSY/ENOTEMPTY retry is safe here.
  rmSync(root,{recursive:true,force:true,maxRetries:12,retryDelay:200})
 }
})
