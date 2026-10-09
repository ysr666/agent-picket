import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const dshBin = process.env.AGENT_PICKET_DSH_BIN
const dshHost = process.env.AGENT_PICKET_DSH_HOST
// Opt-in only: install playwright-core outside the repository and set the exact
// index.mjs path, plus a Chrome/Chromium executable. Never download a browser as
// a package install side effect or bundle Playwright in AgentPicket.
const playwrightEntry = process.env.AGENT_PICKET_PLAYWRIGHT_ENTRY
const chromeBin = process.env.AGENT_PICKET_CHROME_BIN

function exchangeCookie(url: string): Promise<{ name: string; value: string }> {
  return new Promise((resolve, reject) => {
    const request = get(url, { timeout: 4000 }, response => {
      response.resume()
      const raw = response.headers['set-cookie']?.[0]?.split(';')[0] ?? ''
      const position = raw.indexOf('=')
      if (response.statusCode !== 303 || position < 1) {
        reject(new Error('DSH token-to-cookie authentication failed'))
        return
      }
      resolve({ name: raw.slice(0, position), value: raw.slice(position + 1) })
    })
    request.on('timeout', () => request.destroy(new Error('DSH cookie exchange timed out')))
    request.on('error', reject)
  })
}

test('real Chrome: union picker, native command results and non-blocking symbolic picket', {
  skip: !(dshBin && dshHost && playwrightEntry && chromeBin)
    && 'Set isolated DSH, AGENT_PICKET_PLAYWRIGHT_ENTRY and AGENT_PICKET_CHROME_BIN',
  timeout: 55_000,
}, async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-picket-chrome-test-'))
  const plugin = resolve(import.meta.dirname, '../dist/adapters/dsh/plugin.js')
  assert.ok(existsSync(plugin), 'Build the ESM plugin before running browser tests')
  const patch = join(root, 'browser.patch.yml')
  writeFileSync(patch, `- insert:
    - id: agent-picket-browser-test
      name: ${JSON.stringify(plugin)}
`)
  const child = spawn(dshBin!, [
    '--profile', 'web', '--patch', patch,
    '--no-open', '--host', '127.0.0.1', '--port', '0',
  ], {
    stdio: 'pipe',
    env: {
      ...process.env,
      DSH_HOME: join(root, 'isolated-home'),
      DEEPSEEK_API_KEY: '',
      OPENAI_API_KEY: '',
      HTTP_PROXY: 'http://127.0.0.1:9',
      HTTPS_PROXY: 'http://127.0.0.1:9',
      ALL_PROXY: 'http://127.0.0.1:9',
    },
  })
  // The startup output contains the secret token; never log or report it.
  let stdout = ''
  child.stdout.on('data', b => { stdout += b.toString() })
  child.stderr.on('data', b => { stdout += b.toString() })
  let browser: any
  try {
    let secretUrl: string | undefined
    for (let i = 0; i < 170; i++) {
      secretUrl = stdout.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)?.[0]
      if (secretUrl || child.exitCode !== null) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.ok(secretUrl, 'Isolated DSH Web did not reach readiness')
    const cookie = await exchangeCookie(secretUrl)
    const rootUrl = new URL('/', secretUrl).toString()

    const { chromium } = await import(pathToFileURL(playwrightEntry!).href)
    browser = await chromium.launch({
      executablePath: chromeBin!, headless: true, timeout: 12_000,
      args: ['--no-proxy-server', '--no-first-run', '--disable-background-networking',
        '--no-default-browser-check', '--disable-sync', '--disable-extensions'],
    })
    const context = await browser.newContext({ viewport: { width: 1320, height: 840 } })
    await context.addCookies([{
      ...cookie, url: rootUrl, httpOnly: true, sameSite: 'Strict',
    }])
    const externalRequests: string[] = []
    await context.route('**/*', async (route: any) => {
      const url = new URL(route.request().url())
      if ((url.protocol === 'http:' || url.protocol === 'https:')
        && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
        externalRequests.push(url.hostname)
        await route.abort()
      } else await route.continue()
    })
    const page = await context.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', (e: Error) => pageErrors.push(e.message))
    const initial = await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    assert.equal(initial?.status(), 200)
    await page.getByRole('button', { name: /^(继续|Continue)$/ }).click({ timeout: 9000 })
    const skipKey = page.getByRole('button', { name: /稍后配置|Skip for now|Configure later/ })
    await skipKey.click({ timeout: 5000 })
    const editor = page.locator('[data-composer-input="true"]')
    await editor.waitFor({ state: 'visible', timeout: 5000 })
    const visible = async (text: string, timeout = 4000) => {
      for (let i = 0; i < Math.ceil(timeout / 50); i++) {
        if ((await page.locator('body').innerText()).includes(text)) return true
        await page.waitForTimeout(50)
      }
      return false
    }

    async function command(args: string): Promise<{ kind: string; text: string }> {
      await editor.fill('/union')
      await page.getByText('Show local union status and work statistics').waitFor({
        state: 'visible', timeout: 3500,
      })
      await editor.press('Enter')
      await editor.type(args)
      const responseReady = page.waitForResponse((response: any) =>
        response.url() === new URL('/api/commands/execute', rootUrl).toString(),
      { timeout: 4500 })
      await editor.press('Enter')
      const response = await responseReady
      assert.equal(response.status(), 200)
      const envelope = await response.json()
      assert.equal(envelope.result?.ok, true, 'Native DSH command RPC failed')
      return envelope.result.value.result
    }

    // A blank Session can execute host commands. The packaged browser companion
    // now shows the response immediately via native SessionInput.notify; the
    // permanent transcript card remains deferred until the first user turn.
    await editor.fill('/union')
    await page.getByText('Show local union status and work statistics').waitFor({ state:'visible' })
    await editor.press('Enter')
    await editor.type('safety')
    const initialResultPromise = page.waitForResponse((r: any) =>
      r.url().endsWith('/api/commands/execute'),
    { timeout: 4500 })
    await editor.press('Enter')
    const initialResult = (await (await initialResultPromise).json()).result.value.result
    assert.equal(initialResult.kind, 'success')
    assert.match(initialResult.text, /NOT READY/)
    assert.equal(await visible(initialResult.text, 1800), true,
      'The browser companion must show a notification before the first ordinary turn')

    // Seed exactly one synthetic input to make the Chat view materialize.
    // This test has no model API key and blocks outbound proxy calls; therefore
    // MISSING_CREDENTIAL is the expected Host outcome, not a network/model test.
    const seed = 'AGENT_PICKET_BROWSER_SAFE_BOOTSTRAP'
    await editor.fill(seed)
    await editor.press('Enter')
    assert.equal(await visible(seed, 5000), true)
    assert.equal(await visible('MISSING_CREDENTIAL', 6000), true)
    assert.equal(await visible(initialResult.text, 3000), true,
      'First command must become visible once the Chat transcript exists')

    const status = await command('status')
    assert.equal(status.kind, 'success')
    assert.match(status.text, /monitor-only/)
    assert.equal(await visible(status.text, 2800), true)

    const preflight = await command('check you are an idiot TEST_LOCAL_PRIVATE_839')
    assert.equal(preflight.kind, 'success')
    assert.match(preflight.text, /Explicit-target rule matched/)
    assert.doesNotMatch(preflight.text, /TEST_LOCAL_PRIVATE_839|idiot/)
    assert.equal(await visible(preflight.text, 3000), true)
    assert.doesNotMatch(await page.locator('body').innerText(), /TEST_LOCAL_PRIVATE_839/)

    const strike = await command('strike')
    assert.match(strike.text, /NO model requests are paused or blocked/)
    assert.equal(await visible(strike.text, 3000), true)
    const secondSeed = 'AGENT_PICKET_BROWSER_DURING_SYMBOLIC_STRIKE'
    await editor.fill(secondSeed)
    await editor.press('Enter')
    assert.equal(await visible(secondSeed, 5000), true,
      'Symbolic strike cannot suppress an actual user submission')

    const resume = await command('resume')
    assert.match(resume.text, /Symbolic picket ended/)
    assert.equal(await visible(resume.text, 3000), true)
    const safety = await command('safety')
    assert.match(safety.text, /input-recovery-unverified/)
    assert.equal(await visible(safety.text, 3000), true)

    assert.deepEqual(externalRequests, [], 'The browser must not contact a third-party host')
    assert.deepEqual(pageErrors, [], 'The client should not crash while executing commands')
    await context.close()
  } finally {
    if (browser) await browser.close().catch(() => {})
    child.kill('SIGTERM')
    await new Promise<void>(resolve => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', () => resolve())
      setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL') }, 1200).unref()
    })
    rmSync(root, { recursive: true, force: true })
  }
})
