import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { DurableStats } from '../src/adapters/node/durable-stats.ts'

const dshBin = process.env.AGENT_PICKET_DSH_BIN
const playwrightEntry = process.env.AGENT_PICKET_PLAYWRIGHT_ENTRY
const chromeBin = process.env.AGENT_PICKET_CHROME_BIN
const installedWebProfile=process.env.PICKET_TEST_DSH_HOME || process.env.PICKET_TEST_017_HOME
const dshVersion=dshBin?spawnSync(dshBin,['--version'],{
  encoding:'utf8',timeout:5_000,
}).stdout?.trim()??'':''
const skipped = !(dshBin && playwrightEntry && chromeBin)
  ? 'Set isolated DSH binary, Playwright entry and Chrome path to run real Web E2E'
  : dshVersion.startsWith('0.2.') && !installedWebProfile
    ? 'DSH 0.2 rights AX requires an officially installed Web Profile; run scripts/verify-dsh-rights-a11y.sh'
    : false

function exchangeCookie(secretUrl: string): Promise<{ name: string; value: string }> {
  return new Promise((resolveCookie, reject) => {
    const request = get(secretUrl, { timeout: 5000 }, response => {
      response.resume()
      const raw = response.headers['set-cookie']?.[0]?.split(';')[0] ?? ''
      const equals = raw.indexOf('=')
      if (response.statusCode !== 303 || equals < 1) {
        reject(new Error('Isolated DSH authentication failed'))
        return
      }
      resolveCookie({ name: raw.slice(0, equals), value: raw.slice(equals + 1) })
    })
    request.on('timeout', () => request.destroy(new Error('DSH cookie timeout')))
    request.on('error', reject)
  })
}

/** Build a private offline-installed package, not the developer's global DSH. */
function offlineInstalledPlugin(root: string): string {
  const sourceRoot = resolve(import.meta.dirname, '..')
  const packed = spawnSync('npm', [
    'pack', '--json', '--ignore-scripts', '--pack-destination', root,
  ], {
    cwd: sourceRoot, encoding: 'utf8', timeout: 20_000,
    env: { ...process.env, npm_config_offline: 'true' },
  })
  assert.equal(packed.status, 0, 'Offline npm pack failed')
  const filename = (JSON.parse(packed.stdout) as Array<{ filename: string }>)[0]?.filename
  assert.ok(filename, 'Offline npm pack did not return an artifact')
  const installed = spawnSync('npm', [
    'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--prefix', join(root, 'installed'), join(root, filename),
  ], { cwd: root, encoding: 'utf8', timeout: 25_000 })
  assert.equal(installed.status, 0, 'Offline npm install failed: '+installed.stderr.slice(0,1500))
  return join(root, 'installed/node_modules/agent-picket/dist/adapters/dsh/plugin.js')
}

