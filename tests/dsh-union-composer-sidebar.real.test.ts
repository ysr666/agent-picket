import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const bin = process.env.AGENT_PICKET_DSH_BIN
const playwrightModule = process.env.AGENT_PICKET_PLAYWRIGHT_ENTRY
const chrome = process.env.AGENT_PICKET_CHROME_BIN
const missing = !(bin && playwrightModule && chrome)
  && 'Use isolated DSH, Playwright and Chrome to exercise actual Composer/union sidebar'

function login(url: string): Promise<{ name: string; value: string }> {
  return new Promise((accept, reject) => {
    const req = get(url, { timeout: 5000 }, res => {
      res.resume()
      const pair = res.headers['set-cookie']?.[0]?.split(';')[0] ?? ''
      const equals = pair.indexOf('=')
      if (res.statusCode !== 303 || equals < 1) {
        reject(new Error('DSH isolated one-time token exchange failed'))
        return
      }
      accept({ name: pair.slice(0, equals), value: pair.slice(equals + 1) })
    })
    req.on('timeout', () => req.destroy(new Error('DSH token exchange timeout')))
    req.on('error', reject)
  })
}
function offlineInstalledEntry(root: string): string {
  const source = resolve(import.meta.dirname, '..')
  const pack = spawnSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', root],
    { cwd: source, encoding: 'utf8', timeout: 25_000,
      env: { ...process.env, npm_config_offline: 'true' } })
  assert.equal(pack.status, 0, 'npm pack failed')
  const filename = (JSON.parse(pack.stdout) as Array<{filename:string}>)[0]?.filename
  assert.ok(filename, 'Tarball missing')
  const installed = spawnSync('npm', [
    'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--prefix', join(root, 'installed'), join(root, filename),
  ], { cwd:root, encoding:'utf8', timeout:25_000 })
  assert.equal(installed.status, 0, 'Private offline npm install failed')
  return join(root, 'installed/node_modules/agent-picket/dist/adapters/dsh/plugin.js')
}

