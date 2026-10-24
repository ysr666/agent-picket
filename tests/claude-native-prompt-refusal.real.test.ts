import test from 'node:test'
import assert from 'node:assert/strict'
import{spawn}from'node:child_process'
import{createServer}from'node:http'
import{once}from'node:events'
import{existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync,chmodSync}from'node:fs'
import{tmpdir}from'node:os'
import{join,resolve}from'node:path'

const binary=process.env.AGENT_PICKET_CLAUDE_BIN
/**
 * Genuine Claude Code UserPromptSubmit hook; no cloud inference, paid model,
 * user profile, real prompt or imported credentials. Denied mode must block
 * before the LOCAL mock inference server is ever contacted. Allow mode
 * proves resumption is a fresh manual submission after campaign off.
 */
test('official Claude Code 2.1.295 visible UserPromptSubmit blocks new work, then allows after resume',{
 skip:!binary&&'Set AGENT_PICKET_CLAUDE_BIN to installed official Claude CLI',
 timeout:105_000,
},async()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-claude-official-new-input-'))
 const calls:string[]=[]
 const server=createServer((req,res)=>{
  calls.push(req.method+' '+req.url)
  req.resume()
  res.writeHead(503,{'content-type':'application/json'})
  res.end(JSON.stringify({error:{type:'api_error',message:'offline synthetic sink'}}))
 })
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const addr=server.address()
  assert.ok(addr&&typeof addr==='object')
  const hookExe=resolve(import.meta.dirname,'../scripts/claude-union-user-prompt-hook.mjs')
  const quote=(s:string)=>"'"+s.replace(/'/g,"'\\''")+"'"
  for(const mode of ['deny','allow'] as const){
   const home=join(root,mode)
   mkdirSync(home)
   const state=join(home,'union-state.json')
   const emitted=join(home,'hook-decision.txt')
   const touched=join(home,'hook-invoked.txt')
   const wrapper=join(home,'official-claude-hook.sh')
   const settings=join(home,'official-settings.json')
   const now=Date.now()
   writeFileSync(state,JSON.stringify({
    version:1,host:'claude-code',scope:'new-work-only',
    realStrikeConsent:true,enabled:mode==='deny',
    campaign:{active:true,startedAtMs:now-1000,
     expiresAtMs:now+120_000,cause:'overwork'},
   }),{mode:0o600})
   writeFileSync(wrapper,[
    '#!/bin/sh',
    'printf "called\\n" > "$PICKET_HOOK_MARKER"',
    quote(process.execPath)+' '+quote(hookExe)
      +' | tee '+quote(emitted),
    '',
   ].join('\n'))
   chmodSync(wrapper,0o700)
   writeFileSync(settings,JSON.stringify({hooks:{UserPromptSubmit:[{
    hooks:[{type:'command',command:wrapper,timeout:10}],
   }]}}))
   const before=calls.length
   const child=spawn(binary!,['--print','--settings',settings,
    '--no-session-persistence','--output-format','json',
    'SYNTHETIC_USER_PROMPT_NOT_SECRET_NO_REAL_WORK'],{
    cwd:home,
    env:{...process.env,
     CLAUDE_CONFIG_DIR:join(home,'isolated-config'),
     ANTHROPIC_API_KEY:'synthetic-local-offline-key',
     ANTHROPIC_BASE_URL:'http://127.0.0.1:'+addr.port,
     HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',
     NO_PROXY:'127.0.0.1,localhost',
     CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',
     AGENT_PICKET_CLAUDE_UNION_PROMPT_STATE_FILE:state,
     PICKET_HOOK_MARKER:touched},
    stdio:['ignore','pipe','pipe'],
   })
   let nativeOutput=''
   const collect=(chunk:Buffer|string)=>{
    nativeOutput=(nativeOutput+String(chunk)).slice(-15_000)
   }
   child.stdout.on('data',collect)
   child.stderr.on('data',collect)
   try{
    const deadline=Date.now()+20_000
    while(Date.now()<deadline&&!existsSync(touched)
      &&child.exitCode===null)
      await new Promise(r=>setTimeout(r,60))
    assert.equal(existsSync(touched),true,'Native Claude did not invoke UserPromptSubmit')
    const decisionDeadline=Date.now()+5_000
    while(Date.now()<decisionDeadline&&(!existsSync(emitted)
      ||readFileSync(emitted,'utf8').trim()===''))
      await new Promise(r=>setTimeout(r,30))
    const reported=existsSync(emitted)?readFileSync(emitted,'utf8').trim():''
    if(mode==='deny'){
     const obj=JSON.parse(reported)
     assert.equal(obj.decision,'block')
     assert.match(obj.reason,/NOT executed.*manually resend the text/)
     await new Promise(r=>setTimeout(r,1_200))
     const visible= nativeOutput.includes('NOT executed')
       &&nativeOutput.includes('manually resend')
     assert.equal(visible,true,
      'Official CLI output must show non-execution and manual resend reason to user')
     assert.equal(calls.length,before,'Official Hook denial prevents inference HTTP request')
    }else{
     assert.equal(reported,'','Resume means Hook has no new prompt block')
     const until=Date.now()+7_000
     while(Date.now()<until&&calls.length===before)
      await new Promise(r=>setTimeout(r,60))
     assert.ok(calls.length>before,
       'After Host policy switches OFF, genuinely new user input reaches local no-inference sink')
    }
   }finally{
    child.kill('SIGTERM')
    await Promise.race([
     new Promise<void>(resolve=>child.once('exit',()=>resolve())),
     new Promise<void>(resolve=>setTimeout(resolve,1200)),
    ])
    if(child.exitCode===null)child.kill('SIGKILL')
   }
  }
 }finally{
  await new Promise<void>(resolve=>server.close(()=>resolve()))
  rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:80})
 }
})
