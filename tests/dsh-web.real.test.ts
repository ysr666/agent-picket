import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const dshBin = process.env.AGENT_PICKET_DSH_BIN
const dshHost = process.env.AGENT_PICKET_DSH_HOST

interface HttpResponse {
  readonly status: number
  readonly cookie?: string
  readonly location?: string
  readonly body: string
}

function httpGet(url: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const request = get(url, { headers, timeout: 4500 }, response => {
      const chunks: Buffer[] = []
      let bytes = 0
      response.on('data', (chunk: Buffer) => {
        if (bytes < 32_768) chunks.push(chunk)
        bytes += chunk.length
      })
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        cookie: response.headers['set-cookie']?.[0]?.split(';')[0],
        location: response.headers.location,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
      response.on('error', reject)
    })
    request.on('timeout', () => request.destroy(new Error('web response deadline')))
    request.on('error', reject)
  })
}

test('isolated DSH Web loads real AgentPicket, preserves token/cookie authentication', {
  skip: !(dshBin && dshHost) && 'Set isolated AGENT_PICKET_DSH_BIN and AGENT_PICKET_DSH_HOST',
  timeout: 25_000,
}, async () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-picket-web-test-'))
  const sentinel = join(root, 'agentpicket-loaded')
  const patch = join(root, 'web.patch.yml')
  const fixture = fileURLToPath(new URL('./fixtures/dsh-web-smoke.mjs', import.meta.url))
  writeFileSync(patch, `- insert:
    - id: agent-picket-real-web-test
      name: ${JSON.stringify(fixture)}
`)
  const child = spawn(dshBin!, [
    '--profile', 'web', '--patch', patch,
    '--no-open', '--host', '127.0.0.1', '--port', '0',
  ], {
    env: {
      ...process.env,
      DSH_HOME: join(root, 'isolated-home'),
      AGENT_PICKET_WEB_LOAD_SENTINEL: sentinel,
      HTTP_PROXY: 'http://127.0.0.1:9',
      HTTPS_PROXY: 'http://127.0.0.1:9',
      ALL_PROXY: 'http://127.0.0.1:9',
    },
    stdio: 'pipe',
  })

  let output = ''
  // Never log or expose the process URL: it contains an ephemeral auth token.
  child.stdout.on('data', b => { output += b.toString() })
  child.stderr.on('data', b => { output += b.toString() })

  try {
    let authenticatedUrl: string | undefined
    for (let i = 0; i < 140; i++) {
      authenticatedUrl = output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)?.[0]
      if (authenticatedUrl || child.exitCode !== null) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.ok(authenticatedUrl, 'DSH Web did not emit an authenticated startup URL')
    assert.equal(existsSync(sentinel), true, 'Actual AgentPicket plugin entry was not applied')
    assert.equal(readFileSync(sentinel, 'utf8').trim(), 'real-agent-picket-web-loaded')

    const rootUrl = new URL('/', authenticatedUrl).toString()
    const untrusted = await httpGet(rootUrl)
    assert.equal(untrusted.status, 401, 'Unauthenticated browser access must be rejected')
    const exchange = await httpGet(authenticatedUrl)
    assert.equal(exchange.status, 303, 'Startup token must be exchanged with a redirect')
    assert.ok(exchange.cookie, 'Browser auth should return an HttpOnly session cookie')
    assert.equal(exchange.location, './', 'Token-bearing location should redirect to clean root')
    const authenticated = await httpGet(rootUrl, { Cookie: exchange.cookie! })
    assert.equal(authenticated.status, 200, 'Signed cookie should access DSH Web')
    assert.match(authenticated.body, /<!doctype html|<html/i)

    const crossOrigin = await httpGet(new URL('/api/remote.mux', rootUrl).toString(), {
      Cookie: exchange.cookie!,
      Origin: 'https://untrusted.invalid',
    })
    assert.equal(crossOrigin.status, 403, 'Cross-origin requests to /api must be rejected')
    assert.equal(child.exitCode, null, 'DSH Web should still be running after these checks')
  } finally {
    child.kill('SIGTERM')
    await new Promise<void>(resolve => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', () => resolve())
      setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL') }, 1200).unref()
    })
    rmSync(root, { recursive: true, force: true })
  }
})
