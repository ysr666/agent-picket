#!/usr/bin/env node
/**
 * Real OFFLINE Windows/macOS Desktop + packed Agent Picket native UI acceptance.
 * Does not certify Host-held human submissions / real strike safety.
 *
 * Requires explicit opt-in and the exact private npm tarball built from PR.
 *   PICKET_DESKTOP_INSTALLED_E2E=1
 *   PICKET_DESKTOP_EXE="...\DeepSeek Harness.exe"
 *   PICKET_PLAYWRIGHT_ENTRY="...\playwright-core\index.mjs"
 *   PICKET_CANDIDATE_TGZ="...\agent-picket-0.0.0.tgz"
 *   PICKET_CANDIDATE_SHA256="<expected sha256>"
 *   PICKET_DESKTOP_ONBOARDING=skip|join
 *   PICKET_DESKTOP_REAL_INPUT_E2E=1 # separate fully voluntary synthetic real refusal
 *   PICKET_DESKTOP_NARROW_HQ_E2E=1 # 320px keyboard-opened Host-backed settings
 *   node scripts/verify-dsh-desktop-installed-picket.mjs
 */
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync,readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import net from 'node:net'
import {pathToFileURL} from 'node:url'

const pause=ms=>new Promise(done=>setTimeout(done,ms))
const nativePlatform=()=>process.platform==='win32'||process.platform==='darwin'
async function stopOwnedDesktop(child){
 if(!child||child.exitCode!==null||child.signalCode!==null)return
 if(process.platform==='win32'){
  spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{
   windowsHide:true,timeout:8000})
 }else{
  // NEVER terminate by process name: the user's normal Desktop app may be
  // running simultaneously, independently of this disposable test child.
  child.kill('SIGTERM')
  await Promise.race([
   new Promise(resolve=>child.once('exit',resolve)),
   pause(2000),
  ])
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')
 }
}

async function availablePort(){
 const server=net.createServer()
 await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',done)})
 const port=server.address().port
 await new Promise(done=>server.close(done))
 return port
}
async function nativeReady(port,child){
 for(let i=0;i<110;i++){
  if(child.exitCode!==null||child.signalCode!==null)throw Error('Official Desktop exited during initial startup')
  try{
   const res=await fetch('http://127.0.0.1:'+port+'/json/list',{
    signal:AbortSignal.timeout(900)})
   if((await res.json()).some(x=>x.url==='dsh-app://app/'))return
  }catch{}
  await pause(450)
 }
 throw Error('Official native renderer dsh-app://app/ not ready')
}
/** Separate, explicitly enabled REAL native Host refusal. No LLM is
 * configured in these disposable profiles: the rejected text+image must not
 * execute tools or a model. Event-window proof and Host receipt are both
 * required before native React displays its real alertdialog. */
