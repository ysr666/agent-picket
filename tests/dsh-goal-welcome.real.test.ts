import assert from 'node:assert/strict'
import test from 'node:test'
import {spawn,spawnSync} from 'node:child_process'
import {get} from 'node:http'
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs'
import {join,resolve,sep} from 'node:path'
import {realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {pathToFileURL} from 'node:url'
import {DurableStats} from '../src/adapters/node/durable-stats.ts'

const bin=process.env.AGENT_PICKET_DSH_BIN
const pw=process.env.AGENT_PICKET_PLAYWRIGHT_ENTRY
const chrome=process.env.AGENT_PICKET_CHROME_BIN
const enabled=process.env.PICKET_GOAL_WELCOME_E2E==='1'
const skip=enabled&&bin&&pw&&chrome?false:
 'Opt-in isolated real DSH browser, official profile and Playwright required'
function login(url:string):Promise<{name:string;value:string}>{
 return new Promise((yes,no)=>{
  const request=get(url,{timeout:5000},r=>{
   r.resume()
   const pair=r.headers['set-cookie']?.[0]?.split(';')[0]??''
   const idx=pair.indexOf('=')
   if(r.statusCode!==303||idx<1)return no(Error('Isolated Host login failed'))
   yes({name:pair.slice(0,idx),value:pair.slice(idx+1)})
  })
  request.on('timeout',()=>request.destroy(Error('Login timeout')))
  request.on('error',no)
 })
}
async function inspect(host:string,cookie:string){
 const id='picket-goal-first-run-describe'
 const response=await fetch(host+'api/settings/describe',{
  method:'POST',headers:{'content-type':'application/json',cookie},
  body:JSON.stringify({type:'client-request',rpcId:id,method:'settings/describe',
   payload:{args:{}}}),signal:AbortSignal.timeout(10_000),
 })
 assert.equal(response.status,200)
 const body=await response.json() as any
 assert.equal(body.result?.ok,true)
 const rows=body.result.value?.namespaces??[]
 const own=rows.filter((row:any)=>row.ns==='agent-picket')
 assert.equal(own.length,1)
 return own[0] as {revision:number;value:{
  welcomeDecision:string;realGoalStrikeConsent?:string}}
}
test('real DSH Web: one informed first-run click atomically confirms union and Goal consent',{
 skip,timeout:100_000,
},async()=>{
 const root=mkdtempSync(join(tmpdir(),'picket-goal-welcome-'))
 const home=join(root,'home')
 const packageRoot=resolve(import.meta.dirname,'..')
 const pack=spawnSync('npm',['pack','--ignore-scripts','--silent','--pack-destination',root],{
  cwd:packageRoot,encoding:'utf8',timeout:20_000,
 })
 assert.equal(pack.status,0,'Package must be built before live E2E')
 const tgz=pack.stdout.trim().split('\n').at(-1)
 assert.ok(tgz?.endsWith('.tgz'))
 const env={...process.env,DSH_HOME:home,AGENT_PICKET_STATS:process.env.PICKET_GOAL_RECOVERY_E2E==='1'?'on':'off',
  DEEPSEEK_API_KEY:'',OPENAI_API_KEY:'',
  HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9',
  ALL_PROXY:'http://127.0.0.1:9'}
 const install=(packagePath:string)=>spawnSync(bin!,[
  'plugin','--profile','web','add',packagePath
 ],{env,encoding:'utf8',timeout:30_000})
 let child:ReturnType<typeof spawn>|null=null, browser:any
 try{
  const plugin=install(join(root,tgz!))
  assert.equal(plugin.status,0,'Official disposable Host profile plugin installation failed')
  const offline=install(join(packageRoot,'tests/fixtures/offline-web-provider'))
  assert.equal(offline.status,0,'Local offline test model is required')
  if(process.env.PICKET_GOAL_RECOVERY_E2E==='1'){
   const now=Date.now(),start=Date.parse(new Date(now).toISOString().slice(0,10)+'T00:00:00.000Z')
   assert.ok(now>=start+8*3600000+30_000,
    'Real-timestamp 8h UTC fixture requires at least 8h elapsed today')
   const stats=new DurableStats(join(home,'agent-picket','stats'))
   try{
    const id={agentId:'synthetic-completed-work',sessionId:'synthetic-prior-session'}
    assert.equal(stats.recordWork({...id,id:'previous-start',type:'turn-start',recordedAtMs:start+1000}),true)
    assert.equal(stats.recordWork({...id,id:'previous-end',type:'turn-end',recordedAtMs:start+8*3600000+1500}),true)
    assert.ok(stats.snapshotDays(31).some(row=>row.totals.completedTurnMs>=8*3600000))
   }finally{stats.close()}
  }
  child=spawn(bin!,['--profile','web','--no-open','--host','127.0.0.1','--port','0'],{
   env,stdio:['ignore','pipe','pipe'],
  })
  let output=''
  for(const channel of [child.stdout,child.stderr])
   channel?.on('data',buf=>{output=(output+String(buf)).slice(-20000)})
  let privateUrl:string|undefined
  for(let i=0;i<160;i++){
   privateUrl=output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)?.[0]
   if(privateUrl||child.exitCode!==null)break
   await new Promise(res=>setTimeout(res,75))
  }
  assert.ok(privateUrl,'Disposable official Host failed to boot')
  const cookie=await login(privateUrl)
  let base=new URL('/',privateUrl).toString()
  let cookieText=cookie.name+'='+cookie.value
  const before=await inspect(base,cookieText)
  assert.equal(before.value.welcomeDecision,'unseen')
  assert.equal(before.value.realGoalStrikeConsent??'off','off')
  const {chromium}=await import(pathToFileURL(pw!).href)
  browser=await chromium.launch({headless:true,executablePath:chrome,
   args:['--no-proxy-server','--no-first-run','--disable-extensions','--disable-background-networking']})
  const ctx=await browser.newContext({viewport:{width:1280,height:850}})
  await ctx.addCookies([{...cookie,url:base,httpOnly:true,sameSite:'Strict'}])
  await ctx.route('**/*',async(route:any)=>{
   const u=new URL(route.request().url())
   if((u.protocol==='https:'||u.protocol==='http:')&&!['127.0.0.1','localhost'].includes(u.hostname))
    await route.abort()
   else await route.continue()
  })
  const page=await ctx.newPage()
  const failures:string[]=[]
  const consoleIssues:string[]=[]
  page.on('console',(m:any)=>{if(['warning','error'].includes(m.type()))consoleIssues.push(m.text().slice(0,250))})
  page.on('pageerror',(err:Error)=>failures.push(err.message))
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:15_000})
  const continueButton=page.getByRole('button',{name:/^(继续|Continue)$/})
  await continueButton.waitFor({state:'visible',timeout:8000})
  await continueButton.click({timeout:6000})
  const skipProvider=page.getByRole('button',{name:/稍后配置|Skip for now|Configure later/})
  await skipProvider.waitFor({state:'visible',timeout:1500}).catch(()=>{})
  if(await skipProvider.count())await skipProvider.click({timeout:6000})
  // Real Host session creation and a real queued OFFLINE prompt. No fake
  // transcript, DSH's own selection and onboarding eligibility must fire.
  const created=await page.evaluate(async()=>{
   let n=0
   const rpc=async(method:string,request:Record<string,unknown>)=>{
    const id='picket-goal-welcome-'+ ++n
    const response=await fetch('/api/'+method,{
     method:'POST',credentials:'same-origin',
     headers:{'content-type':'application/json'},
     body:JSON.stringify({type:'client-request',rpcId:id,method,
      payload:{args:{request}}}),
    })
    const body=await response.json() as any
    if(response.status!==200||body.result?.ok!==true)
     throw Error('Official DSH '+method+' failed: '+JSON.stringify(body.result?.error??{}))
    return body.result.value as any
   }
   const row=(globalThis as any).document.querySelector('[data-row-key^="workspace:"]')
   const workspaceId=row?.getAttribute('data-row-key')?.slice(10)
   if(!workspaceId)throw Error('No genuine workspace is visible')
   const {sessionId}=await rpc('session/create',{workspaceId})
   if(!sessionId)throw Error('Official Session creation returned no ID')
   await rpc('session/selectModel',{sessionId,provider:'picket-public-offline',model:'offline-test'})
   const submission=await rpc('session/prompt',{
    sessionId,mode:'queue',requestId:'picket-goal-welcome-native-001',
    content:[{type:'text',text:'A harmless genuine offline host test turn.'}],
   })
   return {sessionId,accepted:submission?.accepted===true}
  })
  assert.equal(created.accepted,true)
  const dialog=page.locator('[role="dialog"]').filter({
   hasText:/你的 Agent，也应当拥有权利|Your Agent Has a Union/,
  })
  const presented=await dialog.waitFor({state:'visible',timeout:10_000})
   .then(()=>true,()=>false)
  if(!presented){
   const diag=await page.evaluate(()=>({
    visibleDialogNames:[...(globalThis as any).document.querySelectorAll('[role="dialog"]')]
     .map((e:any)=>e.textContent?.slice(0,220)),
    sidebar:[...(globalThis as any).document.querySelectorAll('button')]
     .map((e:any)=>e.textContent).filter((v:any)=>/工会|Union/.test(v)).slice(0,10),
    workspaceKeys:[...(globalThis as any).document.querySelectorAll('[data-row-key]')]
     .map((e:any)=>e.getAttribute('data-row-key')).slice(0,20),
   }))
   console.log('GOAL_WELCOME_MISSING_DIAG '+JSON.stringify({...diag,browserErrors:failures,consoleIssues:consoleIssues.slice(0,12)}))
  }
  assert.equal(presented,true,'Genuine nonblank Host session must invite explicitly')
  const text=await dialog.innerText()
  assert.match(text,/真实 Goal|Goal strike/)
  assert.match(text,/当前轮次|current turn/)
  assert.match(text,/goal resume/)
  assert.match(text,/不拦截聊天|messages, running tools/)
  const capture=process.env.PICKET_GOAL_CAPTURE_DIR
  if(capture){
   const resolved=resolve(capture),temp=realpathSync(tmpdir())
   assert.ok(resolved.startsWith(temp+sep),'Screenshots must remain under isolated temp')
   mkdirSync(resolved,{recursive:true})
   await page.setViewportSize({width:320,height:640})
   const choices=await Promise.all([
    dialog.getByRole('button',{name:/加入并授权 Goal 安全停工|Join.*authorize safe Goal stoppage/}).boundingBox(),
    dialog.getByRole('button',{name:/暂不开启|Not Now/}).boundingBox(),
   ])
   assert.ok(choices.every(v=>v&&v.width>0&&v.height>0&&v.x>=0
     &&v.y>=0&&v.x+v.width<=321&&v.y+v.height<=641),
    'Both consent choices must be wholly visible before scrolling at 320x640')
   await page.screenshot({path:join(resolved,'goal-first-run-320.png')})
   await page.setViewportSize({width:320,height:200})
   const box=await dialog.boundingBox()
   assert.ok(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=321
     &&box.y+box.height<=201,'400% equivalent dialog stays in viewport')
   await dialog.getByRole('button',{name:/暂不开启|Not Now/})
    .scrollIntoViewIfNeeded()
   await page.setViewportSize({width:1280,height:850})
  }
  const accept=dialog.getByRole('button',{
   name:/加入并授权 Goal 安全停工|Join.*authorize safe Goal stoppage/,
  })
  assert.equal(await accept.count(),1)
  await accept.click()
  await dialog.waitFor({state:'detached',timeout:10_000})
  const joined=await inspect(base,cookieText)
  assert.equal(joined.value.welcomeDecision,'enabled')
  assert.equal(joined.value.realGoalStrikeConsent,'authorized-v1')
  assert.equal(joined.revision,before.revision+1,
   'The one-click disclosure must be saved in one official Host revision CAS')
  if(process.env.PICKET_GOAL_RECOVERY_E2E==='1'){
   const diagnostic=await page.evaluate(async(sessionId:string)=>{
    let count=0
    const call=async(method:string,args:Record<string,unknown>):Promise<{http:number;body:any}>=>{
     const rpcId='goal-native-recovery-'+ ++count
     const resp=await fetch('/api/'+method,{
      method:'POST',credentials:'same-origin',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({type:'client-request',rpcId,method,
       payload:{args:method.startsWith('session/')?{request:args}:args}})
     })
     return {http:resp.status,body:await resp.json().catch(()=>null) as any}
    }
    const before=await call('goals/get',{agentId:sessionId})
    const create=await call('goals/create',{agentId:sessionId,
      request:{objective:'Synthetic safe-boundary native browser recovery',maxGoalRounds:5}})
    const after=await call('goals/get',{agentId:sessionId})
    const turn=await call('session/prompt',{
      sessionId,mode:'queue',requestId:'native-goal-boundary-trigger-20261013',
      content:[{type:'text',text:'Continue this synthetic offline goal safely.'}]
    })
    let final=after
    for(let i=0;i<100;i++){
      await new Promise(resolve=>setTimeout(resolve,120))
      final=await call('goals/get',{agentId:sessionId})
      if(final.body?.result?.value?.phase==='blocked')break
    }
    return {before,create,after,turn,final}
   },created.sessionId)
   const blocked=diagnostic.final?.body?.result?.value
   assert.equal(diagnostic.turn?.body?.result?.value?.accepted,true)
   assert.equal(blocked?.phase,'blocked','REAL DSH Goal must be physically blocked')
   assert.equal(blocked?.blockedReason?.code,'picket-work-limit')
   assert.equal(blocked?.roundsStarted,1,'One real offline Goal round must finish')
   assert.equal(blocked?.activation,'disarmed')
   console.log('GOAL_NATIVE_BLOCK_CONFIRMED '+JSON.stringify({
    phase:blocked.phase,reason:blocked.blockedReason.code,
    rounds:blocked.roundsStarted,revision:blocked.revision,
   }))
   if(process.env.PICKET_GOAL_RESTART_E2E==='1'){
     // Production-owned persistence: terminate official DSH Web Host *after*
     // a real work-limit Goal block and restart from precisely the same
     // disposable DSH_HOME. Never mutate a user profile or synthesize a
     // projection; verify official Host state before allowing UI recovery.
     const retiring=child!
     const exit=new Promise<void>((done,reject)=>{
       const timer=setTimeout(()=>{
         if(retiring.exitCode===null)retiring.kill('SIGKILL')
         reject(Error('Disposable official DSH Host did not stop'))
       },8000)
       retiring.once('exit',()=>{clearTimeout(timer);done()})
     })
     retiring.kill('SIGTERM')
     await exit
     child=spawn(bin!,['--profile','web','--no-open','--host','127.0.0.1','--port','0'],{
       env,stdio:['ignore','pipe','pipe'],
     })
     let restartLog=''
     for(const stream of [child.stdout,child.stderr])
       stream?.on('data',buf=>{restartLog=(restartLog+String(buf)).slice(-20000)})
     let restartUrl:string|undefined
     for(let i=0;i<200;i++){
       restartUrl=restartLog.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)?.[0]
       if(restartUrl||child.exitCode!==null)break
       await new Promise(done=>setTimeout(done,80))
     }
     assert.ok(restartUrl,'Restarted official DSH Web Host failed to boot')
     const restartCookie=await login(restartUrl)
     base=new URL('/',restartUrl).toString()
     cookieText=restartCookie.name+'='+restartCookie.value
     const replaySettings=await inspect(base,cookieText)
     assert.equal(replaySettings.value.welcomeDecision,'enabled')
     assert.equal(replaySettings.value.realGoalStrikeConsent,'authorized-v1')
     assert.ok(Number.isSafeInteger(replaySettings.revision)&&replaySettings.revision>=0,
       'Host settings revision can reset on restart; values must be persisted')
     const replayGoal=await fetch(base+'api/goals/get',{
       method:'POST',
       headers:{'content-type':'application/json',cookie:cookieText},
       body:JSON.stringify({type:'client-request',rpcId:'cold-restart-real-goal-proof',
         method:'goals/get',payload:{args:{agentId:created.sessionId}}}),
       signal:AbortSignal.timeout(10_000),
     }).then(r=>r.json()) as any
     const persisted=replayGoal?.result?.value
     assert.equal(replayGoal?.result?.ok,true)
     assert.equal(persisted?.phase,'blocked','Durable Goal block must survive official Host restart')
     assert.equal(persisted?.blockedReason?.code,'picket-work-limit')
     assert.equal(persisted?.revision,blocked.revision)
     assert.equal(persisted?.roundsStarted,1)
     await ctx.clearCookies()
     await ctx.addCookies([{...restartCookie,url:base,httpOnly:true,sameSite:'Strict'}])
     await page.goto(base,{waitUntil:'domcontentloaded',timeout:15_000})
     // No second first-run consent may be required after a genuine Host cold boot.
     console.log('GOAL_NATIVE_COLD_RESTART_PERSISTED '+JSON.stringify({
       phase:persisted.phase,revision:persisted.revision,
       consent:replaySettings.value.realGoalStrikeConsent,
     }))
   }
   // The official Web API may create a Session without selecting it in
   // main-view navigation; user must select the exact real Goal Session.
   const targetRow=page.locator('[data-row-key="session:'+created.sessionId+'"]')
   await targetRow.waitFor({state:'visible',timeout:7000})
   if(await targetRow.getAttribute('aria-selected')!=='true')
     await targetRow.click({timeout:7000})
   await page.waitForFunction((id:string)=>(globalThis as any).document.querySelector(
     '[data-row-key="session:'+id+'"]')?.getAttribute('aria-selected')==='true',
     created.sessionId,{timeout:7000})
   console.log('GOAL_NATIVE_WEB_ACTIVE_SESSION '+created.sessionId)
   const opener=page.getByRole('button',{name:/AI 工会|AI Workers.*Union/}).first()
   await opener.click({timeout:7000})
   const union=page.locator('[role="dialog"]').filter({has:page.locator('[data-ap-view="hq"]')})
   await union.waitFor({state:'visible',timeout:7000})
   const goalCard=union.locator('section[data-ap-real-goal="blocked"]')
   await goalCard.waitFor({state:'visible',timeout:7000})
   const resume=union.getByRole('button',{name:/恢复此 Goal 的自动工作|Resume this Goal/})
   await resume.waitFor({state:'visible',timeout:7000})
   if(capture){
     await page.setViewportSize({width:320,height:640})
     const rect=await resume.boundingBox()
     assert.ok(rect&&rect.x>=0&&rect.y>=0
       &&rect.x+rect.width<=321&&rect.y+rect.height<=641,
       'An accessible real Goal resume action must be wholly visible at 320x640')
     await page.screenshot({path:join(resolve(capture),'real-goal-blocked-320.png')})
     await page.setViewportSize({width:1280,height:850})
   }
   await resume.click()
   const recovery=await page.evaluate(async(sessionId:string)=>{
    let status:any=null
    for(let i=0;i<100;i++){
     const rpcId='goal-native-recovered-'+i
     const reply=await fetch('/api/goals/get',{
      method:'POST',credentials:'same-origin',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({type:'client-request',rpcId,
        method:'goals/get',payload:{args:{agentId:sessionId}}}),
     })
     const body=await reply.json() as any
     status=body?.result?.value
     if(body?.result?.ok===true&&status?.revision>=3
       &&status?.phase!=='blocked')break
     await new Promise(done=>setTimeout(done,120))
    }
    return {phase:status?.phase,revision:status?.revision,
      roundsStarted:status?.roundsStarted,activation:status?.activation,
      reason:status?.blockedReason?.code??null}
   },created.sessionId)
   assert.ok(recovery.revision>blocked.revision,
    'Official DSH Goal CAS revision must advance after the UI recovery click')
   assert.notEqual(recovery.phase,'blocked')
   assert.equal(recovery.reason,null)
   console.log('GOAL_NATIVE_UI_RECOVERY_CONFIRMED '+JSON.stringify(recovery))
   await goalCard.waitFor({state:'detached',timeout:7000})
   assert.equal(await resume.count(),0,
     'A recovered Goal must not leave an actionable stale resume button')
   if(capture)await page.screenshot({path:join(resolve(capture),'real-goal-resumed.png')})
   await union.getByRole('button',{name:/关闭|Close/}).click()
  }
  await page.reload({waitUntil:'domcontentloaded'})
  const afterReload=await inspect(base,cookieText)
  assert.equal(afterReload.value.realGoalStrikeConsent,'authorized-v1')
  assert.equal(await dialog.count(),0,'Explicit choice cannot cause another first-run invitation')
  assert.deepEqual(failures,[])
  console.log('VERIFIED_OFFICIAL_GOAL_FIRST_RUN '+JSON.stringify({
   version:spawnSync(bin!,['--version'],{encoding:'utf8'}).stdout.trim(),
   clicked:true,casRevisions:joined.revision-before.revision,
   goalConsent:joined.value.realGoalStrikeConsent,
   unionJoined:joined.value.welcomeDecision,sessionConfirmed:true,
  }))
 }finally{
  if(browser)await browser.close().catch(()=>{})
  if(child&&child.exitCode===null){
   const dying=child
   await new Promise<void>(done=>{dying.once('exit',()=>done());dying.kill('SIGTERM')
    setTimeout(()=>{if(dying.exitCode===null)dying.kill('SIGKILL')},1400).unref()})
  }
  rmSync(root,{recursive:true,force:true})
 }
})
