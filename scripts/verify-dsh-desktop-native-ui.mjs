#!/usr/bin/env node
/**
 * Opt-in Windows official DSH Desktop UI smoke (NOT strike certification).
 * Run on native Windows with:
 * PICKET_DESKTOP_NATIVE_UI_E2E=1
 * PICKET_DESKTOP_EXE=<absolute official DeepSeek Harness.exe>
 * PICKET_PLAYWRIGHT_ENTRY=<absolute playwright-core/index.mjs>
 */
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import net from 'node:net'
import {pathToFileURL} from 'node:url'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function loopbackPort(){
  const s=net.createServer()
  await new Promise((ok,fail)=>{s.once('error',fail);s.listen(0,'127.0.0.1',ok)})
  const port=s.address().port
  await new Promise(ok=>s.close(ok))
  return port
}
async function main(){
  if(process.env.PICKET_DESKTOP_NATIVE_UI_E2E!=='1')
    throw Error('Explicit opt-in required: PICKET_DESKTOP_NATIVE_UI_E2E=1')
  if(process.platform!=='win32')throw Error('Native Windows official Desktop EXE required')
  const exe=process.env.PICKET_DESKTOP_EXE
  const pw=process.env.PICKET_PLAYWRIGHT_ENTRY
  if(!exe||!pw)throw Error('Supply official EXE and playwright-core entry absolute paths')
  const {chromium}=await import(pathToFileURL(resolve(pw)).href)
  const root=mkdtempSync(join(tmpdir(),'ap-picket-native-desktop-smoke-'))
  const dsh=join(root,'isolated-dsh-home')
  const electron=join(root,'isolated-electron-userdata')
  mkdirSync(dsh,{recursive:true})
  mkdirSync(electron,{recursive:true})
  const port=await loopbackPort()
  let child,browser
  try{
    child=spawn(resolve(exe),[
      '--user-data-dir='+electron,
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port='+port,
      '--no-first-run',
      '--disable-background-networking',
    ],{env:{...process.env,DSH_HOME:dsh},windowsHide:false,stdio:'ignore'})
    let ready=false
    for(let attempt=0;attempt<100;attempt++){
      if(child.exitCode!==null)throw Error('Official Desktop exited')
      try{
        const res=await fetch('http://127.0.0.1:'+port+'/json/list',{
          signal:AbortSignal.timeout(1000)})
        const pages=await res.json()
        if(pages.some(p=>p.url==='dsh-app://app/')){ready=true;break}
      }catch{ /* Native process starting */ }
      await sleep(400)
    }
    assert.ok(ready,'Native Desktop never exposed isolated dsh-app UI')
    browser=await chromium.connectOverCDP('http://127.0.0.1:'+port)
    const page=browser.contexts().flatMap(c=>c.pages())
      .find(p=>p.url()==='dsh-app://app/')
    assert.ok(page,'Official Desktop renderer not found')
    const plugin=page.getByRole('button',{name:/^(插件|Plugins)$/i})
    await plugin.waitFor({timeout:60000})
    assert.equal(await plugin.count(),1)
    await plugin.click({timeout:8000})
    const add=page.getByRole('button',{name:/^(添加插件|Add Plugin)$/i})
    await add.waitFor({timeout:8000})
    await add.click()
    const source=page.getByRole('textbox',{name:/^(包名或地址|Package name or address)$/i})
    assert.equal(await source.count(),1)
    const body=await page.locator('body').innerText()
    assert.match(body,/安装源|Installation source/)
    assert.match(body,/来源可信|trusted/)
    assert.ok(!body.includes('Agent Picket'),'Fresh profile must not claim installed plugin')
    console.log(JSON.stringify({
      nativeOfficialApp:true,
      renderer:page.url(),
      isolatedDshHome:true,
      isolatedElectronUserData:true,
      pluginManagerVisible:true,
      officialAddPluginDialogVisible:true,
      preInstallTrustWarningVisible:true,
      pluginInstallPerformed:false,
      userAccountTouched:false,
      verifiedHumanInputHold:false,
      releaseDecision:'NO-GO',
    }))
  }finally{
    if(browser)await browser.close().catch(()=>{})
    if(child){
      spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{
        windowsHide:true,timeout:7000})
    }
    try{rmSync(root,{recursive:true,force:true,maxRetries:2,retryDelay:300})}
    catch(e){console.warn('Disposable profile clean-up deferred:',String(e))}
  }
}
main().catch(e=>{console.error(e);process.exitCode=1})