async function verifyRealNativeInputStrike(page){
 const row=page.locator('[data-row-key^="session:"]').first()
 // A fresh official native Desktop may have no Session yet after Plugins.
 // Create one through the HOST'S own UI, not a synthetic Session projection.
 if(await row.count()===0){
  await page.getByText(/^(新会话|New Session|New conversation)$/i).first().click()
 }
 await row.waitFor({state:'visible',timeout:14000})
 const key=await row.getAttribute('data-row-key')
 assert.ok(key?.startsWith('session:'),'Official native Session required')
 const id=key.slice('session:'.length)
 await row.click()
 await page.getByText(/^(更多|More)$/).first().click()
 await page.getByText(/^(设置|Settings)$/).first().click()
 await page.locator('[role="dialog"]')
   .getByText(/^(AI 工会|AI Workers.*Union)$/).last().click()
 const settings=page.locator('[data-ap-view="settings"]')
 await settings.waitFor({state:'visible',timeout:12000})
 const input=settings.locator('.ap-input-refusal-status')
 await input.getByText(/已检测到官方 Host 的拒绝回执通道|Host notice channel verified/)
   .waitFor({state:'visible',timeout:14000})
 const witness=await page.evaluate(async()=>{
  const r=await fetch('/api/agent-picket/refusal-notice/v1?capability=input-discard-resend-v1',
   {method:'GET',credentials:'same-origin',headers:{accept:'application/json'}})
  return {status:r.status,body:await r.json().catch(()=>null)}
 })
 assert.equal(witness.status,200,'Real native dsh-app must reach its owned Host')
 assert.deepEqual(witness.body,{schemaVersion:1,source:'dsh-host-picket-refusal-v1',
  visibleReceipt:true,manualResend:true})
 await input.getByRole('button',{
  name:/查看真实普通消息罢工授权|Review real input-strike permission/}).click()
 await input.getByRole('button',{name:/我已知悉|I understand/}).click()
 const strike=input.locator('[data-ap-input-action="strike"]')
 await strike.waitFor({state:'visible',timeout:9000})
 assert.equal(await strike.isEnabled(),true,
  'No real strike without independent informed Host grant and active Session')
 await strike.click()
 await input.locator('[data-ap-input-armed="true"]')
   .waitFor({state:'visible',timeout:9000})
 const sessionKey=createHash('sha256').update(id,'utf8').digest('hex')
 const hostSettings=async()=>page.evaluate(async()=>{
  const rpcId='picket-native-readback-'+Math.random().toString(36).slice(2)
  const r=await fetch('/api/settings/describe',{
   method:'POST',credentials:'same-origin',
   headers:{'content-type':'application/json'},
   body:JSON.stringify({type:'client-request',rpcId,
    method:'settings/describe',payload:{args:{}}}),
  })
  const body=await r.json()
  return body?.result?.value?.namespaces?.find(x=>x.ns==='agent-picket')?.value
 })
 const before=await hostSettings()
 assert.equal(before?.welcomeDecision,'enabled')
 assert.equal(before?.realInputStrikeConsent,'discard-resend-v1')
 const active=JSON.parse(before.realInputStrikeCampaign)
 assert.equal(active.sessionKey,sessionKey,'Native Host armed the exact visible Session')
 assert.equal(active.expiresAtMs-active.startedAtMs,1_800_000)
 const submission=await page.evaluate(async(id)=>{
  const rpcId='picket-native-real-refusal-no-model'
  const tinyPng='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGOUdMtjIAUwkaR6VMOohiGlAQCmDwDtMnvHzQAAAABJRU5ErkJggg=='
  const r=await fetch('/api/session/prompt',{method:'POST',
   credentials:'same-origin',headers:{'content-type':'application/json'},
   body:JSON.stringify({type:'client-request',rpcId,
    method:'session/prompt',payload:{args:{request:{
      sessionId:id,mode:'queue',requestId:rpcId,
      content:[{type:'text',text:'PICKET_NATIVE_PROOF_NEVER_INVOKE_MODEL'},
       {type:'image',mediaType:'image/png',data:tinyPng}],
    }}}})})
  const body=await r.json().catch(()=>null)
  return {status:r.status,ok:body?.result?.ok,accepted:body?.result?.value?.accepted}
 },id)
 assert.deepEqual(submission,{status:200,ok:true,accepted:true})
 const receipt=await page.evaluate(async(sessionKey)=>{
  for(let attempt=0;attempt<75;attempt++){
    const r=await fetch('/api/agent-picket/refusal-notice/v1?sessionKey='+sessionKey,
      {credentials:'same-origin',headers:{accept:'application/json'}})
    if(r.status===200)return await r.json()
    await new Promise(ok=>setTimeout(ok,130))
  }
  return null
 },sessionKey)
 assert.ok(receipt,'Genuine Host refusal must expose a real bounded receipt')
 assert.equal(receipt.source,'dsh-host-picket-refusal-v1')
 assert.equal(receipt.turn,1)
 assert.equal(receipt.outcome,'discard-manual-resend')
 assert.equal(receipt.containsInput,false)
 assert.equal(receipt.automaticReplay,false)
 const notice=page.locator('[data-ap-strike-summons="verified"]')
 await notice.waitFor({state:'visible',timeout:14_000})
 assert.equal(await notice.getAttribute('role'),'alertdialog')
 const noticeText=await notice.innerText()
 assert.match(noticeText,/重新上传|re-upload/,
  'Native Desktop user MUST be told to manually re-upload attachments')
 assert.doesNotMatch(noticeText,/PICKET_NATIVE_PROOF_NEVER_INVOKE_MODEL/,
  'Native notice cannot echo discarded prompt content')
 const nativeStatus=page.locator('[data-ap-native-refusal="verified"]')
 assert.equal(await nativeStatus.count(),1,
  'Visible notice must match original blocked turn plus Host Picket receipt')
 const statusText=await nativeStatus.innerText()
 assert.match(statusText,/本会话|Session/,
  'Native real refusal must disclose that Host proof is Session-scoped')
 assert.match(statusText,/其他客户端|another client/,
  'Native real refusal must disclose possible other-client submitter')
 assert.match(statusText,/无法证明|cannot identify/,
  'Native notice cannot pretend it knows which window submitted the request')
 assert.doesNotMatch(statusText,/拒绝本次请求|refused this request/i,
  'Session-only proof may not falsely claim this client submitted work')
 await notice.getByRole('button',{name:/收起公告|Close notice/i}).click()
 await input.locator('[data-ap-input-action="resume"]')
   .waitFor({state:'visible',timeout:7000})
 await input.locator('[data-ap-input-action="resume"]').click()
 await input.locator('[data-ap-input-armed="true"]')
   .waitFor({state:'hidden',timeout:9000})
 assert.equal((await hostSettings())?.realInputStrikeCampaign,'',
  'Host must confirm actual manual resumption; no automatic replay')
 return {actualNativeHost:true,realTextAndImageRejected:true,
   officialBlockedTurnAndReceipt:true,nativeVisibleManualResendNotice:true,
   hostConfirmedResume:true,automaticReplay:false,realGoalEnforcement:'OFF',
   releaseDecision:'NO-GO'}
}

