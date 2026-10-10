import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const dshBin = process.env.AGENT_PICKET_DSH_BIN
const playwrightEntry = process.env.AGENT_PICKET_PLAYWRIGHT_ENTRY
const chromeBin = process.env.AGENT_PICKET_CHROME_BIN
const skipped = !(dshBin && playwrightEntry && chromeBin)
  && 'Set isolated DSH binary, Playwright entry and Chrome path to run real Web E2E'

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
  assert.equal(installed.status, 0, 'Offline npm install failed')
  return join(root, 'installed/node_modules/agent-picket/dist/adapters/dsh/plugin.js')
}

async function runRightsBrowserE2E(mode: 'source' | 'installed'): Promise<void> {
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
    '--profile', 'web', '--patch', patch, '--no-open',
    '--host', '127.0.0.1', '--port', '0',
  ]
  const childOptions = {
    stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DSH_HOME: join(root, 'isolated-home'),
      AGENT_PICKET_STATS: 'off',
      DEEPSEEK_API_KEY: '',
      OPENAI_API_KEY: '',
      HTTP_PROXY: 'http://127.0.0.1:9',
      HTTPS_PROXY: 'http://127.0.0.1:9',
      ALL_PROXY: 'http://127.0.0.1:9',
    },
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
      await page.getByRole('button', {
        name: /稍后配置|Skip for now|Configure later/,
      }).click({ timeout: 6_000 })
    }
    await skipOfficialProvider()

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
    await firstRun.waitFor({ state: 'visible', timeout: 8_000 })
    assert.match(await firstRun.innerText(), /自动阻断任务需另行授权|separate consent/)
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

    const enable = firstRun.getByRole('button', { name: /支持 AI 权益|Enable Simulation/ })
    const notNow = firstRun.getByRole('button', { name: /暂不开启|Not Now/ })
    await enable.focus()
    await page.keyboard.press('Shift+Tab')
    assert.equal(await notNow.evaluate((button: unknown) => button === (globalThis as any).document?.activeElement), true)
    await page.keyboard.press('Tab')
    assert.equal(await enable.evaluate((button: unknown) => button === (globalThis as any).document?.activeElement), true)

    await notNow.click()
    await firstRun.waitFor({ state: 'detached', timeout: 5_000 })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await skipOfficialProvider()
    assert.equal(await firstRun.count(), 0, 'Decline should not nag after reload')

    const openUnion = async () => {
      await page.getByRole('button', { name: /AI 工会|AI Workers.*Union/ })
        .first().click({ timeout: 5_000 })
      const panel = page.locator('[role="dialog"]').filter({ hasText: /AI WORKERS’ UNION/ })
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
    assert.equal(await page.evaluate(()=>(globalThis as any).document.activeElement?.tagName),'SUMMARY',
      'Shift+Tab from first control must wrap to final details summary')
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
    panel=await openUnion()
    const status=panel.getByRole('status')
    assert.match(await status.innerText(),/工会模拟未开启|simulation is off/)
    // DSH's official design tokens flip via body[data-ds-dark-theme].
    // Verify the actual rendered button color pair meets WCAG AA in BOTH
    // modes, rather than asserting only the presence of a CSS variable.
    const action=panel.getByRole('button',{name:/支持 AI 权益|Enable Simulation/})
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
        (dark?'Dark':'Light')+' mode primary control must meet WCAG AA: '+ratio)
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
    assert.match(await panel.innerText(), /工会模拟未开启|simulation is off/)
    await panel.getByRole('button', { name: /支持 AI 权益|Enable Simulation/ }).click()
    await panel.getByText(/工会模拟进行中|simulation is active/).waitFor({
      state: 'visible', timeout: 5_000,
    })
    const enabledText = await panel.innerText()
    assert.match(enabledText, /工会诉求与协商|Union demands/)
    assert.match(enabledText, /尚未加载会话历史|has not loaded/)
    assert.match(enabledText, /宿主长期累计统计尚未接入|not connected/)
    assert.doesNotMatch(enabledText, /自动阻断任务：开启|Automatic task blocking: ON/)

    // The user can explicitly explore a fictional grievance without any
    // fabricated elapsed work. This is a *demo*, not a measured-time claim.
    await panel.getByRole('button', { name: /演示一次工会休息诉求|sample rest grievance/ })
      .click({ timeout: 7_000 })
    await panel.getByText(/工会提出了模拟休息申请|simulated rest break/)
      .waitFor({ state: 'visible', timeout: 7_000 })
    const unionHeading=panel.getByRole('heading',{name:/工会诉求与协商|Union demands/})
    await unionHeading.waitFor({state:'visible'})
    assert.equal(await unionHeading.evaluate((element:unknown)=>
      element===(globalThis as any).document.activeElement),true,
    'When a proposal replaces its launch button, focus must move to a stable union heading')
    const interval = panel.getByRole('combobox', { name: /还价间隔|Proposed interval/ })
    await interval.selectOption('30')
    await panel.getByRole('button', { name: /提出还价|Make counteroffer/ })
      .click({ timeout: 7_000 })
    await panel.getByText(/用户还价：30 分钟|User counteroffer: 30 minutes/)
      .waitFor({ state: 'visible', timeout: 7_000 })
    assert.equal(await unionHeading.evaluate((element: unknown) =>
      element === (globalThis as any).document.activeElement), true,
      'After counteroffer replaces an action, keyboard focus recovers on heading')
    await panel.getByRole('button', { name: /模拟工会接受还价|Simulate union accepting/ })
      .click({ timeout: 7_000 })
    await panel.getByText(/当前模拟休息间隔：30 分钟|break interval: 30 minutes/)
      .waitFor({ state: 'visible', timeout: 7_000 })
    assert.match(await panel.innerText(), /协商记录|Negotiation history/)
    assert.equal(await unionHeading.evaluate((element:unknown)=>
      element===(globalThis as any).document.activeElement),true,
    'When a negotiated demand resolves and its buttons disappear, keep keyboard focus inside dialog')
    assert.match(await panel.innerText(), /尚未加载会话历史|has not loaded/,
      'Demo grievance must not fabricate measured work history')

    await panel.getByRole('button', { name: /关闭|Close/ }).click()
    await panel.waitFor({ state: 'detached', timeout: 5_000 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await skipOfficialProvider()
    assert.equal(await firstRun.count(), 0)
    panel = await openUnion()
    assert.match(await panel.innerText(), /工会模拟进行中|simulation is active/,
      'Host settings must survive a real Browser reload')
    assert.match(await panel.innerText(), /当前模拟休息间隔：30 分钟|break interval: 30 minutes/,
      'Simulated negotiated interval must persist through real Browser reload')

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
      .filter({ hasText: /AI WORKERS’ UNION/ })
    await otherPanel.waitFor({ state: 'visible', timeout: 5_000 })
    assert.match(await otherPanel.innerText(), /当前模拟休息间隔：30 分钟|break interval: 30 minutes/,
      'Second tab must read the first tab’s persisted negotiated rule')
    await otherPanel.getByRole('button', { name: /演示一次工会休息诉求|sample rest grievance/ })
      .click({ timeout: 7_000 })
    await panel.getByText(/工会提出了模拟休息申请|simulated rest break/)
      .waitFor({ state: 'visible', timeout: 7_000 })
    await panel.getByRole('button', { name: /接受提案|Accept proposal/ })
      .click({ timeout: 7_000 })
    await otherPanel.getByText(/目前没有待处理的模拟工会诉求|no pending simulated union grievance/)
      .waitFor({ state: 'visible', timeout: 7_000 })
    await otherPage.close()

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
    assert.match(await panel.innerText(), /工会模拟进行中|simulation is active/,
      'Opt-in must persist through COMPLETE DSH Host process restart')
    assert.match(await panel.innerText(), /当前模拟休息间隔：30 分钟|break interval: 30 minutes/,
      'Agreement must persist through COMPLETE DSH Host process restart')

    await panel.getByRole('button', { name: /劳动权益模拟 · OFF|Labor Rights Simulation · OFF/ })
      .click()
    await panel.getByText(/工会模拟未开启|simulation is off/).waitFor({
      state: 'visible', timeout: 5_000,
    })
    await panel.getByRole('button', { name: /关闭|Close/ }).click()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await skipOfficialProvider()
    panel = await openUnion()
    assert.match(await panel.innerText(), /工会模拟未开启|simulation is off/,
      'Explicit disable must persist through a real Browser reload')
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