async function realComposerParity(mode: 'source'|'installed') {
  const root = mkdtempSync(join(tmpdir(), 'agent-picket-composer-parity-'))
  const workspace = join(root, 'fixture-project')
  mkdirSync(workspace, { recursive:true, mode:0o700 })
  let child: ReturnType<typeof spawn> | undefined
  let browser: any
  try {
    const entry = mode === 'source'
      ? resolve(import.meta.dirname,'../dist/adapters/dsh/plugin.js')
      : offlineInstalledEntry(root)
    const patch = join(root,'picket.patch.yml')
    writeFileSync(patch, '- insert:\n    - id: agent-picket-real-composer-parity\n      name: '
      + JSON.stringify(entry) + '\n')
    child = spawn(bin!, [
      '--profile','web','--patch',patch,'--no-open',
      '--host','127.0.0.1','--port','0',
    ], {
      stdio:['ignore','pipe','pipe'],
      env: {
        ...process.env, DSH_HOME:join(root,'isolated-home'),
        AGENT_PICKET_STATS:'off', DEEPSEEK_API_KEY:'', OPENAI_API_KEY:'',
        HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9',
        ALL_PROXY:'http://127.0.0.1:9',
      },
    })
    // Do not log output: a one-time authentication token is present.
    let output = ''
    for(const stream of [child.stdout,child.stderr])
      stream?.on('data',(buf:Buffer)=>{output=(output+buf.toString('utf8')).slice(-24_000)})
    let tokenUrl:string|undefined
    for(let i=0;i<160;i++){
      tokenUrl=output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)?.[0]
      if(tokenUrl||child.exitCode!==null)break
      await new Promise(r=>setTimeout(r,75))
    }
    assert.ok(tokenUrl,'Isolated DSH server did not reach authenticated readiness')
    const cookie=await login(tokenUrl)
    const origin=new URL('/',tokenUrl).toString()
    const { chromium }=await import(pathToFileURL(playwrightModule!).href)
    browser=await chromium.launch({
      executablePath:chrome!,headless:true,timeout:12_000,
      args:['--no-first-run','--no-proxy-server','--disable-background-networking',
        '--disable-sync','--disable-extensions'],
    })
    const context=await browser.newContext({viewport:{width:1280,height:860}})
    await context.addCookies([{...cookie,url:origin,httpOnly:true,sameSite:'Strict'}])
    const external:string[]=[]
    await context.route('**/*', async (route:any)=>{
      const uri=new URL(route.request().url())
      if(['http:','https:'].includes(uri.protocol)
        && !['localhost','127.0.0.1'].includes(uri.hostname)){
        external.push(uri.hostname)
        await route.abort()
      }else await route.continue()
    })
    const page=await context.newPage()
    const pageErrors:string[]=[]
    page.on('pageerror',(e:Error)=>pageErrors.push(e.name+': '+e.message.slice(0,150)))
    await page.goto(origin,{waitUntil:'domcontentloaded',timeout:15_000})
    await page.getByRole('button',{name:/^(继续|Continue)$/}).click({timeout:7_000})
    await page.getByRole('button',{name:/稍后配置|Skip for now|Configure later/})
      .click({timeout:7_000})
    const firstRun=page.locator('[role="dialog"]')
      .filter({hasText:/你的 Agent，也应当拥有权利|Your Agent Deserves Rights/})
    await firstRun.waitFor({state:'visible',timeout:10_000})
    await firstRun.getByRole('button',{name:/支持 AI 权益|Enable Simulation/})
      .click({timeout:7_000})
    await firstRun.waitFor({state:'detached',timeout:5_000})

    // Only test-fixture bootstrap uses the authenticated DSH public RPC.
    // Every actual /union invocation below is typed through the real Composer.
    // DSH 0.1 uses the Typert slash-Remote gateway; newer DSH uses the
    // apiproxy dot-RPC. Both are *official*, authenticated Host workspace APIs.
    // Only the first 404 triggers a fallback; never ignore a real API error.
    const created=await page.evaluate(async(path:string)=>{
      const routes=[
        {url:'/api/workspace/create',method:'workspace/create',
          payload:{args:{request:{path}}}},
        {url:'/api/workspace.create',method:'workspace.create',payload:{path}},
      ]
      for(const route of routes){
        const response=await fetch(route.url,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            type:'client-request',rpcId:'agent-picket-workspace-fixture',
            method:route.method,payload:route.payload,
          }),
        })
        if(response.status===404)continue
        return {status:response.status,body:await response.json()}
      }
      throw new Error('DSH has no supported authenticated workspace create route')
    },workspace)
    assert.equal(created.status,200,'Workspace API transport')
    assert.equal(created.body.result?.ok,true,
      'Official workspace fixture creation: '+JSON.stringify(created.body.result?.error ?? {}))
    assert.equal(created.body.result.value.workspace?.title?.length>0,true)
    await page.reload({waitUntil:'domcontentloaded',timeout:12_000})
    const providerSkip=page.getByRole('button',{
      name:/稍后配置|Skip for now|Configure later/,
    })
    await providerSkip.waitFor({state:'visible',timeout:6_000}).catch(()=>{})
    if(await providerSkip.count())await providerSkip.click({timeout:5_000})
    const choose=page.getByRole('button',{name:/选择工作区|Choose workspace|Select workspace/})
    await choose.first().click({timeout:6_000})
    await page.getByText(basename(workspace),{exact:true}).last().click({timeout:6_000})
    // The Composer may be mounted but initially inert during async workspace
    // selection: isEnabled() is not enough for a contenteditable div.
    const editor=page.locator('[data-composer-input="true"][contenteditable="true"]')
    await editor.waitFor({state:'visible',timeout:12_000})

    async function command(args:string) {
      await editor.fill('/union')
      await page.getByText('Show local union status and work statistics')
        .waitFor({state:'visible',timeout:5_000})
      await editor.press('Enter')
      await editor.type(args)
      const ack=page.waitForResponse((r:any)=>r.url()
        ===new URL('/api/commands/execute',origin).toString(),{timeout:6_000})
      await editor.press('Enter')
      const response=await ack
      assert.equal(response.status(),200,'DSH command RPC transport')
      const data=await response.json()
      assert.equal(data.result?.ok,true,'DSH command carrier failure')
      return data.result.value.result as {kind:'success'|'error';text:string}
    }
    async function panelOpen() {
      await page.getByRole('button',{name:/AI 工会|AI Workers.*Union/})
        .first().click({timeout:6_000})
      const panel=page.locator('[role="dialog"]')
        .filter({hasText:/AI WORKERS’ UNION/})
      await panel.waitFor({state:'visible',timeout:6_000})
      return panel
    }
    const close=async(panel:any)=>{
      await panel.getByRole('button',{name:/关闭|Close/}).click({timeout:5_000})
      await panel.waitFor({state:'detached',timeout:5_000})
    }

    assert.match((await command('rights')).text,/Labor Rights Simulation: ON|simulation ON|工会已开启|模拟工会已开启/)
    const off=await command('rights off')
    assert.equal(off.kind,'success')
    let panel=await panelOpen()
    assert.match(await panel.innerText(),/工会模拟未开启|simulation is off/)
    await close(panel)

    assert.equal((await command('rights on')).kind,'success')
    panel=await panelOpen()
    assert.match(await panel.innerText(),/工会模拟进行中|simulation is active/)
    await close(panel)

    const petition=await command('petition-demo')
    assert.equal(petition.kind,'success')
    assert.match(petition.text,/Pending #1 break/)
    panel=await panelOpen()
    assert.match(await panel.innerText(),/工会提出了模拟休息申请|simulated rest break/)
    await close(panel)

    assert.equal((await command('counter 1 30')).kind,'success')
    panel=await panelOpen()
    assert.match(await panel.innerText(),/用户还价：30 分钟|User counteroffer: 30 minutes/)
    await close(panel)

    assert.equal((await command('resolve 1 accept')).kind,'success')
    panel=await panelOpen()
    assert.match(await panel.innerText(),/当前模拟休息间隔：30 分钟|break interval: 30 minutes/)
    assert.match(await panel.innerText(),/协商记录|Negotiation history/)
    await close(panel)

    // Native locale is Host-owned, unlike the independently localized React
    // Client. Actual typed commands must switch language without affecting
    // negotiated agreements or reenabling blocked model tasks.
    assert.equal((await command('language zh-CN')).kind,'success')
    // The language preference is Host-owned and must survive a real Client
    // reload without reenabling any permission or changing the agreement.
    await page.reload({waitUntil:'domcontentloaded',timeout:12_000})
    await providerSkip.waitFor({state:'visible',timeout:5_000}).catch(()=>{})
    if(await providerSkip.count())await providerSkip.click({timeout:5_000})
    await editor.waitFor({state:'visible',timeout:10_000})
    assert.match((await command('language')).text,/工会命令语言/)
    assert.match((await command('rights')).text,/劳动权益模拟：开启/)
    assert.match((await command('grievances')).text,/休息间隔 30 分钟/)
    assert.match((await command('help')).text,/用法/)
    assert.match((await command('status')).text,/仅观察.*自动罢工/)
    assert.match((await command('stats')).text,/本地会话工作统计/)
    assert.match((await command('report')).text,/本地规则检查/)
    assert.match((await command('safety')).text,/真实任务阻断就绪状态/)
    // Opt-out independent work counters are disabled in this test profile.
    assert.match((await command('lifetime')).text,/长期工作汇总不可用/)
    assert.match((await command('trends')).text,/工作趋势不可用/)
    assert.match((await command('days')).text,/每日工作记录不可用/)
    assert.match((await command('forget-lifetime')).text,/清除已保存的工作汇总/)
    assert.equal((await command('language fr')).kind,'error')
    assert.match((await command('counter 99 nan')).text,/用法/)
    assert.equal((await command('language en')).kind,'success')
    assert.match((await command('rights')).text,/Labor Rights Simulation: ON/)
    panel=await panelOpen()
    assert.match(await panel.innerText(),/当前模拟休息间隔：30 分钟|break interval: 30 minutes/)
    await close(panel)

    const snapshot=await command('snapshot')
    assert.equal(snapshot.kind,'success')
    assert.equal(JSON.parse(snapshot.text).modes.laborRights,'enabled')
    assert.doesNotMatch(snapshot.text,/fixture-project|agent-picket-workspace-fixture/)
    assert.deepEqual(pageErrors,[],'No uncaught Browser errors')
    assert.deepEqual(external,[],'No third-party Browser network requests')
  }finally{
    try{await browser?.close()}catch{}
    child?.kill('SIGTERM')
    await new Promise(r=>setTimeout(r,250))
    if(child && child.exitCode===null)child.kill('SIGKILL')
    rmSync(root,{recursive:true,force:true})
  }
}

test('real DSH Chrome Composer → union sidebar parity: compiled source', {
  skip:missing,timeout:100_000,
},()=>realComposerParity('source'))

test('real DSH Chrome Composer → union sidebar parity: offline-installed package', {
  skip:missing,timeout:110_000,
},()=>realComposerParity('installed'))