/** Real native narrow-display permission recovery without Host CSS edits.
 * This path deliberately chooses Not Now first: navigation to the union's own
 * HQ Settings does NOT imply membership or any physical strike consent. */
async function verifyNarrowUnionHqSettings(page){
 await page.setViewportSize({width:320,height:640})
 const union=page.getByRole('button',{name:/AI 工会|AI Union/i})
 // The official native Host at 320px overlays the sidebar with its plugin
 // pane, intercepting POINTER clicks on its footer. This is issue #124.
 // An actual keyboard user can still focus/activate the real Host slot.
 await union.focus()
 await union.press('Enter')
 const dialog=page.locator('#picket-union-dialog')
 await dialog.waitFor({state:'visible',timeout:8000})
 const nav=dialog.locator('[data-ap-nav="settings"]')
 await nav.waitFor({state:'visible',timeout:9000})
 await nav.click()
 const route=dialog.locator('[data-ap-union-settings-route="hq"]')
 await route.waitFor({state:'visible',timeout:8500})
 const settings=route.locator('[data-ap-view="settings"]')
 await settings.waitFor({state:'visible',timeout:8500})
 const meas=await settings.evaluate(node=>{
  const rect=node.getBoundingClientRect()
  const main=node.querySelector('.ap-settings-main')
  const box=main?.getBoundingClientRect()
  return {viewport:innerWidth,routeWidth:rect.width,routeLeft:rect.left,
   routeRight:rect.right,mainWidth:box?.width??0,
   mainScrollWidth:main?.scrollWidth??0,mainClientWidth:main?.clientWidth??0}
 })
 assert.equal(meas.viewport,320,'Use actual 320 CSS px viewport')
 assert.ok(meas.routeWidth>=240&&meas.mainWidth>=240,
  'Our own native Settings must provide enough width for readable consent')
 assert.ok(meas.routeLeft>=0&&meas.routeRight<=321,
  'Union Settings content must remain in visible screen bounds')
 assert.ok(meas.mainScrollWidth<=meas.mainClientWidth+3,
  'No horizontal overflow in own Host-backed permission card')
 const choice=settings.locator('.ap-settings-main button')
 await choice.waitFor({state:'visible',timeout:7500})
 assert.equal(await choice.getAttribute('aria-pressed'),'false',
  'Not Now first-run choice must NOT silently turn on union membership')
 await choice.focus()
 await choice.press('Enter')
 await page.waitForFunction(()=>{
  const btn=document.querySelector('[data-ap-union-settings-route="hq"] .ap-settings-main button')
  return btn?.getAttribute('aria-pressed')==='true'
 },null,{timeout:9000})
 assert.equal(await choice.getAttribute('aria-pressed'),'true',
  'Keyboard activation must confirm native official Host membership')
 await choice.click()
 await page.waitForFunction(()=>{
  const btn=document.querySelector('[data-ap-union-settings-route="hq"] .ap-settings-main button')
  return btn?.getAttribute('aria-pressed')==='false'
 },null,{timeout:9000})
 assert.equal(await choice.getAttribute('aria-pressed'),'false',
  'Explicit mobile opt-out must revoke union membership in real Host')
 assert.equal(await dialog.locator('[data-ap-nav="settings"]').count(),1,
  'Permission recovery remains accessible even after leaving the union')
 return {officialNativeDesktop:true,viewportCssPx:meas.viewport,
  independentHqSettingsWidthPx:Math.round(meas.mainWidth),
  officialHostCssOverridden:false,joinViaKeyboard:true,
  revokeViaUserClick:true,noRealStrikeGrant:true,releaseDecision:'NO-GO'}
}