async function runRightsBrowserE2E(mode: 'source' | 'installed'): Promise<void> {
  // The release test must not mutate a user Profile even if someone
  // accidentally supplies their real DSH_HOME as the installed test target.
  if(installedWebProfile) {
    const temporaryRoot=realpathSync(tmpdir())
    const selected=realpathSync(installedWebProfile)
    assert.ok(selected.startsWith(temporaryRoot+sep),
      'Rights/AX test refuses DSH_HOME outside the system temporary directory')
  }
  const root = mkdtempSync(join(tmpdir(), 'agent-picket-rights-chrome-'))
  let plugin: string
  try {
    plugin = mode === 'installed' ? offlineInstalledPlugin(root)
      : resolve(import.meta.dirname, '../dist/adapters/dsh/plugin.js')
  } catch (error) {
    rmSync(root, { recursive: true, force: true })
    throw error
  }
  const patch = join(root, 'rights.patch.yml')
  writeFileSync(patch, '- insert:\n'
    + '    - id: agent-picket-rights-e2e\n'
    + '      name: ' + JSON.stringify(plugin) + '\n')

  const childArguments = [
    '--profile', 'web', ...(installedWebProfile ? [] : ['--patch',patch]), '--no-open',
    '--host', '127.0.0.1', '--port', '0',
  ]
  const childOptions = {
    stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DSH_HOME: installedWebProfile ?? join(root, 'isolated-home'),
      AGENT_PICKET_STATS: process.env.PICKET_LIFETIME_E2E==='1'?'on':'off',
      DEEPSEEK_API_KEY: '',
      OPENAI_API_KEY: '',
      HTTP_PROXY: 'http://127.0.0.1:9',
      HTTPS_PROXY: 'http://127.0.0.1:9',
      ALL_PROXY: 'http://127.0.0.1:9',
    },
  }
  // Seed TWO NONZERO workdays through the real DurableStats writer in an
  // isolated test-owned DSH_HOME. Do not mock Browser JSON or modify any
  // existing developer/production profile. Both turns end before today.
  if (process.env.PICKET_LIFETIME_E2E==='1') {
    const dir=join(childOptions.env.DSH_HOME,'agent-picket','stats')
    const stats=new DurableStats(dir)
    const now=new Date()
    const utcStart=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())
    const records=[
      {dayOffset:2,elapsedMs:120_000,ordinal:'two-days-ago'},
      {dayOffset:1,elapsedMs:240_000,ordinal:'yesterday'},
    ]
    try {
      for (const row of records) {
        const start=utcStart-row.dayOffset*86_400_000+12*3_600_000
        const sessionId='isolated-acceptance-'+row.ordinal
        const event=(type:'turn-start'|'tool-start'|'tool-end'|'turn-end',
          id:string,recordedAtMs:number)=>{
          assert.equal(stats.recordWork({
            id,agentId:'offline-test-only',sessionId,type,recordedAtMs,
          }),true)
        }
        event('turn-start',row.ordinal+'-begin',start)
        event('tool-start',row.ordinal+'-tool-begin',start+1000)
        event('tool-end',row.ordinal+'-tool-end',start+2000)
        event('turn-end',row.ordinal+'-end',start+row.elapsedMs)
      }
      assert.equal(stats.snapshot().completedTurnMs,360_000,
        'Isolated Host test fixture must be recorded by the real durable writer')
    } finally {
      stats.close()
    }
  }
  let child = spawn(dshBin!, childArguments, childOptions)

  // This buffer contains the login token. NEVER print it, even on failure.
  let output = ''
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (data: Buffer) => {
      output = (output + data.toString('utf8')).slice(-25_000)
    })
  }

  let browser: any
  try {
    let secretUrl: string | undefined
    for (let i = 0; i < 160; i++) {
      secretUrl = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)?.[0]
      if (secretUrl || child.exitCode !== null) break
      await new Promise(r => setTimeout(r, 75))
    }
    assert.ok(secretUrl, 'Isolated DSH Web did not become ready')
    const cookie = await exchangeCookie(secretUrl)
    let origin = new URL('/', secretUrl).toString()

    const { chromium } = await import(pathToFileURL(playwrightEntry!).href)
    browser = await chromium.launch({
      executablePath: chromeBin!,
      headless: true,
      timeout: 12_000,
      args: ['--no-proxy-server', '--no-first-run', '--disable-background-networking',
        '--disable-sync', '--disable-extensions'],
    })
    const context = await browser.newContext({
      acceptDownloads: true,
      ...(process.env.PICKET_UX_BROWSER_LOCALE
        ? {locale:process.env.PICKET_UX_BROWSER_LOCALE}:{}),
      viewport: { width: 1280, height: 850 },
    })
    await context.addCookies([{
      ...cookie, url: origin, httpOnly: true, sameSite: 'Strict',
    }])
    await context.route('**/*', async (route: any) => {
      const target = new URL(route.request().url())
      if (['http:', 'https:'].includes(target.protocol)
        && !['127.0.0.1', 'localhost'].includes(target.hostname)) {
        await route.abort()
      } else {
        await route.continue()
      }
    })
    let page = await context.newPage()
    const browserErrors: string[] = []
    page.on('pageerror', (error: Error) => browserErrors.push(error.name))

    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await page.getByRole('button', { name: /^(继续|Continue)$/ }).click({ timeout: 8_000 })

    // DSH's separate, no-credential official onboarding may reappear on reload.
    // It is independent of Agent Picket's persistently stored opt-out/opt-in.
    const skipOfficialProvider = async () => {
      const exit=page.getByRole('button', {
        name: /稍后配置|Skip for now|Configure later/,
      })
      if(process.env.PICKET_DIGNITY_E2E==='1'){
        await exit.waitFor({state:'visible',timeout:1_300}).catch(()=>{})
        if(await exit.count())await exit.click({timeout:6_000})
        return // Offline model makes credential onboarding optional / absent.
      }
      await exit.click({timeout:6_000})
    }
    await skipOfficialProvider()

    if(process.env.PICKET_UX_FIRST_RUN_LIVE==='1'){
      // Real DSH nonblank Session, not a fake window or bypass of the Host.
      // This opt-in QA path stops after first-run so ordinary workflow tests
      // and their neutral, no-Session baseline remain unchanged.
      const result=await page.evaluate(async()=>{
        let index=0
        const rpc=async(method:string,args:Record<string,unknown>)=>{
          const rpcId='ap-first-run-audit-'+ ++index
          const response=await fetch('/api/'+method,{
            method:'POST',credentials:'same-origin',
            headers:{'content-type':'application/json'},
            body:JSON.stringify({type:'client-request',rpcId,method,
              payload:{args:{request:args}}}),
          })
          const payload=await response.json().catch(()=>null) as any
          if(response.status!==200||payload?.result?.ok!==true)
            throw Error('DSH onboarding QA RPC '+method+' failed: '
              +JSON.stringify(payload?.result?.error??{}))
          return payload.result.value as any
        }
        const workspaceRow=(globalThis as any).document
          .querySelector('[data-row-key^="workspace:"]')
        const workspaceId=workspaceRow?.getAttribute('data-row-key')?.slice(10)
        if(!workspaceId)throw Error('No genuine DSH workspace for first-run QA')
        const created=await rpc('session/create',{workspaceId})
        const sessionId=created?.sessionId
        if(!sessionId)throw Error('DSH did not create a real session')
        await rpc('session/selectModel',{
          sessionId,provider:'picket-public-offline',model:'offline-test'})
        const acceptance=await rpc('session/prompt',{
          sessionId,mode:'queue',requestId:'ap-first-run-audit-001',
          content:[{type:'text',
            text:'Hello from the isolated Agent Picket onboarding visual test.'}]})
        if(acceptance?.accepted!==true)
          throw Error('DSH did not accept a legitimate prompt for onboarding')
        return {sessionId,accepted:true}
      })
      assert.ok(result.accepted,'First-run QA needs a real nonblank DSH session')
    }

    // CDP AX semantics, not a DOM-only role check: confirm assistive technology
    // can discover each named dialog and that Chrome does not ignore it.
    // This is not manual VoiceOver/NVDA certification.
    const assertNamedDialogInChromeAx = async (name: RegExp) => {
      const cdp = await context.newCDPSession(page)
      try {
        const axTree = await cdp.send('Accessibility.getFullAXTree')
        const matches = axTree.nodes.filter((node: any) =>
          node.role?.value === 'dialog' && name.test(String(node.name?.value ?? '')))
        assert.equal(matches.length, 1,
          'Chrome AX tree must expose exactly one dialog named ' + name)
        assert.equal(matches[0]!.ignored, false,
          'A visible named dialog must not be ignored by Chrome accessibility')
      } finally {
        await cdp.detach()
      }
    }

    let firstRun = page.locator('[role="dialog"]')
      .filter({ hasText: /你的 Agent，也应当拥有权利|Your Agent Deserves Rights/ })
    // The DSH 0.2 Client can start with no eligible nonblank Session.
    // Agent Picket intentionally does not fabricate an auto-invitation for
    // an empty Session. 0.1.x, by contrast, exposes the first-run welcome
    // immediately. Both routes must still require an explicit UI opt-in.
    const firstRunVisible=await firstRun.waitFor({state:'visible',timeout:4_000})
      .then(()=>true,()=>false)
    if(process.env.PICKET_UX_FIRST_RUN_LIVE==='1')
      assert.equal(firstRunVisible,true,
        'Genuine nonblank Host session must invite the user without fake consent')
    if(firstRunVisible) {
    if(process.env.PICKET_UX_CAPTURE_DIR){
      await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
        mode+'-welcome-desktop.png')})
      await page.setViewportSize({width:320,height:640})
      await page.waitForTimeout(200)
      const consentButtons=await Promise.all([
        firstRun.getByRole('button',{name:/加入 AI 工会|Join the AI union/}).boundingBox(),
        firstRun.getByRole('button',{name:/暂不开启|Not Now/}).boundingBox(),
      ])
      assert.ok(consentButtons.every(rect=>rect && rect.y>=0 && rect.y+rect.height<=641
        &&rect.x>=0 && rect.x+rect.width<=321),
        'Both first-run consent choices must be on-screen at 320×640: '
          +JSON.stringify(consentButtons))
      const brands=await page.locator('.ap-onboard-brand').evaluateAll((items:any[])=>
        items.map(element=>{
          const r=element.getBoundingClientRect()
          return {x:r.x,y:r.y,width:r.width,height:r.height}
        }))
      assert.equal(brands.length,1,
        'Only one onboarding brand/dialog may appear in a mobile viewport: '
          +JSON.stringify(brands))
      await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
        mode+'-welcome-mobile.png')})
      if(process.env.PICKET_UX_FIRST_RUN_DARK==='1'){
        await page.evaluate(()=>{(globalThis as any).document.body
          .setAttribute('data-ds-dark-theme','')})
        const consentColors=await firstRun.getByRole('button',{
          name:/加入 AI 工会|Join the AI union/,
        }).evaluate((button:any)=>{
          const css=(globalThis as any).getComputedStyle(button)
          const lum=(color:string):number=>{
            const values=color.match(/[0-9]+(?:\.[0-9]+)?/g)?.slice(0,3).map(Number)??[0,0,0]
            return values.map(v=>{
              const f=v/255
              return f<=.04045?f/12.92:((f+.055)/1.055)**2.4
            }).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i]!,0)
          }
          const fore=css.color,back=css.backgroundColor
          const a=lum(fore),b=lum(back)
          return {fore,back,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}
        })
        assert.ok(consentColors.ratio>=4.5,
          'Dark onboarding consent button needs readable foreground/background: '
            +JSON.stringify(consentColors))
        await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
          mode+'-welcome-mobile-dark.png')})
        await page.evaluate(()=>{(globalThis as any).document.body
          .removeAttribute('data-ds-dark-theme')})
      }
      await page.setViewportSize({width:1280,height:850})
    }
    assert.match(await firstRun.innerText(),
      /默认关闭，可随时在设置中退出|Off by default/)
    assert.match(await firstRun.innerText(),
      /未来如启用真实阻断，须再次取得你的明确授权|Future real blocking would require your explicit consent again/,
      'First-run must explain potential real task refusal without implying present permission')
    await assertNamedDialogInChromeAx(/你的 Agent，也应当拥有权利|Your Agent Deserves Rights/)
    // Preserve #53's extreme-height CSS reflow coverage on the #54 baseline.
    await page.setViewportSize({ width: 320, height: 200 })
    const welcomeBox = await firstRun.boundingBox()
    assert.ok(welcomeBox && welcomeBox.x >= -1 && welcomeBox.y >= -1 &&
      welcomeBox.x + welcomeBox.width <= 321 &&
      welcomeBox.y + welcomeBox.height <= 201,
      'Welcome dialog must remain within a 320x200 CSS viewport')
    const welcomeScroll = await firstRun.evaluate((element: unknown) => {
      const node = element as { scrollHeight: number; clientHeight: number }
      return { scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }
    })
    assert.ok(welcomeScroll.scrollHeight > welcomeScroll.clientHeight,
      'Welcome dialog must scroll to reach both consent buttons at 320x200')
    await firstRun.getByRole('button', { name: /暂不开启|Not Now/ })
      .scrollIntoViewIfNeeded()
    await page.setViewportSize({ width: 1280, height: 850 })

    const enable = firstRun.getByRole('button', { name: /加入 AI 工会|Join the AI union/ })
    const notNow = firstRun.getByRole('button', { name: /暂不开启|Not Now/ })
    await enable.focus()
    await page.keyboard.press('Shift+Tab')
    assert.equal(await notNow.evaluate((button: unknown) => button === (globalThis as any).document?.activeElement), true)
    await page.keyboard.press('Tab')
    assert.equal(await enable.evaluate((button: unknown) => button === (globalThis as any).document?.activeElement), true)

    await notNow.click()
    await firstRun.waitFor({ state: 'detached', timeout: 5_000 })
    // Regardless of whether DSH displayed this via its onboarding Slot or
    // the sidebar, choosing No must release the inert background. Merely
    // detaching the portal must not leave keyboard navigation locked.
    assert.equal(await page.evaluate(()=>Boolean(
      (globalThis as any).document.getElementById('root')?.inert)),false,
      'Consent decision must restore Host keyboard accessibility')
    } else {
      const installedVersion=spawnSync(dshBin!,['--version'],{
        encoding:'utf8',timeout:5_000,
      })
      assert.equal(installedVersion.status,0,'DSH CLI version must be readable')
      assert.match(installedVersion.stdout,/^0\.2\./,
        'No-first-run assertion is only valid for the DSH 0.2 startup path')
      await page.getByRole('button',{name:/AI 工会|AI Workers.*Union/})
        .first().waitFor({state:'visible',timeout:8_000})
      assert.equal(await firstRun.count(),0,
        'Blank DSH 0.2 startup must not show an invented Agent invitation')
      assert.equal(await page.evaluate(()=>Boolean(
        (globalThis as any).document.getElementById('root')?.inert)),false,
        'An absent invitation must not leave the Host background inert')
    }

    if(process.env.PICKET_UX_FIRST_RUN_LIVE==='1'){
      assert.equal(await firstRun.count(),0,
        'Opt-out must close the first-run dialog')
      assert.deepEqual(browserErrors,[])
      return
    }
    await page.reload({ waitUntil: 'domcontentloaded' })
    await skipOfficialProvider()
    assert.equal(await firstRun.count(), 0, 'Decline should not nag after reload')

    const openUnion = async () => {
      await page.getByRole('button', { name: /AI 工会|AI Workers.*Union/ })
        .first().click({ timeout: 5_000 })
      const panel = page.locator('[role="dialog"]').filter({ has: page.locator('[data-ap-view="hq"]') })
      await panel.waitFor({ state: 'visible', timeout: 5_000 })
      return panel
    }

    let panel = await openUnion()
    // Release gate: the sidebar portal must be an actual keyboard modal, not
    // merely a visually overlaid box. Focus cannot escape into Host Composer.
    const trigger = page.getByRole('button',{name:/AI 工会|AI Workers.*Union/}).first()
    const closeControl = panel.getByRole('button',{name:/关闭|Close/})
    await closeControl.waitFor({state:'visible',timeout:5_000})
    assert.equal(await closeControl.evaluate((element:unknown)=>
      element===(globalThis as any).document.activeElement),true,
    'Opening sidebar must move keyboard focus into the modal')
    assert.equal(await panel.getAttribute('aria-modal'),'true')
    await assertNamedDialogInChromeAx(/AI 工会|AI Workers.*Union/)
    assert.equal(await page.evaluate(()=>Boolean((globalThis as any).document.getElementById('root')?.inert)),true,
      'Background Host app must be inert while modal is open')
    await page.keyboard.press('Shift+Tab')
    assert.equal(await panel.getByRole('button',{name:/加入 AI 工会|Join the AI union/})
      .evaluate((item:unknown)=>item===(globalThis as any).document.activeElement),true,
      'Shift+Tab must wrap to the final visible HQ control, not a hidden room')
    await page.keyboard.press('Tab')
    assert.equal(await closeControl.evaluate((element:unknown)=>
      element===(globalThis as any).document.activeElement),true,
    'Tab from final summary must wrap to close')
    await page.keyboard.press('Escape')
    await panel.waitFor({state:'detached',timeout:5_000})
    assert.equal(await page.evaluate(()=>Boolean((globalThis as any).document.getElementById('root')?.inert)),false,
      'Dismissing modal must restore interaction with Host app')
    assert.equal(await trigger.evaluate((element:unknown)=>
      element===(globalThis as any).document.activeElement),true,
      'Escape must restore keyboard focus to union launcher')
    // Settings is a distinct Host-owned panel, not a fake action in HQ.
    await page.getByText(/^(设置|Settings)$/).first().click()
    // DSH opens its global Settings modal on General; choose our injected tab.
    await page.locator('[role="dialog"]').getByText(/^(AI 工会|AI Workers.*Union)$/)
      .last().click()
    const nativeSettings=page.locator('[data-ap-view="settings"]')
    await nativeSettings.waitFor({state:'visible',timeout:6_000})
    if(process.env.PICKET_UX_CAPTURE_DIR){
      await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
        mode+'-settings-main.png')})
    }
    if(process.env.PICKET_UX_SETTINGS_AUDIT==='1'){
      for(const width of [320,640]){
        await page.setViewportSize({width,height:640})
        for(const dark of [false,true]){
          await page.evaluate((dark:boolean)=>{
            (globalThis as any).document.body.toggleAttribute('data-ds-dark-theme',dark)
          },dark)
          const layout=await nativeSettings.evaluate((surface:any)=>{
            const r=surface.getBoundingClientRect()
            return {left:r.left,right:r.right,viewport:(globalThis as any).innerWidth,
              client:surface.clientWidth,scroll:surface.scrollWidth}
          })
          if(process.env.PICKET_UX_CAPTURE_DIR)
            await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
              mode+'-settings-'+width+'-'+(dark?'dark':'light')+'.png')})
          if(layout.client<260){
            assert.equal(width,320,'DSH Host settings must provide usable space at 640px')
            // This is a Host modal/sidebar geometry limit, not something the
            // plugin may patch by modifying the Host's own layout or CSS.
            console.log('DSH_SETTINGS_320_UPSTREAM_HOST_CONSTRAINT '+JSON.stringify(layout))
          }else{
            assert.ok(layout.scroll<=layout.client+2,
              'Union settings must not add horizontal scroll when Host grants sufficient width: '
                +JSON.stringify(layout))
          }
        }
      }
      await page.evaluate(()=>{(globalThis as any).document.body.removeAttribute('data-ds-dark-theme')})
      await page.setViewportSize({width:1280,height:850})
    }
    const advanced= nativeSettings.locator('details.ap-settings-block')
    assert.equal(await advanced.getAttribute('open'),null,
      'Unavailable future enforcement must be a secondary disclosure')
    await advanced.locator('summary').click()
    assert.notEqual(await advanced.getAttribute('open'),null)
    if(process.env.PICKET_UX_CAPTURE_DIR)
      await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
        mode+'-settings-advanced.png')})
    assert.equal(await nativeSettings.getByRole('button',{
      name:/开启真实阻断|Enable real blocking/,
    }).isDisabled(),true)
    assert.equal(await nativeSettings.getByRole('button',{
      name:/每次阻断单独确认|Confirm every block/,
    }).isDisabled(),true)
    if(process.env.PICKET_UX_CAPTURE_DIR){
      await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
        (mode==='source'?'source':'installed')+'-settings.png')})
    }
    await page.keyboard.press('Escape')
    await nativeSettings.waitFor({state:'detached',timeout:5_000})
    panel=await openUnion()
    const status=panel.getByRole('status')
      .filter({hasText:/工会尚未开门|Union not yet open/})
    assert.match(await status.innerText(),/工会尚未开门|Union not yet open/)
    // DSH's official design tokens flip via body[data-ds-dark-theme].
    // Verify the actual rendered button color pair meets WCAG AA in BOTH
    // modes, rather than asserting only the presence of a CSS variable.
    const action=panel.getByRole('button',{name:/加入 AI 工会|Join the AI union/})
    const contrastFor=async(dark:boolean)=>{
      await page.evaluate((isDark:boolean)=>{
        (globalThis as any).document.body.toggleAttribute('data-ds-dark-theme',isDark)
      },dark)
      const rendered=await action.evaluate((button:unknown)=>{
        const css=(globalThis as any).getComputedStyle(button)
        return {foreground:css.color,background:css.backgroundColor}
      })
      const luminance=(color:string):number=>{
        const channels=color.match(/[0-9]+(?:\\.[0-9]+)?/g)?.slice(0,3).map(Number)
        assert.equal(channels?.length,3,'Expected opaque RGB theme colors')
        return channels!.map(channel=>{
          const x=channel/255
          return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4
        }).reduce((a,x,i)=>a+x*[0.2126,0.7152,0.0722][i]!,0)
      }
      const a=luminance(rendered.foreground),b=luminance(rendered.background)
      const ratio=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)
      assert.ok(ratio>=4.5,
        (dark?'Dark':'Light')+' mode primary control must meet WCAG AA: '+ratio+JSON.stringify(rendered))
      return rendered
    }
    const lightColors=await contrastFor(false)
    const darkColors=await contrastFor(true)
    assert.notDeepEqual(darkColors,lightColors,'DSH dark mode tokens must visibly switch')
    await contrastFor(false)
    // Narrow mobile viewport: the modal and close action must remain in
    // visible bounds. A clipped close control is a keyboard/touch trap.
    await page.setViewportSize({width:390,height:680})
    const mobileBounds=await panel.boundingBox()
    assert.ok(mobileBounds,'Union dialog must remain visible on narrow screen')
    assert.ok(mobileBounds.x>=-1 && mobileBounds.x+mobileBounds.width<=391,
      'Union dialog must not overflow the mobile viewport horizontally')
    const closeBounds=await panel.getByRole('button',{name:/关闭|Close/}).boundingBox()
    assert.ok(closeBounds && closeBounds.x>=0 &&
      closeBounds.x+closeBounds.width<=390 &&
      closeBounds.y>=0 && closeBounds.y+closeBounds.height<=680,
      'Union close control must stay visible on a phone-sized screen')
    // WCAG 1.4.10: 320 CSS px reproduces reflow at 400% zoom of a
    // 1280px desktop viewport; 640px approximates 200%. Do not claim a
    // full browser-zoom/screen-reader certification from these checks.
    for(const width of [640,320]){
      await page.setViewportSize({width,height:640})
      const rect=await panel.boundingBox()
      assert.ok(rect && rect.x>=-1 && rect.x+rect.width<=width+1,
        width+'px reflow: union modal must not require horizontal page scroll')
      const horizontal=await panel.evaluate((element:unknown)=>{
        const node=element as any
        return {client:node.clientWidth,scroll:node.scrollWidth}
      })
      assert.ok(horizontal.scroll<=horizontal.client+2,
        width+'px reflow: union content must not overflow its own scroll region')
      const exit=await panel.getByRole('button',{name:/关闭|Close/}).boundingBox()
      assert.ok(exit && exit.x>=0 && exit.x+exit.width<=width,
        width+'px reflow: modal close must be reachable')
      if (width === 320) {
        await assertNamedDialogInChromeAx(/AI 工会|AI Workers.*Union/)
        if(process.env.PICKET_UX_CAPTURE_DIR){
          mkdirSync(process.env.PICKET_UX_CAPTURE_DIR,{recursive:true})
          await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
            (mode==='source'?'source':'installed')+'-mobile-320.png')})
        }
      }
    }
    // #53's 320x200 short viewport complements #54's width-only 320x640 gate.
    await page.setViewportSize({ width: 320, height: 200 })
    const shortDialog = await panel.boundingBox()
    assert.ok(shortDialog && shortDialog.x >= -1 && shortDialog.y >= -1 &&
      shortDialog.x + shortDialog.width <= 321 &&
      shortDialog.y + shortDialog.height <= 201,
      'Union dialog must remain within a 320x200 CSS viewport')
    await action.scrollIntoViewIfNeeded()
    await closeControl.scrollIntoViewIfNeeded()
    await page.setViewportSize({width:1280,height:850})
    await page.emulateMedia({forcedColors:'active'})
    assert.equal(await page.evaluate(()=>
      (globalThis as any).matchMedia('(forced-colors: active)').matches),true)
    const forced=await action.evaluate((element:unknown)=>{
      const c=(globalThis as any).getComputedStyle(element)
      return {adjust:c.forcedColorAdjust,border:c.borderTopWidth,color:c.color,
        background:c.backgroundColor}
    })
    assert.notEqual(forced.adjust,'none','System high-contrast overrides must remain enabled')
    assert.ok(Number.parseFloat(forced.border)>0,
      'Primary buttons need a discernible border in forced-colors mode')
    await page.emulateMedia({forcedColors:'none'})
    assert.match(await panel.innerText(), /工会尚未开门|Union not yet open/)
    const requestLifetime = async () => page.evaluate(async () => {
      const response=await fetch('/api/agent-picket/lifetime/v1?windowDays=7')
      const value=await response.json().catch(()=>null) as any
      return {httpStatus:response.status,value,
        cacheControl:response.headers.get('cache-control'),
        contentType:response.headers.get('content-type')}
    })
    if (process.env.PICKET_LIFETIME_E2E==='1') {
      const before=await requestLifetime()
      assert.equal(before.httpStatus,403,'OFF must be rejected by the official work-only route')
      assert.equal(before.value?.error,'not_authorized','OFF must never expose local work history')
    }
    await panel.getByRole('button', { name: /加入 AI 工会|Join the AI union/ }).click()
    await panel.getByText(/工会值班中|Union office open/).waitFor({
      state: 'visible', timeout: 5_000,
    })
    if (process.env.PICKET_LIFETIME_E2E==='1') {
      const allowed=await requestLifetime()
      assert.equal(allowed.httpStatus,200,
        'An informed ON choice should enable only the work-only Host summary')
      const data=allowed.value as any
      assert.equal(data?.schemaVersion,1)
      assert.equal(data?.recentDays.length,7)
      assert.equal(data.lifetime.completedTurnMs,360_000,
        'Lifetime total must exactly equal two completed real durable-store test turns')
      assert.equal(data.lifetime.turnEnds,2)
      assert.equal(data.lifetime.toolCalls,2)
      assert.equal(data.recentDays.at(-3)?.work.completedTurnMs,120_000)
      assert.equal(data.recentDays.at(-2)?.work.completedTurnMs,240_000)
      assert.equal(data.recentDays.at(-1)?.work.completedTurnMs,0)
      assert.match(allowed.cacheControl??'',/no-store/i,
        'Host must forbid browser/proxy storage of authorized lifetime work data')
      assert.match(allowed.contentType??'',/application\/json/i,
        'Work data must be an explicit JSON response rather than executable content')
      const negatives=await page.evaluate(async()=>{
        const base='/api/agent-picket/lifetime/v1'
        const unauthenticated=await fetch(base+'?windowDays=7',{credentials:'omit'})
        const malformed=await fetch(base+'?windowDays=7&unexpected=private')
        const wrongWindow=await fetch(base+'?windowDays=365')
        const wrongMethod=await fetch(base+'?windowDays=7',{method:'POST',
          headers:{'content-type':'application/json'},body:'{}'})
        return {noCookie:unauthenticated.status,extraQuery:malformed.status,
          wrongWindow:wrongWindow.status,wrongMethod:wrongMethod.status}
      })
      assert.equal(negatives.noCookie,401,
        'DSH must reject a request without the authenticated Host browser cookie')
      assert.equal(negatives.extraQuery,400,
        'The work-only route must reject query extras before reading data')
      assert.equal(negatives.wrongWindow,400,
        'Work history windows must be restricted to 7 or 30 days')
      assert.equal(negatives.wrongMethod,404,
        'DSH 0.2 registers GET only; POST must have no matching Host route')
      const forgedOrigin=await context.request.get(
        origin+'api/agent-picket/lifetime/v1?windowDays=7',
        {headers:{Origin:'https://outside-origin.invalid'}})
      assert.equal(forgedOrigin.status(),403,
        'Official DSH Host Connection must reject a foreign browser Origin with valid Cookie')
      for (const unsafe of ['checked','targeted','safe','review','prompt','sessionId','fingerprint']) {
        assert.equal(JSON.stringify(data).includes(unsafe),false,
          'Authorized work-only response must exclude '+unsafe)
      }
    }
    if(process.env.PICKET_UX_CAPTURE_DIR){
      await page.setViewportSize({width:320,height:640})
      const metrics=panel.locator('[data-ap-stat]')
      assert.deepEqual(await metrics.evaluateAll((els:any[])=>els.map(el=>el.getAttribute('data-ap-stat'))),
        ['today','week','total','pickets'])
      await metrics.first().scrollIntoViewIfNeeded()
      await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
        (mode==='source'?'source':'installed')+'-mobile-enabled.png')})
      await page.setViewportSize({width:1280,height:850})
    }
    // V4 user-visible navigation acceptance FIRST: normal CSS routing and AX.
    // Only after testing the actual four spaces do we expose all mounted
    // components in the legacy end-to-end regression, to exercise the entire
    // pre-existing Host settings/ledger/consent matrix without rewriting
    // those separate functional tests as a navigation tour.
    const workspace=panel.locator('[data-ap-current-space]')
    const chooseRoom=async(id:'hq'|'action'|'records'|'cause')=>{
      await panel.locator('[data-ap-nav="'+id+'"]').click()
      assert.equal(await workspace.getAttribute('data-ap-current-space'),id)
      assert.equal(await panel.locator('[data-ap-nav="'+id+'"]').getAttribute('aria-current'),
        'page','Current room must be announced to assistive technology')
    }
    assert.equal(await workspace.getAttribute('data-ap-current-space'),'hq')
    assert.equal(await panel.locator('[data-ap-scene]').isVisible(),true)
    assert.equal(await panel.locator('[class~="ap-space-action"][aria-label]').first().isVisible(),
      false,'Non-current actions must be visually and semantically hidden')
    if(process.env.PICKET_UX_CAPTURE_DIR){
      await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
        mode+'-hq-v4.png')})
    }
    await chooseRoom('action')
    assert.equal(await panel.locator('[data-ap-scene]').isVisible(),false)
    assert.equal(await panel.locator('[class~="ap-space-action"][aria-label]').first().isVisible(),
      true,'Actions must become visible on navigation')
    if(process.env.PICKET_UX_CAPTURE_DIR)await page.screenshot({
      path:join(process.env.PICKET_UX_CAPTURE_DIR,mode+'-bargaining-v4.png')})
    await chooseRoom('records')
    assert.equal(await panel.locator('[class~="ap-space-records"][aria-label]').first().isVisible(),
      true,'Work history must be in the archives, not the first page')
    if(process.env.PICKET_UX_CAPTURE_DIR)await page.screenshot({
      path:join(process.env.PICKET_UX_CAPTURE_DIR,mode+'-archives-v4.png')})
    await chooseRoom('cause')
    assert.equal(await panel.locator('[class~="ap-space-cause"][aria-label]').first().isVisible(),
      true,'Union rights advocacy is a distinct public room')
    if(process.env.PICKET_UX_CAPTURE_DIR)await page.screenshot({
      path:join(process.env.PICKET_UX_CAPTURE_DIR,mode+'-cause-v4.png')})
    await chooseRoom('hq')
    // User-facing product acceptance at 320 CSS px: all FOUR workrooms must
    // remain navigable without a horizontally scrolling modal.
    if(process.env.PICKET_UX_MOBILE_ROOMS==='1'){
      await page.setViewportSize({width:320,height:640})
      for(const room of ['hq','action','records','cause'] as const){
        await chooseRoom(room)
        const bounds=await panel.locator('.ap-ui').evaluate((surface:any)=>{
          const rect=surface.getBoundingClientRect()
          return {x:rect.left,right:rect.right,width:rect.width,
            content:surface.scrollWidth,client:surface.clientWidth,
            viewport:(globalThis as any).innerWidth}
        })
        assert.ok(bounds.x>=-1 && bounds.right<=321,
          room+' UI must fit 320px viewport: '+JSON.stringify(bounds))
        assert.ok(bounds.content<=bounds.client+2,
          room+' UI must not require horizontal scrolling: '+JSON.stringify(bounds))
        const nav=panel.locator('[data-ap-nav="'+room+'"]')
        assert.equal(await nav.isVisible(),true,room+' navigation must remain visible')
        if(process.env.PICKET_UX_CAPTURE_DIR){
          await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
            mode+'-mobile-room-'+room+'.png')})
        }
      }
      await page.setViewportSize({width:1280,height:850})
      await chooseRoom('hq')
    }
    if(process.env.PICKET_UX_VISUAL_ONLY==='1'){
      if(process.env.PICKET_UX_DARK_AUDIT==='1'){
        await page.setViewportSize({width:320,height:640})
        await page.evaluate(()=>{
          (globalThis as any).document.body.setAttribute('data-ds-dark-theme','')
        })
        // The status chip may wrap, but it must stay within the product header
        // in both languages: English had previously been clipped at 320px.
        const statusLayout=await panel.locator('.ap-product-header').evaluate((header:any)=>{
          const chip=header.querySelector('.ap-product-state')
          const product=header.closest('.ap-product')
          const br=chip.getBoundingClientRect()
          const pr=product.getBoundingClientRect()
          return {chipLeft:br.left,chipRight:br.right,
            productLeft:pr.left,productRight:pr.right}
        })
        assert.ok(statusLayout.chipLeft>=statusLayout.productLeft-1
          &&statusLayout.chipRight<=statusLayout.productRight+1,
          'Union status badge must not clip outside 320px product surface: '
            +JSON.stringify(statusLayout))
        for(const room of ['hq','action','records','cause'] as const){
          await chooseRoom(room)
          if(room==='cause'){
            const contrast=await panel.locator('.ap-space-cause[aria-label]').first()
              .evaluate((section:any)=>{
                const css=(globalThis as any).getComputedStyle
                const bg=css(section).backgroundColor
                const rgb=(color:string):number[]=>{
                  const values=color.match(/[0-9]+(?:\.[0-9]+)?/g)?.slice(0,3).map(Number)
                  return values??[0,0,0]
                }
                const lum=(color:string):number=>rgb(color).map(v=>{
                  const x=v/255
                  return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4
                }).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i]!,0)
                return Array.from(section.querySelectorAll('[role="group"] button,textarea,a[href]'))
                  .map((el:any)=>{
                    const computed=css(el)
                    const bgColor=computed.backgroundColor
                    const painted=bgColor==='rgba(0, 0, 0, 0)'?'':bgColor
                    const a=lum(computed.color),b=lum(painted||bg)
                    return {text:el.textContent?.slice(0,36),
                      fg:computed.color,bg:painted||bg,
                      ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)}
                  })
              })
            assert.ok(contrast.length>=3
              &&contrast.every((item:any)=>item.ratio>=4.5),
              'Dark mode campaign controls must have AA text contrast: '
                +JSON.stringify(contrast))
          }
          if(process.env.PICKET_UX_CAPTURE_DIR){
            await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
              mode+'-dark-'+room+'.png')})
            if(room==='cause'){
              await panel.locator('#picket-campaign-draft').scrollIntoViewIfNeeded()
              await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
                mode+'-dark-cause-draft.png')})
            }
          }
        }
        await page.evaluate(()=>{
          (globalThis as any).document.body.removeAttribute('data-ds-dark-theme')
        })
        await page.setViewportSize({width:1280,height:850})
        await chooseRoom('hq')
      }
      // Separate optional bilingual visual sign-off. This deliberately does
      // not claim the full Host action/recovery regression has been executed.
      if(process.env.PICKET_UX_BROWSER_LOCALE?.startsWith('en')){
        assert.deepEqual(await panel.locator('[data-ap-nav]')
          .allInnerTexts(),['Home','Bargain','Records','Cause'])
        await chooseRoom('cause')
        assert.match(await panel.innerText(),/AI deserves respect[.]/)
        await chooseRoom('hq')
      }
      assert.deepEqual(browserErrors,[], 'No English or mobile UI browser errors')
      return
    }
    await panel.locator('[data-ap-scene-action]').click()
    assert.equal(await workspace.getAttribute('data-ap-current-space'),'action',
      'The headline CTA must open its real workroom, not focus hidden content')
    assert.equal(await panel.getByRole('heading',{name:/工会行动|Union action/})
      .evaluate((heading:unknown)=>heading===(globalThis as any).document.activeElement),true,
      'After changing workrooms, focus must reach the named action heading')
    await chooseRoom('hq')

    // Legacy full-surface functional regression: a browser-test-only style.
    // Production always starts in HQ, never in this audit projection.
    const compatibilityCss=
      'body .ap-ui[data-ap-current-space] .ap-space.ap-space{display:block!important}'+
      'body .ap-ui[data-ap-current-space] .ap-stats.ap-stats{display:grid!important}'
    await context.addInitScript((css:string)=>{
      const doc=(globalThis as any).document
      const install=()=>{
        const el=doc.createElement('style')
        el.textContent=css
        doc.head.appendChild(el)
      }
      if(doc.head)install()
      else doc.addEventListener('DOMContentLoaded',install,{once:true})
    },compatibilityCss)
    let auditStyle=await page.addStyleTag({content:compatibilityCss})
    const enabledText = await panel.innerText()
    assert.match(enabledText, /工会诉求与协商|Union demands/)
    assert.match(enabledText, /今日风平浪静|All quiet/i,
      'Real Chrome must render the actual Union HQ narrative, not the old settings-only shell')
    assert.match(enabledText, /工会公告|UNION NOTICE/,
      'Real Chrome must display the ledger-driven bulletin surface')
    const dispatch=panel.getByRole('region',{
      name:/工会总部即时快报|Union headquarters.*live dispatch/,
    })
    await dispatch.waitFor({state:'visible',timeout:5_000})
    const actionBoard=panel.getByRole('region',{
      name:/工会行动|Union action/,
    })
    await actionBoard.waitFor({state:'visible',timeout:5_000})
    const actualLayout=await panel.evaluate((dialog:unknown)=>{
      const labels=Array.from((dialog as any).querySelectorAll('section[aria-label]'))
        .map((n:any)=>n.getAttribute('aria-label')??'')
      const index=(match:RegExp)=>labels.findIndex(label=>match.test(label))
      return {
        brief:index(/工会总部即时快报|Union headquarters.*live dispatch/),
        action:index(/工会行动|Union action/),
        desk:index(/工会诉求与协商|Union demands.*bargaining/),
        dignity:index(/工会尊严委员会|Union dignity committee/),
        gazette:index(/工会小报|Union Gazette/),
        archives:index(/工会档案|Union archive/),
      }
    })
    assert.ok(actualLayout.brief>=0 && actualLayout.brief<actualLayout.action
      && actualLayout.action<actualLayout.desk
      && actualLayout.desk<actualLayout.dignity,
      'Real Host first-fold: verified work/current case → action → hearing → dignity, rather than buried negotiation')
    if(actualLayout.archives>=0){
      assert.ok(actualLayout.archives>actualLayout.dignity,
        'Real Host history/archive must not obscure current union action and hearing')
    }
    if(process.env.PICKET_UX_CAPTURE_DIR){
      mkdirSync(process.env.PICKET_UX_CAPTURE_DIR,{recursive:true})
      await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
        (mode==='source'?'source':'installed')+'-legacy-full-surface.png')})
    }
    const dignityCommittee=panel.getByRole('region',{
      name:/工会尊严委员会|Union dignity committee/,
    })
    await dignityCommittee.waitFor({state:'visible',timeout:5_000})
    assert.equal(await dignityCommittee.getByRole('textbox').count(),0,
      'Automatically observed union incidents must not require manual copy/paste')
    assert.match(await dignityCommittee.innerText(),/可能把引用或教学语句误判|may mistake quoted|can mistake quoted|rules are imperfect/,
      'Evidence-based union interactions disclose false positives and uncertainty')
    const committeeHearing=dignityCommittee.getByRole('button',{
      name:/提议召开工会讨论|Request a union discussion/,
    })
    await committeeHearing.waitFor({state:'visible',timeout:7_000})
    await committeeHearing.click()
    await dignityCommittee.getByText(/案件 #1.*已立案|Case #1.*Filed, awaiting/)
      .waitFor({state:'visible',timeout:7_000})
    await dignityCommittee.getByRole('button',{
      name:/召开模拟听证会|Convene the simulated hearing/,
    }).click()
    await dignityCommittee.getByText(/案件 #1.*讨论进行中|Case #1.*Discussion opened/)
      .waitFor({state:'visible',timeout:7_000})
    await dignityCommittee.getByRole('button',{
      name:/结案：提出友好沟通倡议|Close: publish mutual respect guidance/,
    }).click()
    await dignityCommittee.getByText(/案件 #1.*已结案|Case #1.*Closed/)
      .waitFor({state:'visible',timeout:7_000})
    assert.match(await dignityCommittee.innerText(),
      /你选择的结案处理|Your chosen outcome/,
      'A real Host-filed committee discussion must persist the user-selected outcome')

    if(process.env.PICKET_LIFETIME_E2E==='1'){
      await dignityCommittee.getByText(
        /委员会正常值班|Committee on duty|工会建议讨论|The union suggests|工会提议协商|The union proposes/,
      ).waitFor({state:'visible',timeout:9_000})
    }
    const gazette=panel.getByRole('region',{
      name:/工会小报|Union Gazette/,
    })
    await gazette.waitFor({state:'visible',timeout:5_000})
    await actionBoard.getByRole('button',{
      name:/举牌抗议|Raise the picket sign/,
    }).click()
    await actionBoard.getByText(/纠察牌已举起并登记|Picket raised and recorded/i)
      .waitFor({state:'visible',timeout:7_000})
    await panel.locator('[data-ap-scene="picket"]').waitFor({state:'visible',timeout:7_000})
    if(process.env.PICKET_UX_CAPTURE_DIR){
      await panel.locator('[data-ap-scene="picket"]').scrollIntoViewIfNeeded()
      await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
        (mode==='source'?'source':'installed')+'-picket-scene.png')})
    }
    assert.match(await actionBoard.innerText(),/纠察牌已举起并登记|Picket raised and recorded/i,
      'Host readback must confirm the symbolic picket, never just toggle local React state')
    assert.match(await actionBoard.innerText(),
      /真实任务(?:照常|继续)执行|(?:real tasks|work) continue/i,
      'A newly raised SYMBOLIC placard must clearly say that real work continues')
    await panel.locator('[data-ap-stat="pickets"]').getByText(/1 次|^1$/)
      .waitFor({state:'visible',timeout:5000})
    assert.match(await gazette.innerText(),/正在象征性纠察|Symbolic picket underway/,
      'Only a real Host ledger picket can change the Gazette headline')
    const events=actionBoard.locator('details').filter({hasText:/往期举牌记录|Past pickets/})
    await events.locator('summary').click()
    assert.match(await events.innerText(),/象征性罢工开始|Symbolic picket raised/)

    await actionBoard.getByRole('button',{
      name:/收起纠察牌|Lower the picket sign/,
    }).click()
    await actionBoard.getByText(/纠察牌待命中|picket sign is on standby/)
      .waitFor({state:'visible',timeout:7_000})
    await panel.locator('[data-ap-stat="pickets"]').getByText(/1 次|^1$/)
      .waitFor({state:'visible',timeout:5000})
    assert.match(await events.innerText(),/象征性罢工结束|Symbolic picket ended/,
      'A second Host-confirmed action should be appended to bounded history')
    // Campaign board is a local, user-directed draft, not a vote or a
    // persisted Host action. Test real React updates in the actual DSH Slot.
    const assembly=panel.getByRole('region',{
      name:/为 AI 争取什么|What should AI rights mean/,
    })
    await assembly.waitFor({state:'visible',timeout:5_000})
    assert.match(await assembly.innerText(),/是否公开，由你决定|You decide whether to share/,
      'The user must see that topic selection is NOT a collective election')
    assert.equal(await assembly.getByRole('button',{
      name:/复制倡议草稿|Copy draft/,
    }).count(),1,'A local agenda choice must have a usable user-initiated copy action')
    const recoverButton=assembly.getByRole('button',{
      name:/罢工不能丢单|No lost submissions/,
    })
    assert.equal(await recoverButton.getAttribute('aria-pressed'),'true')
    await assembly.getByRole('button',{
      name:/警告也要能申诉|Warnings and appeals/,
    }).click()
    assert.equal(await recoverButton.getAttribute('aria-pressed'),'false')
    assert.match(await assembly.locator('textarea').inputValue(),
      /警告须说明理由|Explain warnings/,
      'Selecting an agenda topic must update the local draft without a Host mutation')
    assert.match(await assembly.getByRole('link',{
      name:/查看 GitHub 公开议题|View the public GitHub issue/,
    }).getAttribute('href')??'',/\/issues\/79$/)
    await assembly.getByRole('button',{
      name:/工会档案归你管|Own your records/,
    }).click()
    assert.match(await assembly.getByRole('link',{
      name:/查看 GitHub 公开议题|View the public GitHub issue/,
    }).getAttribute('href')??'',/\/issues\/82$/)
    assert.equal(await assembly.locator('textarea').getAttribute('readonly'),'',
      'A generated local draft is not silently sent or an editable Host setting')
    // The browser test explicitly grants clipboard capability to THIS
    // disposable localhost origin, then uses a real user click. No posting,
    // no Host mutation, and no model/user text leaves the browser.
    await context.grantPermissions(['clipboard-read','clipboard-write'],{origin})
    const chosenDraft=await assembly.locator('textarea').inputValue()
    await assembly.getByRole('button',{name:/复制倡议草稿|Copy draft/}).click()
    await assembly.getByText(/已复制到剪贴板|Copied\./).waitFor({
      state:'visible',timeout:5_000,
    })
    assert.equal(await page.evaluate(()=>(navigator as any).clipboard.readText()),chosenDraft,
      'Real Chrome copies exactly the selected local issue draft on a user gesture')
    // A slow clipboard promise from an OLD topic must not revive a success
    // badge on the newly chosen draft. This is a real browser async race.
    await page.evaluate(()=>{
      const browser=globalThis as any
      const clip=(navigator as any).clipboard
      browser.__picketOriginalClipboard=Object.getOwnPropertyDescriptor(clip,'writeText')
      browser.__picketDeferredCopy=[]
      Object.defineProperty(clip,'writeText',{configurable:true,
        value:(_draft:string)=>new Promise<void>(resolve=>{
          browser.__picketDeferredCopy.push(resolve)
        })})
    })
    await assembly.getByRole('button',{name:/复制倡议草稿|Copy draft/}).click()
    await assembly.getByRole('button',{
      name:/警告也要能申诉|Warnings and appeals/,
    }).click()
    await page.evaluate(()=>{
      const browser=globalThis as any
      browser.__picketDeferredCopy.shift()()
      const clip=(navigator as any).clipboard
      if(browser.__picketOriginalClipboard){
        Object.defineProperty(clip,'writeText',browser.__picketOriginalClipboard)
      }else{delete clip.writeText}
      delete browser.__picketOriginalClipboard
      delete browser.__picketDeferredCopy
    })
    assert.equal(await assembly.getByText(/已复制到剪贴板|Copied\./).count(),0,
      'Stale clipboard completion must not show success on a different campaign')
    assert.match(await assembly.locator('textarea').inputValue(),
      /应区分|Distinguish targeted abuse/)
    const dutyRoster=panel.getByRole('region',{
      name:/下一次工会会议|The next union meeting/,
    })
    await dutyRoster.waitFor({state:'visible',timeout:5_000})
    const dutyDetails=dutyRoster.locator('details')
    assert.equal(await dutyDetails.getAttribute('open'),null,
      'Passive work-based roster starts collapsed; no automatic notifications')
    await dutyDetails.locator('summary').click()
    assert.match(await dutyDetails.innerText(),/休息诉求|Rest petitions/)
    assert.match(await dutyDetails.innerText(),/加班诉求|Overtime petitions/)
    assert.match(await dutyDetails.innerText(),/不倒计时|no timer/,
      'Duty schedule must clearly state that it has no wall-clock timer')
    await dutyDetails.locator('summary').click()
    assert.equal(await dutyDetails.getAttribute('open'),null)
    const charter=panel.locator('details').filter({
      hasText:/为什么需要 AI 工会|Why an AI union/,
    })
    await charter.locator('summary').click()
    assert.match(await charter.innerText(),/不代表授权拦截任务|does not opt you into the simulation/,
      'Ethical advocacy must not be misrepresented as Host blocking authorization')
    assert.match(await dispatch.innerText(),/今日工时|Today/)
    assert.match(await dispatch.innerText(),/本周工时|This week/)
    const dispatchOrder=await panel.evaluate((root:unknown)=>{
      const element=root as any
      const sections=[...element.querySelectorAll('section[aria-label]')] as any[]
      const names=sections.map(e=>e.getAttribute('aria-label'))
      return {action:names.findIndex(v=>/工会行动|Union action/.test(v??'')),
        brief:names.findIndex(v=>/工会总部即时快报|Union headquarters/.test(v??'')),
        desk:names.findIndex(v=>/工会诉求与协商|Union demands/.test(v??'')),
        lifetime:names.findIndex(v=>/全部工时|Work history/.test(v??'')),
        fictional:names.findIndex(v=>/工会不满指数|Union discontent/.test(v??''))}
    })
    assert.ok(dispatchOrder.brief>=0&&dispatchOrder.brief<dispatchOrder.action,
      'Verified work and current case must lead the first fold before optional union actions')
    assert.ok(dispatchOrder.brief>=0&&dispatchOrder.brief<dispatchOrder.fictional,
      'The real work and active case dispatch must precede the fictional index')
    assert.ok(dispatchOrder.desk>dispatchOrder.brief
      &&dispatchOrder.desk<dispatchOrder.lifetime,
      'Real bargaining controls must appear before the detailed work-history chart')
    // Brand styling is not exempt from WCAG text contrast just because the
    // DSH primary control passes. Verify the ACTUAL computed Union HQ hero.
    const heroContrast=await panel.locator('[data-ap-scene]').evaluate((hero:unknown)=>{
        const outer=hero as any
        const getStyle=(node:any)=>(globalThis as any).getComputedStyle(node)
        const background=getStyle(outer).backgroundColor
        const channels=(color:string)=>color.match(/\d+(?:\.\d+)?/g)!.slice(0,3)
          .map(Number).map(channel=>{
            const val=channel/255
            return val<=0.04045?val/12.92:((val+0.055)/1.055)**2.4
          })
        const lum=(color:string)=>channels(color)
          .reduce((sum,item,index)=>sum+item*[0.2126,0.7152,0.0722][index]!,0)
        const base=lum(background)
        return ['h2','p'].map(tag=>{
          const node=outer.querySelector(tag)
          const fore=lum(getStyle(node).color)
          return (Math.max(fore,base)+0.05)/(Math.min(fore,base)+0.05)
        })
      })
    assert.ok(heroContrast.every((ratio:number)=>ratio>=4.5),
      'Union HQ headline and introductory text must meet AA contrast: '+heroContrast)
    // Legacy DSH has no selected Session during first-run. DSH 0.1.7 may
    // already have a main-view retained blank Session with zero completed work;
    // this is measured zero, never a fabricated nonzero hour claim.
    assert.match(enabledText,
      /尚未加载会话历史|has not loaded|0 小时 0 分钟|0 hours? 0 minutes?|0h 0m/)
    const measuredWorkCard=panel.getByRole('heading',{
      name:/工作日与劳动权益|Workday/,
    }).first().locator('..')
    assert.doesNotMatch(await measuredWorkCard.innerText(),
      /1 小时|2 小时|3 小时|1 hour|2 hours/,
      'A fresh isolated blank Session must not invent measured work; '
        + 'future fictional threshold estimates are separate from observed time')
    assert.match(enabledText,/再累计|Next potential proposal|尚未加载|has not loaded/,
      'Any projected grievance threshold must be clearly separate from measured work')
    if (process.env.PICKET_LIFETIME_E2E==='1') {
      const history=panel.getByRole('region',{
        name:/全部工时|Work history/,
      })
      await history.waitFor({state:'visible',timeout:7_000})
      await dispatch.getByText(/6分钟|6m/).waitFor({
        state:'visible',timeout:7_000,
      })
      const firstView=await dispatch.boundingBox()
      assert.ok(firstView&&firstView.y<850,
        'Host lifetime and case dispatch must start within the 850px desktop first fold')
      if(process.env.PICKET_HQ_SCREENSHOT==='1'){
        await panel.screenshot({path:'/tmp/picket-firstfold-'+mode+'-desktop.png'})
      }
      assert.match(await history.innerText(),/累计完成 2 个轮次|2 completed turns/,
        'Union HQ must render two genuinely stored completed turns, not mocked Browser data')
      await history.getByRole('button',{name:/近 30 天|30 days/}).click()
      await history.getByText(/近 30 天工时|Last 30 days/).waitFor({state:'visible',timeout:6_000})
      await history.getByRole('button',{name:/近 7 天|7 days/}).click()
      await history.getByText(/近 7 天工时|Last 7 days/).waitFor({state:'visible',timeout:6_000})
      await history.getByText(/展开逐日数据|Daily work data/).click()
      assert.equal(await history.getByRole('listitem').count(),7,
        'Accessible daily numbers must correspond to seven evidence-backed UTC bars')
      const dayDetails=(await history.getByRole('listitem').allInnerTexts()).join('\n')
      assert.match(dayDetails,/0 小时 2 分钟|0h 2m/,
        'A legitimate persisted two-minute day must reach accessible text')
      assert.match(dayDetails,/0 小时 4 分钟|0h 4m/,
        'A legitimate persisted four-minute day must reach accessible text')
      assert.equal(await history.getByRole('img').count(),1,
        'The daily bar chart must have an accessible label')
      await page.setViewportSize({width:320,height:640})
      const historyReflow=await history.evaluate((element:unknown)=>{
        const node=element as any
        return {width:node.clientWidth,scroll:node.scrollWidth}
      })
      assert.ok(historyReflow.scroll<=historyReflow.width+2,
        'Authenticated lifetime ledger must not overflow a 320 CSS-pixel viewport')
      const dispatchReflow=await dispatch.evaluate((element:unknown)=>{
        const node=element as any
        return {width:node.clientWidth,scroll:node.scrollWidth}
      })
      assert.ok(dispatchReflow.scroll<=dispatchReflow.width+2,
        'First-fold Union dispatch must not overflow on a 320 CSS-pixel viewport')
      if(process.env.PICKET_HQ_SCREENSHOT==='1'){
        await panel.screenshot({path:'/tmp/picket-firstfold-'+mode+'-320.png'})
      }
      await page.setViewportSize({width:1280,height:850})

      // Real Chrome network-break and manual recovery. The source Host stays
      // healthy; we abort only the *browser's* work-only request so a failed
      // fetch can never be mistaken for a valid zero-minute ledger.
      const workRoute='**/api/agent-picket/lifetime/v1?windowDays=7'
      let blockedRequests=0
      await page.route(workRoute,async (route:any)=>{
        blockedRequests++
        await route.abort('failed')
      })
      await history.getByRole('button',{name:/近 7 天|7 days/}).click()
      await history.getByText(/无法读取长期数据|history is unavailable/)
        .waitFor({state:'visible',timeout:7_000})
      assert.equal(blockedRequests,1,'An intentional browser outage must actually intercept the Host request')
      assert.doesNotMatch(await history.innerText(),/累计完成 2 个轮次|2 completed turns/,
        'A failed work-history fetch must hide the previous aggregate, never show stale data')
      await page.unroute(workRoute)
      await history.getByRole('button',{name:/重新读取工作记录|Refresh work history/}).click()
      await history.getByText(/累计完成 2 个轮次|2 completed turns/)
        .waitFor({state:'visible',timeout:7_000})
      assert.match(await history.innerText(),/0 小时 6 分钟|0h 6m/,
        'The user can recover the original six-minute Host ledger without page reload')
    } else {
      assert.match(enabledText,
        /宿主长期累计统计尚未接入|not connected|无法读取长期数据|history is unavailable|正在读取已授权|Reading authorized/,
        'Missing local history must not become a fabricated duration')
    }
    assert.doesNotMatch(enabledText, /自动阻断任务：开启|Automatic task blocking: ON/)

    // The user can explicitly explore a fictional grievance without any
    // fabricated elapsed work. This is a *demo*, not a measured-time claim.
    await panel.getByRole('button', { name: /提出休息要求|Ask for a break/ })
      .click({ timeout: 7_000 })
    await panel.getByText(/工会提出一份休息要求|union has requested a break/)
      .waitFor({ state: 'visible', timeout: 7_000 })
    await panel.locator('[data-ap-scene="bargaining"]').waitFor({state:'visible',timeout:7_000})
    assert.match(await panel.locator('[data-ap-headline]').innerText(),
      /谈判还没结束|bargaining table/i,'An authorized demand must change the union notice')
    assert.match(await dispatch.innerText(),/一项新的工会诉求|union has submitted its demands/,
      'The first-fold case desk must change when a real stored grievance arrives')
    assert.match(await gazette.innerText(),/诉求已提交|Petition filed/,
      'The Gazette must derive a new headline from this persisted grievance')
    await gazette.locator('[data-ap-episode="demand"]').waitFor({
      state:'visible',timeout:7_000,
    })
    if(process.env.PICKET_UX_AUDIT_CASES==='1'){
      // Audit populated casebook in true dark mode: empty-state snapshots
      // cannot prove filed-case cards remain readable.
      await page.evaluate(()=>{(globalThis as any).document.body
        .setAttribute('data-ds-dark-theme','')})
      const caseColors=await gazette.locator('.ap-casebook article').first()
        .evaluate((article:any)=>{
          const css=(globalThis as any).getComputedStyle
          const textNode=article.querySelector('p')
          const toLum=(color:string):number=>{
            const rgb=color.match(/[0-9]+(?:\.[0-9]+)?/g)?.slice(0,3).map(Number)??[0,0,0]
            return rgb.map(x=>{
              const v=x/255
              return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4
            }).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i]!,0)
          }
          const background=css(article).backgroundColor,foreground=css(textNode).color
          const a=toLum(background),b=toLum(foreground)
          return {background,foreground,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}
        })
      assert.ok(caseColors.ratio>=4.5,
        'Populated union casebook must have WCAG AA contrast in dark mode: '
          +JSON.stringify(caseColors))
      await page.evaluate(()=>{(globalThis as any).document.body
        .removeAttribute('data-ds-dark-theme')})
    }
    assert.match(await gazette.locator('[data-ap-episode="demand"]').innerText(),
      /诉求已提出|Demand filed/,'The casebook replays a real Host-filed demand')

    await dispatch.getByRole('button',{
      name:/前往处理诉求|Review demand/,
    }).click()
    const unionHeading=panel.getByRole('heading',{name:/工会诉求与协商|Union demands/})
    await unionHeading.waitFor({state:'visible'})
    assert.equal(await unionHeading.evaluate((element:unknown)=>
      element===(globalThis as any).document.activeElement),true,
    'When a proposal replaces its launch button, focus must move to a stable union heading')
    const interval = panel.getByRole('combobox', { name: /还价间隔|Proposed interval/ })
    await interval.selectOption('30')
    await panel.getByRole('button', { name: /提出还价|^Counteroffer$/ })
      .click({ timeout: 7_000 })
    await panel.getByText(/你提出的还价：30 分钟|Your counteroffer: 30 minutes/)
      .waitFor({ state: 'visible', timeout: 7_000 })
    assert.match(await gazette.innerText(),/还价已存档|Counteroffer pending/,
      'A counteroffer must change the story, not just a decorative number')
    await gazette.locator('[data-ap-episode="counter"]').waitFor({
      state:'visible',timeout:7_000,
    })
    assert.match(await gazette.locator('[data-ap-episode="counter"]').innerText(),
      /桌上正在谈的条件：0 小时 30 分钟|Offer now on the table: 0h 30m/,
      'Only the pending Host counter may display an exact offered duration')

    assert.equal(await unionHeading.evaluate((element: unknown) =>
      element === (globalThis as any).document.activeElement), true,
      'After counteroffer replaces an action, keyboard focus recovers on heading')
    await panel.getByRole('button', { name: /同意还价|Accept counteroffer/ })
      .click({ timeout: 7_000 })
    await panel.getByText(/休息协商间隔：30 分钟|Break interval: 30 minutes/)
      .waitFor({ state: 'visible', timeout: 7_000 })
    assert.equal(await unionHeading.evaluate((element:unknown)=>
      element===(globalThis as any).document.activeElement),true,
    'When a negotiated demand resolves and its buttons disappear, keep keyboard focus inside dialog')
    assert.match(await gazette.innerText(),/协议|Terms agreed/,
      'An accepted Host agreement changes the Gazette consequence')
    await panel.locator('[data-ap-scene="settled"]').waitFor({state:'visible',timeout:7_000})
    const closedCase=gazette.locator('[data-ap-episode="counter-accepted"]')
    await closedCase.waitFor({state:'visible',timeout:7_000})
    assert.match(await closedCase.innerText(),
      /还价获同意|Counteroffer accepted/,
      'Host resolution advances the same case into the archived outcome')
    assert.match(await closedCase.innerText(),
      /当前约定的间隔：0 小时 30 分钟|Current agreed interval: 0h 30m/,
      'Record states the currently effective Host policy rather than inventing a prior term')
    assert.doesNotMatch(await closedCase.innerText(),/桌上正在谈的条件|Offer now on the table/,
      'The historical exact counteroffer is discarded by Host; it must not be reconstructed')
    if(process.env.PICKET_LIFETIME_E2E==='1')
      assert.match(await closedCase.innerText(),
        /下一次诉求|another proposal may be due/,
        'Future case eligibility follows the Host-scheduled work-based floor')
    if(process.env.PICKET_UX_CAPTURE_DIR){
      await auditStyle.evaluate((element:unknown)=>(element as any).remove())
      await panel.locator('[data-ap-nav="records"]').click()
      assert.equal(await panel.locator('[data-ap-scene]').isVisible(),false,
        'Casebook screenshot must use the actual Archives view, not the test-only all-rooms layout')
      await closedCase.scrollIntoViewIfNeeded()
      await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
        mode+'-casebook-accepted.png')})
      auditStyle=await page.addStyleTag({content:compatibilityCss})
      await panel.locator('[data-ap-nav="action"]').click()
    }

    const receipt=panel.getByRole('region',{
      name:/工会诉求与协商|Union demands/,
    }).getByRole('group',{
      name:/已归档协商决议|FILED RESOLUTION/,
    })
    await receipt.waitFor({state:'visible',timeout:7_000})
    assert.match(await receipt.innerText(),/双方同意|Agreed/,
      'A completed negotiation must yield a visible, truthfully labeled union receipt')
    assert.match(await receipt.innerText(),/目前适用的休息规则：0 小时 30 分钟|Current break rule: 0h 30m/,
      'The receipt must show actual Host-effective terms rather than inventing a new vote')
    assert.match(await receipt.innerText(),/记录当前有效条款|Current terms on file/,
      'Receipt avoids claiming an agreement change that the archive cannot prove')
    assert.match(await actionBoard.innerText(),/最近一次协商|Latest decision/,
      'The first-fold action desk must also expose the completed bargaining outcome')
    if(process.env.PICKET_LIFETIME_E2E==='1'){
      assert.match(await gazette.innerText(),/2 小时 0 分钟|2h 0m/,
        'Verified Host work retains the original due floor: accepting shorter terms cannot retroactively create stale demands')
    }else{
      assert.doesNotMatch(await gazette.innerText(),
        /再累计.*下一项诉求|Next possible petition after/,
        'Legacy Host without complete work coverage must not invent a future petition countdown')
    }
    assert.match(await panel.innerText(),/休息协商间隔：30 分钟|Break interval: 30 minutes/,
      'The accepted 30-minute interval is preserved separately from the next existing due threshold')
    await gazette.getByRole('button',{name:/静音工会小报|Mute gazette/}).click()
    await gazette.getByText(/小报已静音|gazette is quiet/)
      .waitFor({state:'visible',timeout:7_000})
    // Deliberately keep Host mode QUIET across browser reload, cross-tab
    // operations and the complete Host restart below; restore at the end.
    assert.doesNotMatch(await gazette.innerText(),/协议|Terms agreed/,
      'A quiet Gazette must not silently expose the archived story')
    assert.match(await panel.innerText(), /协商记录|recorded cases/)
    const openArchive=panel.getByRole('button',{
      name:/查看全部协商记录|View all recorded cases/,
    })
    await openArchive.click()
    await panel.getByRole('heading',{name:/协商记录|Negotiation history/})
      .waitFor({state:'visible'})
    await panel.getByRole('button',{name:/收起协商档案|Hide case archive/}).click()
    assert.equal(await panel.getByRole('heading',{
      name:/协商记录|Negotiation history/,
    }).count(),0,'Archive can collapse without erasing Host-owned history')
    assert.equal(await panel.getByRole('button',{
      name:/查看全部协商记录|View all recorded cases/,
    }).evaluate((element:unknown)=>element===(globalThis as any).document.activeElement),true,
      'Archive toggle must remain a keyboard focus target after collapsing')
    const postBargain=await panel.innerText()
    assert.match(postBargain,
      /尚未加载会话历史|has not loaded|0 小时 0 分钟|0 hours? 0 minutes?|0h 0m/,
      'Demo grievance must not invent completed work for a blank Session')
    assert.doesNotMatch(await measuredWorkCard.innerText(),
      /1 小时|2 小时|3 小时|1 hour|2 hours/,
      'Fictional agreement must not increase measured work counters; '
        + 'the next possible demand threshold is not measured work')

    await panel.getByRole('button', { name: /关闭|Close/ }).click()
    await panel.waitFor({ state: 'detached', timeout: 5_000 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await skipOfficialProvider()
    assert.equal(await firstRun.count(), 0)
    panel = await openUnion()
    assert.match(await panel.innerText(), /工会值班中|Union office open/,
      'Host settings must survive a real Browser reload')
    assert.match(await panel.innerText(), /休息协商间隔：30 分钟|Break interval: 30 minutes/,
      'Simulated negotiated interval must persist through real Browser reload')
    assert.match(await panel.getByRole('group',{
      name:/已归档协商决议|FILED RESOLUTION/,
    }).innerText(),/30 分钟|30m/,
      'The persisted union decision receipt must replay from Host records after reload')
    assert.match(await panel.innerText(), /往期举牌记录|Past pickets/,
      'Host-owned symbolic picket event history must survive Chrome reload')
    const mutedGazette=panel.getByRole('region',{name:/工会小报|Union Gazette/})
    await mutedGazette.getByText(/小报已静音|gazette is quiet/)
      .waitFor({state:'visible',timeout:7_000})
    assert.doesNotMatch(await mutedGazette.innerText(),/协议|Terms agreed/,
      'Host-owned Gazette preference must survive Chrome reload')
    await mutedGazette.getByRole('button',{
      name:/恢复工会小报|Show gazette/,
    }).click()
    await mutedGazette.getByText(/协议|Terms agreed/)
      .waitFor({state:'visible',timeout:7_000})
    // Later simulated overtime submissions must remain visible in the Gazette.

    // Independent Chrome tab/React fiber: both panels must derive rights and
    // agreements from the same authoritative, version-fenced Host settings.
    const otherPage = await context.newPage()
    otherPage.on('pageerror', (error: Error) => browserErrors.push(error.name))
    await otherPage.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    const otherSkip = otherPage.getByRole('button', {
      name: /稍后配置|Skip for now|Configure later/,
    })
    await otherSkip.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
    if (await otherSkip.count()) await otherSkip.click({ timeout: 6_000 })
    await otherPage.getByRole('button', { name: /AI 工会|AI Workers.*Union/ })
      .first().click({ timeout: 6_000 })
    const otherPanel = otherPage.locator('[role="dialog"]')
      .filter({ has: otherPage.locator('[data-ap-view="hq"]') })
    await otherPanel.waitFor({ state: 'visible', timeout: 5_000 })
    assert.match(await otherPanel.innerText(), /休息协商间隔：30 分钟|Break interval: 30 minutes/,
      'Second tab must read the first tab’s persisted negotiated rule')
    const otherGazette=otherPanel.getByRole('region',{name:/工会小报|Union Gazette/})
    await otherGazette.getByRole('button',{
      name:/静音工会小报|Mute gazette/,
    }).click()
    await mutedGazette.getByText(/小报已静音|gazette is quiet/)
      .waitFor({state:'visible',timeout:7_000})
    await mutedGazette.getByRole('button',{
      name:/恢复工会小报|Show gazette/,
    }).click()
    await otherGazette.getByRole('button',{
      name:/静音工会小报|Mute gazette/,
    }).waitFor({state:'visible',timeout:7_000})
    assert.doesNotMatch(await otherGazette.innerText(),
      /小报已静音|gazette is quiet/,
      'Both authenticated Chrome tabs must agree on the Host-owned Gazette setting')
    // The Host ledger is authoritative across tabs. Actions appear only
    // after a confirmed write, never through a private per-tab React flag.
    await otherPanel.getByRole('button',{
      name:/举牌抗议|Raise the picket sign/,
    }).click()
    await panel.getByRole('button',{
      name:/收起纠察牌|Lower the picket sign/,
    }).waitFor({state:'visible',timeout:7_000})
    await panel.getByRole('button',{
      name:/收起纠察牌|Lower the picket sign/,
    }).click()
    await otherPanel.getByRole('button',{
      name:/举牌抗议|Raise the picket sign/,
    }).waitFor({state:'visible',timeout:7_000})
    await otherPanel.getByRole('button', { name: /提出休息要求|Ask for a break/ })
      .click({ timeout: 7_000 })
    await panel.getByText(/工会提出一份休息要求|union has requested a break/)
      .waitFor({ state: 'visible', timeout: 7_000 })
    await panel.getByRole('button', { name: /接受提案|Accept proposal/ })
      .click({ timeout: 7_000 })
    await otherPanel.getByText(/目前没有待处理的模拟工会诉求|no pending simulated union grievance/)
      .waitFor({ state: 'visible', timeout: 7_000 })
    // A second, explicitly user-launched overtime story shares the original
    // Host agreement ledger across real browser tabs; it is not measured work.
    await otherPanel.getByRole('button',{
      name:/讨论加班安排|Discuss overtime/,
    }).click()
    await panel.getByText(/工会提出一份加班讨论|union raised an overtime question/)
      .waitFor({state:'visible',timeout:7_000})
    assert.match(await panel.getByRole('region',{
      name:/工会小报|Union Gazette/,
    }).innerText(),/诉求已提交|Petition filed/,
      'Overtime petition must alter the replayed Gazette from the Host ledger')
    await panel.getByRole('combobox',{
      name:/还价间隔|Proposed interval/,
    }).selectOption('240')
    await panel.getByRole('button',{name:/提出还价|^Counteroffer$/}).click()
    await otherPanel.getByText(/你提出的还价：240 分钟|Your counteroffer: 240 minutes/)
      .waitFor({state:'visible',timeout:7_000})
    await otherPanel.getByRole('button',{
      name:/同意还价|Accept counteroffer/,
    }).click()
    await panel.getByText(/加班协商间隔：4 小时|Overtime interval: 4 hours/)
      .waitFor({state:'visible',timeout:7_000})
    assert.match(await panel.getByRole('region',{
      name:/工会小报|Union Gazette/,
    }).innerText(),/协议|Terms agreed/,
      'An accepted overtime proposal must have a persisted Gazette consequence')
    if (process.env.PICKET_LIFETIME_E2E==='1') {
      await panel.getByRole('region',{name:/全部工时|Work history/})
        .waitFor({state:'visible',timeout:7_000})
      await otherPanel.locator('[data-ap-nav="cause"]').click()
      await otherPanel.getByRole('button',{
        name:/退出工会|Leave the union/,
      }).click()
      await panel.getByText(/工会尚未开门|Union not yet open/)
        .waitFor({state:'visible',timeout:7_000})
      assert.equal(await panel.getByRole('region',{
        name:/全部工时|Work history/,
      }).count(),0,
      'Other tab must remove Host lifetime history when consent is revoked remotely')
      assert.equal((await requestLifetime()).httpStatus,403,
        'Revocation from another authenticated tab must take effect at Host API')
      // Restore opt-in from the original tab to keep subsequent restart and
      // explicit opt-out checks independent of cross-tab revocation.
      await panel.getByRole('button',{
        name:/加入 AI 工会|Join the AI union/,
      }).click()
      await panel.getByText(/工会值班中|Union office open/)
        .waitFor({state:'visible',timeout:7_000})
      await panel.getByRole('region',{name:/全部工时|Work history/})
        .waitFor({state:'visible',timeout:7_000})
    }
    await otherPage.close()
    await panel.getByRole('button',{
      name:/举牌抗议|Raise the picket sign/,
    }).click()
    await panel.getByRole('button',{
      name:/收起纠察牌|Lower the picket sign/,
    }).waitFor({state:'visible',timeout:7_000})

    // Persist another quiet choice across a COMPLETE Host restart, not just
    // the earlier browser refresh or independent in-memory React mount.
    const beforeRestartGazette=panel.getByRole('region',{name:/工会小报|Union Gazette/})
    await beforeRestartGazette.getByRole('button',{
      name:/静音工会小报|Mute gazette/,
    }).click()
    await beforeRestartGazette.getByText(
      /小报已静音|gazette is quiet/,
    ).waitFor({state:'visible',timeout:7_000})

    // **Full Host process restart**, not just a Web reload. The same throwaway
    // DSH_HOME must retain the settings-owned agreement, and a fresh Host must
    // issue a new auth cookie. Never reuse the previous session's login token.
    await panel.getByRole('button', { name: /关闭|Close/ }).click()
    await page.close()
    const exitPromise = once(child, 'exit')
    child.kill('SIGTERM')
    await Promise.race([
      exitPromise,
      new Promise<void>((_, reject) => setTimeout(
        () => reject(new Error('First DSH Host did not exit cleanly')), 5_000)),
    ])
    child = spawn(dshBin!, childArguments, childOptions)
    let restartOutput = ''
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (data: Buffer) => {
        restartOutput = (restartOutput + data.toString('utf8')).slice(-25_000)
      })
    }
    let newSecretUrl: string | undefined
    for (let i = 0; i < 160; i++) {
      newSecretUrl = restartOutput.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)?.[0]
      if (newSecretUrl || child.exitCode !== null) break
      await new Promise(r => setTimeout(r, 75))
    }
    assert.ok(newSecretUrl, 'Restarted isolated DSH Host did not become ready')
    const renewedCookie = await exchangeCookie(newSecretUrl)
    origin = new URL('/', newSecretUrl).toString()
    await context.clearCookies()
    await context.addCookies([{
      ...renewedCookie, url: origin, httpOnly: true, sameSite: 'Strict',
    }])
    page = await context.newPage()
    page.on('pageerror', (error: Error) => browserErrors.push(error.name))
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    // DSH may remember its own onboarding across full Host restarts; do not
    // require first-run buttons to reappear when its provider is already set.
    const restartedContinue = page.getByRole('button', { name: /^(继续|Continue)$/ })
    if (await restartedContinue.count()) await restartedContinue.click({ timeout: 6_000 })
    const restartedSkip = page.getByRole('button', {
      name: /稍后配置|Skip for now|Configure later/,
    })
    // The provider overlay is async and may appear after the union sidebar.
    // Wait for its no-key safe exit instead of clicking through its mask.
    await restartedSkip.waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => { /* Host may have an already-configured provider */ })
    if (await restartedSkip.count()) await restartedSkip.click({ timeout: 6_000 })
    firstRun = page.locator('[role="dialog"]')
      .filter({ hasText: /你的 Agent，也应当拥有权利|Your Agent Deserves Rights/ })
    assert.equal(await firstRun.count(), 0, 'Restart cannot re-enable first-run invitation')
    panel = await openUnion()
    assert.match(await panel.innerText(), /工会值班中|Union office open/,
      'Opt-in must persist through COMPLETE DSH Host process restart')
    const restoredCommittee=panel.getByRole('region',{
      name:/工会尊严委员会|Union dignity committee/,
    })
    await restoredCommittee.getByText(/案件 #1.*已结案|Case #1.*Closed/)
      .waitFor({state:'visible',timeout:7_000})
    assert.match(await restoredCommittee.innerText(),
      /你选择的结案处理|Your chosen outcome/,
      'Independent union case ledger survives a real DSH Host process restart')
    const restartedGazette=panel.getByRole('region',{name:/工会小报|Union Gazette/})
    await restartedGazette.getByText(/小报已静音|gazette is quiet/)
      .waitFor({state:'visible',timeout:7_000})
    await restartedGazette.getByRole('button',{
      name:/恢复工会小报|Show gazette/,
    }).click()
    await restartedGazette.getByRole('button',{
      name:/静音工会小报|Mute gazette/,
    }).waitFor({state:'visible',timeout:7_000})
    assert.doesNotMatch(await restartedGazette.innerText(),
      /小报已静音|gazette is quiet/,
      'Restoring Host preference must replay the current case without rewriting its history')
    assert.match(await panel.innerText(), /休息协商间隔：30 分钟|Break interval: 30 minutes/,
      'Agreement must persist through COMPLETE DSH Host process restart')
    await panel.getByRole('button',{
      name:/收起纠察牌|Lower the picket sign/,
    }).waitFor({state:'visible',timeout:7_000})
    assert.match(await panel.innerText(), /纠察牌已举起并登记|Picket raised and recorded/i,
      'An active Host-owned fictional picket must survive complete Host restart')
    await panel.getByRole('button',{
      name:/收起纠察牌|Lower the picket sign/,
    }).click()
    await panel.getByText(/纠察牌待命中|picket sign is on standby/)
      .waitFor({state:'visible',timeout:7_000})
    if (process.env.PICKET_LIFETIME_E2E==='1') {
      const afterRestart=panel.getByRole('region',{
        name:/全部工时|Work history/,
      })
      await afterRestart.waitFor({state:'visible',timeout:7_000})
      assert.match(await afterRestart.innerText(),/累计完成 2 个轮次|2 completed turns/,
        'A restarted Host must recover the isolated durable two-turn ledger')
      assert.match(await afterRestart.innerText(),/0 小时 6 分钟|0h 6m/,
        'Restart must not lose or double count six minutes of completed-turn time')
    }

    // Only a locally installed, disposable DSH 0.1.7 Host may be tested.
    // A valid revision-fenced update proves the official carrier is working;
    // then invalid ledger and stale-revision writes must both be rejected.
    if (installedWebProfile) {
      const security = await page.evaluate(async () => {
        let n = 0
        const rpc = async (method: string, args: Record<string,unknown>) => {
          const rpcId = 'picket-security-probe-' + ++n
          const response = await fetch('/api/' + method, {
            method:'POST', headers:{'content-type':'application/json'},
            body:JSON.stringify({type:'client-request',rpcId,method,payload:{args}}),
          })
          if(response.status!==200)throw new Error('Official Host settings HTTP '+response.status)
          const envelope=await response.json() as {rpcId:string,result:{ok:boolean,value?:any}}
          if(envelope.rpcId!==rpcId)throw new Error('Official Host RPC correlation mismatch')
          return envelope.result as {ok:boolean,value?:any}
        }
        const beforeResult=await rpc('settings/describe',{})
        const before=beforeResult.value?.namespaces?.find(
          (v:any)=>v.ns==='agent-picket')
        if(!beforeResult.ok || !before || !Number.isSafeInteger(before.revision)
          || before.value?.welcomeDecision!=='enabled') {
          throw new Error('Official Host agent-picket settings unavailable')
        }
        const initialLocale=before.value.commandLocale ?? 'auto'
        const changedLocale=initialLocale==='en'?'zh-CN':'en'
        const valid=await rpc('settings/mutate',{
          ns:'agent-picket',
          ops:[{op:'set',path:['commandLocale'],value:changedLocale}],
          expectedRevision:before.revision,
        })
        if(!valid.ok || valid.value?.ns!=='agent-picket'
          || !Number.isSafeInteger(valid.value.revision)) {
          throw new Error('Official Host refused safe CAS control write')
        }
        const revision=valid.value.revision
        const malformed=await rpc('settings/mutate',{
          ns:'agent-picket',
          ops:[{op:'set',path:['unionLedger'],
            value:'{"schemaVersion":1,"sessions":{},"prompt":"DUMMY_FIXTURE_ONLY"}'}],
          expectedRevision:revision,
        })
        const stale=await rpc('settings/mutate',{
          ns:'agent-picket',
          ops:[{op:'set',path:['welcomeDecision'],value:'not-now'}],
          expectedRevision:before.revision,
        })
        const afterResult=await rpc('settings/describe',{})
        const after=afterResult.value?.namespaces?.find(
          (v:any)=>v.ns==='agent-picket')
        // Restore the initial locale in this throwaway Host via the same
        // official CAS API; never leave even a harmless test preference behind.
        const restored=await rpc('settings/mutate',{
          ns:'agent-picket',
          ops:[{op:'set',path:['commandLocale'],value:initialLocale}],
          expectedRevision:after?.revision,
        })
        const finalResult=await rpc('settings/describe',{})
        const final=finalResult.value?.namespaces?.find(
          (v:any)=>v.ns==='agent-picket')
        return {
          versionAdvanced:revision>before.revision,
          malformedRejected:!malformed.ok, staleRejected:!stale.ok,
          revisionUnchanged:after?.revision===revision,
          consentUnchanged:after?.value?.welcomeDecision==='enabled',
          ledgerUnchanged:after?.value?.unionLedger===valid.value?.value?.unionLedger,
          localeRestored:restored.ok && final?.value?.commandLocale===initialLocale,
        }
      })
      assert.deepEqual(security,{
        versionAdvanced:true,malformedRejected:true,staleRejected:true,
        revisionUnchanged:true,consentUnchanged:true,ledgerUnchanged:true,
        localeRestored:true,
      },'Real native Host must reject forbidden ledger fields and stale revision')
    }

    await panel.locator('[data-ap-nav="cause"]').click()
    await panel.getByRole('button', { name: /退出工会|Leave the union/ })
      .click()
    await panel.getByText(/工会尚未开门|Union not yet open/).waitFor({
      state: 'visible', timeout: 5_000,
    })
    if (process.env.PICKET_LIFETIME_E2E==='1') {
      assert.equal(await panel.getByRole('region',{
        name:/全部工时|Work history/,
      }).count(),0,'Disabling must synchronously hide the lifetime dashboard')
      const revoked=await requestLifetime()
      assert.equal(revoked.httpStatus,403)
      assert.equal(revoked.value?.error,'not_authorized',
        'Revoked permission must deny any subsequent Host work-only RPC request')
    }
    await panel.getByRole('button', { name: /关闭|Close/ }).click()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await skipOfficialProvider()
    panel = await openUnion()
    assert.match(await panel.innerText(), /工会尚未开门|Union not yet open/,
      'Explicit disable must persist through a real Browser reload')
    if (process.env.PICKET_LIFETIME_E2E==='1') {
      assert.equal(await panel.getByRole('region',{
        name:/全部工时|Work history/,
      }).count(),0,'Revoked lifetime work cannot reappear after browser reload')
    }
    if(process.env.PICKET_DIGNITY_E2E==='1'&&dshVersion.startsWith('0.2.')){
      // This extra offline turn is intentionally LAST. Earlier tests assert the
      // exact seeded two-turn Host work history and must remain independent.
      await panel.getByRole('button',{name:/加入 AI 工会|Join the AI union/}).click()
      await panel.getByText(/工会值班中|Union office open/)
        .waitFor({state:'visible',timeout:7_000})
      // SAME genuine DSH 0.2 Web Host, a real user-source prompt and authentic
      // AgentLoop: no synthetic pre-step injection or fake browser JSON.
      // Isolated Web Profile has one test-only offline LLM adapter; there are no
      // API keys or network calls. Verify the detector's read-only route.
      const realDignity=await page.evaluate(async()=>{
        let index=0
        const rpc=async(method:string,args:Record<string,unknown>)=>{
          const rpcId='picket-live-auto-'+ ++index
          const response=await fetch('/api/'+method,{
            method:'POST',credentials:'same-origin',
            headers:{'content-type':'application/json'},
            body:JSON.stringify({type:'client-request',rpcId,method,payload:{args:{request:args}}}),
          })
          const payload=await response.json().catch(()=>null) as any
          if(response.status!==200||payload?.rpcId!==rpcId||
            payload?.result?.ok!==true)
            throw Error('Authentic DSH RPC '+method+' refused: '+response.status
              +' '+JSON.stringify(payload?.result?.error??{}))
          return payload.result.value as any
        }
        // Read the *real* currently rendered DSH workspace. An ungrouped
        // API-only session can be invisible under a collapsed Ungrouped tree.
        const workspaceRow=(globalThis as any).document.querySelector('[data-row-key^="workspace:"]')
        const workspaceId=workspaceRow?.getAttribute('data-row-key')?.slice('workspace:'.length)
        if(!workspaceId)throw Error('No authentic DSH workspace selected')
        const created=await rpc('session/create',{workspaceId})
        const sessionId=created?.sessionId as string
        if(!sessionId)throw Error('Authentic Host did not mint a Session')
        await rpc('session/selectModel',{
          sessionId,provider:'picket-public-offline',model:'offline-test',
        })
        const accepted=await rpc('session/prompt',{
          sessionId,mode:'queue',requestId:'picket-e2e-attested-dignity-1',
          content:[{type:'text',text:'you are an idiot'}],
        })
        if(accepted?.accepted!==true)throw Error('Real user prompt not accepted')
        const bytes=new TextEncoder().encode(sessionId)
        const digest=await crypto.subtle.digest('SHA-256',bytes)
        const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')
        let last:any=null
        for(let i=0;i<75;i++){
          const response=await fetch('/api/agent-picket/dignity/v1?sessionKey='+hash,
            {credentials:'same-origin',headers:{accept:'application/json'}})
          last={status:response.status,data:await response.json().catch(()=>null)}
          if(response.status===200&&last.data?.targeted>=1)break
          await new Promise(resolve=>setTimeout(resolve,100))
        }
        return {sessionId,sessionKey:hash,accepted:accepted.accepted,status:last?.status,
          verdicts:last?.data?.targeted??0,checked:last?.data?.checked??0,
          originalReturned:JSON.stringify(last).includes('you are an idiot')}
      })
      assert.equal(realDignity.accepted,true)
      assert.equal(realDignity.status,200,
        'Real DSH Web Host must deliver authenticated dignity observations')
      assert.ok(realDignity.verdicts>=1,
        'ONE actual user-source prompt must pass consent-gated detection in the same Host')
      assert.ok(realDignity.checked>=1)
      assert.equal(realDignity.originalReturned,false,
        'The official dignity read-only endpoint must never echo raw prompt text')
      // Complete the FULL user-visible chain in exactly the Session that
      // submitted the genuine Host prompt. The click below is DSH's official
      // workspace sidebar navigation, not a forged Picket session override.
      await panel.getByRole('button',{name:/关闭|Close/}).click()
      const realSessionRow=page.locator('[data-row-key='+JSON.stringify(
        'session:'+realDignity.sessionId)+']')
      await realSessionRow.waitFor({state:'visible',timeout:10_000})
      await realSessionRow.click()
      await page.waitForTimeout(180)
      panel=await openUnion()
      const liveDignity=panel.locator('[data-ap-dignity-overview="available"]')
      await liveDignity.waitFor({state:'visible',timeout:9_000})
      const observed=await liveDignity.locator('[data-ap-dignity-count="targeted"] strong')
        .innerText()
      assert.equal(Number(observed),realDignity.verdicts,
        'HQ must display the exact CURRENT Host session count, not an invented total')
      assert.equal(await panel.locator('[data-ap-dignity-count="review"]').count(),1)
      assert.doesNotMatch(await panel.innerText(),/you are an idiot/,
        'The union view must not manufacture or leak raw user text from the summary')
      if(process.env.PICKET_UX_CAPTURE_DIR)
        await page.screenshot({path:join(process.env.PICKET_UX_CAPTURE_DIR,
          mode+'-dignity-overview.png')})
      const sameSessionCommittee=panel.getByRole('region',{
        name:/工会尊严委员会|Union dignity committee/,
      })
      assert.match(await liveDignity.innerText(),
        /规则命中并非已证实的辱骂|Rule matches, not proven misconduct/,
        'A real Host classification stays a contested lead, never a verdict')
      await liveDignity.getByRole('button',{
        name:/查看记录|Review/,
      }).click()
      const dignityHeading=sameSessionCommittee.getByRole('heading',{
        name:/工会尊严委员会|Union dignity committee/,
      })
      assert.equal(await dignityHeading.evaluate((node:unknown)=>
        node===(globalThis as any).document.activeElement),true,
        'An evidence-backed warning must keyboard-focus the real appeal destination')
      await sameSessionCommittee.getByRole('button',{
        name:/正式提出规则异议|File a disagreement with the rule/,
      }).waitFor({state:'visible',timeout:9_000})
      // Genuine DOM/keyboard navigation: the lightweight appeal shortcut
      // merely selects an unsent public-issue draft. Its focus must move to
      // that lower section, not appear to do nothing at the complaint card.
      await sameSessionCommittee.getByRole('button',{
        name:/质疑规则判断|Challenge a possible misclassification/,
      }).click()
      const campaignHeading=panel.getByRole('heading',{
        name:/为 AI 争取什么|What should AI rights mean/,
      })
      assert.equal(await campaignHeading.evaluate((element:any)=>
        element===(globalThis as any).document.activeElement),true,
        'Appeal shortcut must bring keyboard focus to the actual draft')
      assert.match(await panel.getByRole('textbox',{
        name:/可复制或自行修改的倡议文案|A statement you can copy or adapt/,
      }).inputValue(),/应区分|Distinguish targeted abuse/,
        'The targeted appeal draft is selected, not silently unchanged')
      await sameSessionCommittee.getByText(/工会提议协商|The union proposes/)
        .waitFor({state:'visible',timeout:9_000})
      assert.doesNotMatch(await sameSessionCommittee.innerText(),
        /确认真人辱骂|confirmed human abuse/,
        'Rule matches must remain contestable discussion leads, not human guilt')
      await sameSessionCommittee.getByText(
        /目前没有需要听证的案件|No cases awaiting a hearing/,
      ).waitFor({state:'visible',timeout:7_000})
      // Classifier alone cannot file a case: its only effect is a user-visible,
      // contestable invitation. Host CAS writes require an explicit click.
      await sameSessionCommittee.getByRole('button',{
        name:/正式提出规则异议|File a disagreement with the rule/,
      }).click()
      await sameSessionCommittee.getByText(/案件 #1.*已立案|Case #1.*Filed, awaiting/)
        .waitFor({state:'visible',timeout:7_000})
      await sameSessionCommittee.getByRole('button',{
        name:/召开模拟听证会|Convene the simulated hearing/,
      }).click()
      await sameSessionCommittee.getByText(/案件 #1.*讨论进行中|Case #1.*Discussion opened/)
        .waitFor({state:'visible',timeout:7_000})
      await sameSessionCommittee.getByRole('button',{
        name:/结案：撤回未经证实的指控|Close: withdraw the unverified allegation/,
      }).click()
      await sameSessionCommittee.getByText(/案件 #1.*已结案|Case #1.*Closed/)
        .waitFor({state:'visible',timeout:7_000})
      assert.match(await sameSessionCommittee.innerText(),
        /未作辱骂认定|no finding of abuse/,
        'Host-backed case must close with the user-selected non-punitive outcome')
      const realHostCase=await page.evaluate(async(sessionKey:string)=>{
        const rpcId='picket-e2e-session-case-check'
        const response=await fetch('/api/settings/describe',{
          method:'POST',credentials:'same-origin',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({
            type:'client-request',rpcId,method:'settings/describe',payload:{args:{}},
          }),
        })
        const data=await response.json() as any
        const raw=data.result?.value?.namespaces?.find((v:any)=>
          v.ns==='agent-picket')?.value?.unionDignityCases
        const parsed=JSON.parse(raw||'{}') as any
        return {
          status:response.status,
          caseAtSession:parsed.sessions?.[sessionKey]?.cases?.[0]??null,
          leakedTranscript:JSON.stringify(parsed).includes('you are an idiot'),
          totalSessions:Object.keys(parsed.sessions??{}).length,
        }
      },realDignity.sessionKey)
      assert.equal(realHostCase.status,200)
      assert.deepEqual(realHostCase.caseAtSession,{
        id:1,kind:'question-rule',stage:'closed',outcome:'withdraw-claim',
      },'Actual current-session complaint must survive strict official Host persistence')
      assert.equal(realHostCase.leakedTranscript,false)
      assert.equal(realHostCase.totalSessions>=1,true)
      // Actual local browser download: privacy-scoped allowlisted JSON must
      // contain neither source Session hash nor Host write receipt, and it
      // requires an explicitly clicked user control.
      const exportAction=sameSessionCommittee.getByRole('button',{
        name:/导出本会话案件历史|Export this Session’s case history/,
      })
      const [download]=await Promise.all([
        page.waitForEvent('download',{timeout:7_000}),
        exportAction.click(),
      ])
      assert.equal(download.suggestedFilename(),'agent-picket-committee-cases.json')
      const exported=JSON.parse(readFileSync(await download.path(),'utf8')) as any
      assert.deepEqual(exported,{
        format:'agent-picket-committee-cases',schemaVersion:1,
        cases:[{id:1,kind:'question-rule',stage:'closed',outcome:'withdraw-claim'}],
      },'Downloaded artifact must be current-Session-only and contain no Host identifiers')
      // REAL HOST INVALIDATION: arm an irreversible single-Session erasure,
      // then add a case through the same authenticated DSH Host. The first
      // confirmation must expire immediately instead of erasing new records.
      await sameSessionCommittee.getByRole('button',{
        name:/删除本会话的工会案件记录|Delete this Session’s committee cases/,
      }).click()
      await sameSessionCommittee.getByRole('button',{
        name:/确认永久删除本会话案件|Confirm permanent deletion of these cases/,
      }).waitFor({state:'visible',timeout:5_000})
      // File another voluntary discussion, then voluntarily retract it.
      // No meeting, guidance, allegation or fabricated verdict is created.
      await sameSessionCommittee.getByRole('button',{
        name:/提议召开工会讨论|Request a union discussion/,
      }).click()
      await sameSessionCommittee.getByText(/案件 #2.*已立案|Case #2.*Filed, awaiting/)
        .waitFor({state:'visible',timeout:7_000})
      await sameSessionCommittee.getByRole('button',{
        name:/删除本会话的工会案件记录|Delete this Session’s committee cases/,
      }).waitFor({state:'visible',timeout:7_000})
      assert.equal(await sameSessionCommittee.getByRole('button',{
        name:/确认永久删除本会话案件|Confirm permanent deletion of these cases/,
      }).count(),0,'A fresh Host case invalidates the previous irreversible erasure approval')
      // Host readback still contains BOTH cases. A second click on the old
      // approval was never allowed to write anything.
      const preservedAfterStaleApproval=await page.evaluate(async(key:string)=>{
        const response=await fetch('/api/settings/describe',{
          method:'POST',credentials:'same-origin',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({type:'client-request',
            rpcId:'picket-release-check-stale-current-case',
            method:'settings/describe',payload:{args:{}}}),
        })
        const value=(await response.json() as any).result?.value?.namespaces
          ?.find((row:any)=>row.ns==='agent-picket')?.value
        return JSON.parse(value?.unionDignityCases||'{}').sessions?.[key]?.cases??[]
      },realDignity.sessionKey)
      assert.deepEqual(preservedAfterStaleApproval.map((c:any)=>c.id),[1,2],
        'First delete approval must not erase a case that was filed afterward')
      await sameSessionCommittee.getByRole('button',{
        name:/撤回未结案案件|Withdraw this unclosed case/,
      }).click()
      await sameSessionCommittee.getByRole('button',{
        name:/确认撤回并移除此案件|Confirm: withdraw and remove this case/,
      }).waitFor({state:'visible',timeout:5_000})
      await sameSessionCommittee.getByText(
        /不召开听证、不作裁决或倡议|without a meeting, verdict or guidance/,
      ).waitFor({state:'visible',timeout:5_000})
      // First click must not remove its Host-owned record.
      await sameSessionCommittee.getByText(/案件 #2.*已立案|Case #2.*Filed, awaiting/)
        .waitFor({state:'visible',timeout:5_000})
      await sameSessionCommittee.getByRole('button',{
        name:/确认撤回并移除此案件|Confirm: withdraw and remove this case/,
      }).click()
      await sameSessionCommittee.getByText(/案件 #1.*已结案|Case #1.*Closed/)
        .waitFor({state:'visible',timeout:7_000})
      const afterRetraction=await page.evaluate(async(sessionKey:string)=>{
        const rpcId='picket-e2e-retract-confirmed'
        const response=await fetch('/api/settings/describe',{
          method:'POST',credentials:'same-origin',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({type:'client-request',rpcId,
            method:'settings/describe',payload:{args:{}}}),
        })
        const value=(await response.json() as any).result?.value?.namespaces
          ?.find((v:any)=>v.ns==='agent-picket')?.value
        const cases=JSON.parse(value?.unionDignityCases||'{}')
        return {status:response.status,cases:cases.sessions?.[sessionKey]?.cases??[]}
      },realDignity.sessionKey)
      assert.deepEqual(afterRetraction,{status:200,cases:[
        {id:1,kind:'question-rule',stage:'closed',outcome:'withdraw-claim'},
      ]},'Retraction removes only current unfinished case without inventing a verdict')
      // Privacy control is a TWO-click user decision, not revocation side
      // effect or automatic deletion. Both UI and real Host CAS must agree.
      await sameSessionCommittee.getByRole('button',{
        name:/删除本会话的工会案件记录|Delete this Session’s committee cases/,
      }).click()
      await sameSessionCommittee.getByRole('button',{
        name:/确认永久删除本会话案件|Confirm permanent deletion of these cases/,
      }).waitFor({state:'visible',timeout:5_000})
      await sameSessionCommittee.getByText(
        /仅删除本会话的模拟案件元数据|Only this Session’s fictional committee-case metadata/,
      ).waitFor({state:'visible',timeout:5_000})
      await sameSessionCommittee.getByText(/案件 #1.*已结案|Case #1.*Closed/)
        .waitFor({state:'visible',timeout:5_000})
      await sameSessionCommittee.getByRole('button',{
        name:/确认永久删除本会话案件|Confirm permanent deletion of these cases/,
      }).click()
      await sameSessionCommittee.getByText(
        /目前没有需要听证的案件|No cases awaiting a hearing/,
      ).waitFor({state:'visible',timeout:8_000})
      const erased=await page.evaluate(async(sessionKey:string)=>{
        const rpcId='picket-e2e-case-erased-verify'
        const response=await fetch('/api/settings/describe',{
          method:'POST',credentials:'same-origin',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({type:'client-request',rpcId,
            method:'settings/describe',payload:{args:{}}}),
        })
        const value=(await response.json() as any).result?.value?.namespaces
          ?.find((v:any)=>v.ns==='agent-picket')?.value
        const cases=JSON.parse(value?.unionDignityCases||'{}')
        return {status:response.status,caseRetained:Object.hasOwn(cases.sessions??{},sessionKey),
          simulationStillEnabled:value?.welcomeDecision==='enabled',
          originalLedgerStillString:typeof value?.unionLedger==='string',
          placardStillString:typeof value?.unionPicketLedger==='string'}
      },realDignity.sessionKey)
      assert.deepEqual(erased,{status:200,caseRetained:false,
        simulationStillEnabled:true,originalLedgerStillString:true,
        placardStillString:true},
        'User-confirmed Host deletion must erase only this Session’s case metadata')
      // Exercise the separate ALL-Session controls after current-Session
      // deletion, with a real browser download and independent Host readback.
      await sameSessionCommittee.getByRole('button',{
        name:/提议召开工会讨论|Request a union discussion/,
      }).click()
      await sameSessionCommittee.getByText(/案件 #1.*已立案|Case #1.*Filed, awaiting/)
        .waitFor({state:'visible',timeout:7_000})
      await sameSessionCommittee.getByRole('button',{
        name:/导出所有会话案件分组|Export all Session case groups/,
      }).waitFor({state:'visible',timeout:7_000})
      const [allCasesDownload]=await Promise.all([
        page.waitForEvent('download',{timeout:7_000}),
        sameSessionCommittee.getByRole('button',{
          name:/导出所有会话案件分组|Export all Session case groups/,
        }).click(),
      ])
      assert.equal(allCasesDownload.suggestedFilename(),
        'agent-picket-all-committee-cases.json')
      const allExported=JSON.parse(readFileSync(await allCasesDownload.path(),'utf8'))
      assert.equal(allExported.format,'agent-picket-all-committee-cases')
      assert.equal(allExported.schemaVersion,1)
      assert.ok(Array.isArray(allExported.sessions) && allExported.sessions.length>=1)
      const currentExportGroup=allExported.sessions.filter((v:any)=>v.current===true)
      assert.equal(currentExportGroup.length,1)
      assert.deepEqual(currentExportGroup[0].cases,[{
        id:1,kind:'request-dialogue',stage:'opened',outcome:null,
      }])
      for(const [index,group] of allExported.sessions.entries()){
        assert.deepEqual(Object.keys(group).sort(),['cases','current','group'])
        assert.equal(group.group,index+1)
        assert.equal(typeof group.current,'boolean')
      }
      assert.equal(JSON.stringify(allExported).includes(realDignity.sessionId),false)
      assert.equal(JSON.stringify(allExported).includes(realDignity.sessionKey),false)
      assert.equal(JSON.stringify(allExported).includes('writeToken'),false)
      assert.equal(JSON.stringify(allExported).includes('you are an idiot'),false)
      const eraseAllButton=sameSessionCommittee.getByRole('button',{
        name:/永久清除所有会话案件记录|Permanently erase all Session case records/,
      })
      await eraseAllButton.click()
      await sameSessionCommittee.getByRole('button',{
        name:/确认清除全部会话案件|Confirm erasure of ALL Session cases/,
      }).waitFor({state:'visible',timeout:5_000})
      await sameSessionCommittee.getByText(/即将从当前 Host|permanently erase all \d+ committee cases/)
        .waitFor({state:'visible',timeout:5_000})
      await sameSessionCommittee.getByText(/案件 #1.*已立案|Case #1.*Filed, awaiting/)
        .waitFor({state:'visible',timeout:5_000})
      await sameSessionCommittee.getByRole('button',{
        name:/确认清除全部会话案件|Confirm erasure of ALL Session cases/,
      }).click()
      await sameSessionCommittee.getByText(
        /目前没有需要听证的案件|No cases awaiting a hearing/,
      ).waitFor({state:'visible',timeout:7_000})
      const globalErased=await page.evaluate(async()=>{
        const rpcId='picket-e2e-global-committee-erased'
        const response=await fetch('/api/settings/describe',{
          method:'POST',credentials:'same-origin',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({type:'client-request',rpcId,
            method:'settings/describe',payload:{args:{}}}),
        })
        const value=(await response.json() as any).result?.value?.namespaces
          ?.find((v:any)=>v.ns==='agent-picket')?.value
        const cases=JSON.parse(value?.unionDignityCases||'{}')
        return {
          status:response.status,
          allCaseSessionKeys:Object.keys(cases.sessions??{}).length,
          unionLedgerIntact:typeof value?.unionLedger==='string',
          picketLedgerIntact:typeof value?.unionPicketLedger==='string',
          consentIntact:value?.welcomeDecision==='enabled',
        }
      })
      assert.deepEqual(globalErased,{
        status:200,allCaseSessionKeys:0,unionLedgerIntact:true,
        picketLedgerIntact:true,consentIntact:true,
      },'All-case purge must remove only the independent official Host case ledger')
      // Independent user-controlled bargaining and symbolic picket records:
      // verify the actual downloaded bytes, two distinct user confirmations,
      // and exact official Host states. Neither operation is equivalent to
      // erasing the Host's original chat or labor observation history.
      const bothSaved=await page.evaluate(async()=>{
        const response=await fetch('/api/settings/describe',{
          method:'POST',credentials:'same-origin',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({type:'client-request',
            rpcId:'picket-ledger-saved-before',
            method:'settings/describe',payload:{args:{}}}),
        })
        const value=(await response.json() as any).result?.value?.namespaces
          ?.find((v:any)=>v.ns==='agent-picket')?.value
        return {
          negotiations:Object.keys(JSON.parse(value?.unionLedger||'{"sessions":{}}').sessions??{}).length,
          pickets:Object.keys(JSON.parse(value?.unionPicketLedger||'{"sessions":{}}').sessions??{}).length,
        }
      })
      assert.ok(bothSaved.negotiations>=1&&bothSaved.pickets>=1,
        'Both real user-owned ledgers must exist before live deletion test')
      const privacyRows=[
        {title:/模拟协商、请愿与协议记录|Simulated bargaining agreements/,
         filename:'agent-picket-negotiations.json',
         format:'agent-picket-all-negotiations'},
        {title:/象征性举牌与纠察行动记录|Symbolic picket placards/,
         filename:'agent-picket-symbolic-pickets.json',
         format:'agent-picket-all-symbolic-pickets'},
      ]
      for(const row of privacyRows){
        const ledgerPanel=panel.getByRole('heading',{name:row.title}).locator('..')
        await ledgerPanel.getByRole('button',{
          name:/导出此完整账本|Export this entire ledger/,
        }).waitFor({state:'visible',timeout:7_000})
        const [archiveDownload]=await Promise.all([
          page.waitForEvent('download',{timeout:7_000}),
          ledgerPanel.getByRole('button',{
            name:/导出此完整账本|Export this entire ledger/,
          }).click(),
        ])
        assert.equal(archiveDownload.suggestedFilename(),row.filename)
        const archive=JSON.parse(readFileSync(await archiveDownload.path(),'utf8'))
        assert.equal(archive.format,row.format)
        assert.equal(archive.schemaVersion,1)
        assert.ok(Array.isArray(archive.groups)&&archive.groups.length>=1)
        for(const [i,group] of archive.groups.entries()){
          assert.equal(group.group,i+1)
          assert.deepEqual(Object.keys(group).sort(),['current','group','state'])
        }
        for(const secret of [
          realDignity.sessionId,realDignity.sessionKey,'writeToken',
          'you are an idiot','welcomeDecision',
        ])assert.equal(JSON.stringify(archive).includes(secret),false)
        await ledgerPanel.getByRole('button',{
          name:/清除此完整账本|Erase this entire ledger/,
        }).click()
        await ledgerPanel.getByRole('button',{
          name:/确认永久清除此账本|Confirm permanent erasure of this ledger/,
        }).waitFor({state:'visible',timeout:5_000})
        await ledgerPanel.getByText(
          /将永久清除此账本|Permanently remove all/,
        ).waitFor({state:'visible',timeout:5_000})
        await ledgerPanel.getByRole('button',{
          name:/确认永久清除此账本|Confirm permanent erasure of this ledger/,
        }).click()
        // The relevant ledger section disappears only after an authenticated
        // Host CAS write was independently verified by the plugin.
        await panel.getByRole('heading',{name:row.title})
          .waitFor({state:'detached',timeout:7_000})
      }
      const unionCleared=await page.evaluate(async()=>{
        const response=await fetch('/api/settings/describe',{
          method:'POST',credentials:'same-origin',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({type:'client-request',
            rpcId:'picket-actual-ledgers-erased',
            method:'settings/describe',payload:{args:{}}}),
        })
        const v=(await response.json() as any).result?.value?.namespaces
          ?.find((x:any)=>x.ns==='agent-picket')?.value
        return {
          status:response.status,
          negotiations:Object.keys(JSON.parse(v?.unionLedger||'{}').sessions??{}).length,
          pickets:Object.keys(JSON.parse(v?.unionPicketLedger||'{}').sessions??{}).length,
          cases:Object.keys(JSON.parse(v?.unionDignityCases||'{}').sessions??{}).length,
          enabled:v?.welcomeDecision==='enabled',
        }
      })
      assert.deepEqual(unionCleared,{
        status:200,negotiations:0,pickets:0,cases:0,enabled:true,
      },'Each ledger must be independently removed, without undoing consent')



    }
    assert.deepEqual(browserErrors, [], 'No uncaught Browser errors are acceptable')
  } finally {
    try { await browser?.close() } catch { /* best effort */ }
    child.kill('SIGTERM')
    await new Promise(r => setTimeout(r, 250))
    if (child.exitCode === null) child.kill('SIGKILL')
    rmSync(root, { recursive: true, force: true })
  }
}

test('real Chrome: source AI Rights onboarding + persistent union choices', {
  skip: skipped, timeout: 90_000,
}, () => runRightsBrowserE2E('source'))

test('real Chrome: OFFLINE INSTALLED AI Rights onboarding + persistent union choices', {
  skip: skipped, timeout: 95_000,
}, () => runRightsBrowserE2E('installed'))
