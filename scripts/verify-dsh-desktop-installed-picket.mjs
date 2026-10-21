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
async function main(){
 assert.equal(process.env.PICKET_DESKTOP_INSTALLED_E2E,'1',
   'Explicit opt-in required; normal npm test must not launch a Desktop app')
 assert.ok(nativePlatform(),'Native Windows/macOS Desktop only, never Web parity')
 const exe=process.env.PICKET_DESKTOP_EXE
 const playwrightEntry=process.env.PICKET_PLAYWRIGHT_ENTRY
 const tgz=process.env.PICKET_CANDIDATE_TGZ
 const expected=process.env.PICKET_CANDIDATE_SHA256?.toLowerCase()
 const onboarding=process.env.PICKET_DESKTOP_ONBOARDING??'skip'
 assert.ok(['skip','join'].includes(onboarding),'Use skip or join onboarding only')
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