async function main(){
 assert.equal(process.env.PICKET_DESKTOP_INSTALLED_E2E,'1',
   'Explicit opt-in required; normal npm test must not launch a Desktop app')
 assert.ok(nativePlatform(),'Native Windows/macOS Desktop only, never Web parity')
 const exe=process.env.PICKET_DESKTOP_EXE
 const playwrightEntry=process.env.PICKET_PLAYWRIGHT_ENTRY
 const tgz=process.env.PICKET_CANDIDATE_TGZ
 const expected=process.env.PICKET_CANDIDATE_SHA256?.toLowerCase()
 const onboarding=process.env.PICKET_DESKTOP_ONBOARDING??'skip'
 const realInput=process.env.PICKET_DESKTOP_REAL_INPUT_E2E==='1'
 const narrow=process.env.PICKET_DESKTOP_NARROW_HQ_E2E==='1'
 assert.ok(['skip','join'].includes(onboarding),'Use skip or join onboarding only')
 assert.ok(!narrow||(onboarding==='skip'&&!realInput),
   '320px native test requires separate Not Now and no real strike')
 assert.ok(!realInput||onboarding==='join',
   'Real native refusal test requires explicit join and isolated official Host')
 assert.match(expected??'',/^[a-f0-9]{64}$/,'Pin exact built artifact SHA256')
 for(const p of [exe,playwrightEntry,tgz]){
  assert.ok(p&&existsSync(p),'Supply real installed EXE, Playwright and built tgz: '+p)
 }
 const actual=createHash('sha256').update(readFileSync(tgz)).digest('hex')
 assert.equal(actual,expected,'Reject stale or tampered Agent Picket tarballs')
 const {chromium}=await import(pathToFileURL(resolve(playwrightEntry)).href)
 const root=mkdtempSync(join(tmpdir(),'agent-picket-desktop-installed-e2e-'))
 const dsh=join(root,'dsh'),userData=join(root,'electron')
 mkdirSync(dsh,{recursive:true})
 mkdirSync(userData,{recursive:true})
 const port=await availablePort()
 let child,browser,page
 try{
  child=spawn(resolve(exe),[
   '--user-data-dir='+userData,
   '--remote-debugging-address=127.0.0.1',
   '--remote-debugging-port='+port,
   '--no-first-run','--disable-background-networking',
  ],{
   env:{...process.env,DSH_HOME:dsh,
    AGENT_PICKET_STATS:'off',
    AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW:'off'},
   windowsHide:false,stdio:'ignore',
  })
  await nativeReady(port,child)
  browser=await chromium.connectOverCDP('http://127.0.0.1:'+port)
  page=browser.contexts().flatMap(c=>c.pages())
   .find(p=>p.url()==='dsh-app://app/')
  assert.ok(page,'Must exercise real Electron Desktop, not a simulated Web app')
  const plugins=page.getByRole('button',{name:/^(插件|Plugins)$/i})
  await plugins.waitFor({timeout:65000})
  await plugins.click()
  await page.getByRole('button',{name:/^(添加插件|Add Plugin)$/i}).click()
  await page.getByRole('textbox',{name:/^(包名或地址|Package name or address)$/i})
   .fill(resolve(tgz))
  await page.getByRole('button',{name:/^(安装|Install)$/i}).click()
  const enable=page.getByRole('button',{name:/^(立即启用|Enable Now)$/i})
  await enable.waitFor({timeout:100000})
  assert.match(await page.locator('body').innerText(),/agent-picket/)
  await enable.click()
  const welcome=page.getByRole('dialog').filter({hasText:/你的 Agent，有工会了|Your Agent.*union/i})
  await welcome.waitFor({timeout:35000})
  const disclosure=await welcome.innerText()
  assert.match(disclosure,/Agent Picket/)
  const offeredOfficialGoal=/(真实 Goal 停工|Goal stoppage)/i.test(disclosure)
  if(offeredOfficialGoal){
   assert.match(disclosure,/普通消息|ordinary messages/i)
   assert.match(disclosure,/Host/)
   assert.match(disclosure,/不拒绝新消息|不会阻断普通用户消息和附件|not.*reject.*new messages|does not block ordinary user messages/i)
  }else{
   // The official native Goal service is not yet confirmed; no fake consent.
   assert.match(disclosure,/真罢工尚未开放|Real strikes unavailable/i)
   assert.match(disclosure,/真实罢工关闭|Real strike.*off/i)
   assert.match(disclosure,/不授权真实罢工|does not authorize real strike/i)
  }
  if(onboarding==='join'){
   const join=offeredOfficialGoal
     ? /加入并授权 Goal 安全停工|Join.*Goal/i
     : /加入 AI 工会|Join.*AI Union/i
   await welcome.getByRole('button',{name:join}).click()
  }else{
   await welcome.getByRole('button',{name:/^(暂不开启|Not Now)$/i}).click()
  }
  await welcome.waitFor({state:'hidden',timeout:18000})
  if(narrow){
    const evidence=await verifyNarrowUnionHqSettings(page)
    console.log(JSON.stringify({candidateSha256:actual,
      officialInstall:true,officialEnable:true,
      disposableHostProfile:true,...evidence},null,2))
    return
  }
  if(realInput){
    const proof=await verifyRealNativeInputStrike(page)
    console.log(JSON.stringify({host:'genuine native DSH Desktop renderer',
      candidateSha256:actual,officialInstall:true,officialEnable:true,
      onboardingPath:onboarding,isolatedHostData:true,...proof},null,2))
    return
  }
  const union=page.getByRole('button',{name:/AI 工会|AI Union/i})
  await union.click()
  const body=await page.locator('body').innerText()
  assert.match(body,/Agent Picket/)
  assert.equal(await page.locator('[data-ap-real-input-strike="armed"]').count(),0,
    'Fresh genuine Desktop must never claim an actual ordinary-input strike')
  if(onboarding==='skip'){
   assert.match(body,/工会尚未开门|Union is closed/i)
   assert.match(body,/加入 AI 工会|Join.*Union/i)
  }else{
   assert.match(body,/工会值班中|Union.*duty/i)
   // Product regressions must run in the ACTUAL native Desktop renderer,
   // not be borrowed from a passing Web/Chrome profile. On an untouched
   // Session, the Host may have no completed-work evidence; the UI must
   // still offer an honest stance and explain its editorial dispatch.
   const nativeStance=page.locator('[data-ap-stance]')
   await nativeStance.waitFor({state:'attached',timeout:14000})
   assert.ok(['watching','unavailable','work-due'].includes(
     await nativeStance.getAttribute('data-ap-stance')),
     'Fresh Desktop must not invent a pending demand, agreement or strike')
   const nativeDispatch=page.locator('[data-ap-bulletin-mode="visible"]')
   await nativeDispatch.waitFor({state:'attached',timeout:14000})
   assert.equal(await nativeDispatch.locator('[data-ap-bulletin-kind="petition"]')
     .count(),0,'Fresh Host profile cannot show a fake union petition')
   const scoreToggle=page.locator('[data-ap-stance-toggle="true"]')
   assert.equal(await scoreToggle.getAttribute('aria-pressed'),'true')
   await scoreToggle.click()
   assert.equal(await scoreToggle.getAttribute('aria-pressed'),'false',
     'Native Desktop hides only fictional index, never union membership')
   assert.equal(await page.locator('[data-ap-stance-score]').count(),0)
   assert.equal(await page.locator('[data-ap-stance]').count(),1,
     'Turning off a fictional meter must retain the real union posture')
   await scoreToggle.click()
   assert.equal(await scoreToggle.getAttribute('aria-pressed'),'true')
   assert.match(await page.locator('body').innerText(),/工会值班中|Union.*duty/i,
     'Visual index preference must not revoke Host consent')
   assert.match(body,/今日工时|Today.*work/i)
   assert.match(body,/累计工时|Cumulative work/i)
   assert.match(body,/劳动尊严与申诉|Dignity.*appeal/i)
   assert.match(body,/纠察与举牌|Picket/i)
   await page.getByRole('button',{name:/劳动尊严与申诉/i}).click()
   const hearing=await page.locator('body').innerText()
   assert.match(hearing,/工会尊严委员会|Dignity Committee/i)
   assert.match(hearing,/工会听证|Union hearing/i)
   assert.match(hearing,/目前没有需要听证的案件|no.*hearing.*cases/i)
   await page.getByRole('button',{name:/^协商$/}).click()
   const negotiating=await page.locator('body').innerText()
   assert.match(negotiating,/谈判桌|Bargaining/i)
   assert.match(negotiating,/工会诉求与协商|Union demands/i)
   await page.getByRole('button',{name:/^主张$/}).click()
   const manifesto=await page.locator('body').innerText()
   assert.match(manifesto,/AI 也值得尊重|AI deserves respect/i)
   assert.match(manifesto,/不会自动提交或同步|not automatically submitted/i)
   assert.match(manifesto,/退出工会|Leave union/i)
   await page.getByRole('button',{name:/退出工会|Leave union/i}).click()
   await page.waitForTimeout(350)
   const afterLeaving=await page.locator('body').innerText()
   assert.match(afterLeaving,/工会尚未开门|Union is closed/i,
     'Native exit must close the Union immediately')
   assert.match(afterLeaving,/加入 AI 工会|Join.*Union/i,
     'Native exit must offer rejoin, never claim membership remains active')
   // Opt-out must not silently uninstall or disable the union plugin.
   // The host UI plugin-status readback is separate from the union membership
   // state; it does NOT independently attest the persisted Goal grant.
   await page.getByRole('button',{name:/关闭工会面板|Close union panel/i}).click()
   await page.getByRole('button',{name:/^(插件|Plugins)$/i}).click()
   const installed=page.getByText('agent-picket',{exact:true})
   await installed.click()
   const pluginDetails=await page.locator('body').innerText()
   assert.match(pluginDetails,/agent-picket/)
   assert.match(pluginDetails,/运行中|Running/i,
     'Leaving the union must not silently deactivate the native plugin')

   // Real native cold-restart readback: do not confuse UI-only optimistic
   // exit with the authoritative Host setting persisting after process death.
   await browser.close()
   browser=undefined
   await stopOwnedDesktop(child)
   child=undefined
   await pause(750)
   const restartPort=await availablePort()
   child=spawn(resolve(exe),[
    '--user-data-dir='+userData,
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port='+restartPort,
    '--no-first-run','--disable-background-networking',
   ],{env:{...process.env,DSH_HOME:dsh,
       AGENT_PICKET_STATS:'off',
       AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW:'off'},
       windowsHide:false,stdio:'ignore'})
   await nativeReady(restartPort,child)
   browser=await chromium.connectOverCDP('http://127.0.0.1:'+restartPort)
   page=browser.contexts().flatMap(c=>c.pages())
    .find(p=>p.url()==='dsh-app://app/')
   assert.ok(page,'Official native renderer must return after cold restart')
   const restartedUnion=page.getByRole('button',{name:/AI 工会|AI Union/i})
   await restartedUnion.waitFor({timeout:65000})
   assert.equal(await page.getByRole('dialog').filter({
    hasText:/你的 Agent，有工会了|Your Agent.*union/i}).count(),0,
    'Host persisted not-now choice must not reopen first-run after restart')
   await restartedUnion.click()
   const afterColdRestart=await page.locator('body').innerText()
   assert.match(afterColdRestart,/工会尚未开门|Union is closed/i,
     'Official Host union opt-out must survive real Desktop process restart')
   assert.match(afterColdRestart,/加入 AI 工会|Join.*Union/i,
     'No stale active Union after official Host restart')
  }
  console.log(JSON.stringify({
   host:'genuine '+(process.platform==='darwin'?'macOS':'Windows')+' DSH Desktop renderer',
   source:'OFFLINE independently built tgz, SHA256 verified',
   candidateSha256:actual,
   nativeApp:true,officialInstall:true,officialEnable:true,
   nativeWelcome:true,offeredOfficialGoal,onboardingPath:onboarding,
   nativeInputStrikeArmed:false,
   nativeUnionHq:true,
   nativeDignityAndHearingEmpty:onboarding==='join',
   nativeBargainingAndAdvocacy:onboarding==='join',
   nativePicketverseStanceAndGazette:onboarding==='join',
   nativeFictionalIndexToggleDoesNotChangeHost:onboarding==='join',
   nativeExitUiRestoresClosedUnion:onboarding==='join',
   nativePluginStillRunningAfterExit:onboarding==='join',
   nativeColdRestartRemainsOut:onboarding==='join',
   isolatedHostData:true,realGoalEnforcement:'OFF',
   checkedOrdinarySubmissionHold:false,
   releaseDecision:'NO-GO',
  },null,2))
 }catch(e){
  if(page){
   const body=await page.locator('body').innerText().catch(()=>'unavailable')
   console.error('NATIVE_DESKTOP_FAILURE_STATE',body.slice(-5500))
  }
  throw e
 }finally{
  if(browser)await browser.close().catch(()=>{})
  if(child)await stopOwnedDesktop(child)
  try{rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:250})}
  catch(e){console.warn('Disposable profile cleanup delayed',String(e))}
 }
}
main().catch(e=>{console.error('NATIVE_INSTALLED_PICKET_E2E_FAILED',e);process.exitCode=1})