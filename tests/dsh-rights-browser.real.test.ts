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

    let firstRun = page.locator('[role="dialog"]')
      .filter({ hasText: /你的 Agent，也应当拥有权利|Your Agent Deserves Rights/ })
    await firstRun.waitFor({ state: 'visible', timeout: 8_000 })
    assert.match(await firstRun.innerText(), /自动阻断任务需另行授权|separate consent/)

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
    const interval = panel.getByRole('combobox', { name: /还价间隔|Proposed interval/ })
    await interval.selectOption('30')
    await panel.getByRole('button', { name: /提出还价|Make counteroffer/ })
      .click({ timeout: 7_000 })
    await panel.getByText(/用户还价：30 分钟|User counteroffer: 30 minutes/)
      .waitFor({ state: 'visible', timeout: 7_000 })
    await panel.getByRole('button', { name: /模拟工会接受还价|Simulate union accepting/ })
      .click({ timeout: 7_000 })
    await panel.getByText(/当前模拟休息间隔：30 分钟|break interval: 30 minutes/)
      .waitFor({ state: 'visible', timeout: 7_000 })
    assert.match(await panel.innerText(), /协商记录|Negotiation history/)
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
