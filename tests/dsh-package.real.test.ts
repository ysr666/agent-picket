import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createInterface } from 'node:readline'
import test from 'node:test'

const hostModules = process.env.AGENT_PICKET_DSH_HOST
const dshBin = process.env.AGENT_PICKET_DSH_BIN
const ready = Boolean(hostModules && dshBin)
const projectRoot = resolve(import.meta.dirname, '..')

function npm(args: string[], cwd: string): string {
  const run = spawnSync('npm', args, {
    cwd, encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' },
  })
  assert.equal(run.error, undefined, `npm error: ${run.error?.message}`)
  assert.equal(run.status, 0, `npm ${args.join(' ')} failed\n${run.stderr}\n${run.stdout}`)
  return run.stdout
}

/** Real package packing + fresh offline install + native Cordis command execution. */
test('distribution tarball installs offline and loads the compiled DSH plugin without TS source', {
  skip: !ready && 'Set isolated AGENT_PICKET_DSH_HOST',
  timeout: 30_000,
}, async () => {
  const temp = mkdtempSync(join(tmpdir(), 'agent-picket-archive-'))
  const runtime = join(temp, 'runtime')
  try {
    npm(['run', 'build'], projectRoot)
    const manifestText = npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temp], projectRoot)
    const manifest = JSON.parse(manifestText) as Array<{
      filename: string
      files: Array<{ path: string }>
    }>
    const files = manifest[0]?.files.map(x => x.path) ?? []
    const archive = join(temp, manifest[0]!.filename)
    assert.equal(existsSync(archive), true)
    assert.ok(files.includes('dist/adapters/dsh/plugin.js'))
    assert.ok(files.includes('dist/adapters/dsh/client.js'))
    assert.ok(files.includes('dist/core/engine.js'))
    assert.ok(!files.some(x => x.includes('node_modules/') || x.startsWith('tests/')
      || x.startsWith('src/') || x.startsWith('scripts/')))
    npm(['install', '--prefix', runtime, '--offline', '--ignore-scripts',
      '--no-audit', '--no-fund', archive], temp)

    const installed = join(runtime, 'node_modules', 'agent-picket')
    assert.equal(existsSync(join(installed, 'dist', 'adapters', 'dsh', 'plugin.js')), true)
    assert.equal(existsSync(join(installed, 'src')), false)
    assert.equal(existsSync(join(installed, 'tests')), false)
    assert.equal(readdirSync(join(installed, 'dist', 'adapters', 'dsh'))
      .some(x => x === 'plugin.ts'), false)
    const installedManifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'))
    assert.equal(installedManifest.private, true)
    assert.equal(installedManifest.dsh.client.platform, 'web')
    assert.equal(installedManifest.exports['./client'].default, './dist/adapters/dsh/client.js')
    assert.match(readFileSync(join(installed, 'dist/adapters/dsh/client.js'), 'utf8'),
      /window\.__ModuleLoader__\.load/)
    assert.equal(existsSync(join(installed, 'dist/adapters/dsh/client.js.map')), false)

    const entry = await import(pathToFileURL(join(installed, 'dist', 'adapters', 'dsh', 'plugin.js')).href)
    assert.equal(entry.name, 'agent-picket')
    assert.equal(typeof entry.apply, 'function')

    const { Context } = await import(
      pathToFileURL(join(hostModules!, '@deepseek-ai/cordis/lib/index.js')).href
    )
    const commands = await import(
      pathToFileURL(join(hostModules!, '@deepseek-ai/dsh-commands/lib/index.js')).href
    )
    const ctx = new Context()
    const commandFiber = ctx.plugin(commands.default)
    const installedFiber = ctx.plugin({
      name: 'agent-picket-dist-smoke',
      apply(child: any) { entry.apply(child) },
    })
    try {
      let found = false
      const agent = {
        id: 'packed-agent',
        session: { id: 'packed-session', append(_type: string, _data: unknown) {} },
      }
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 5))
        if (ctx.commands.list(agent).some((x: { name: string }) => x.name === 'union')) {
          found = true
          break
        }
      }
      assert.equal(found, true, 'Compiled package must register a real DSH /union command')
      const result = await ctx.commands.execute(agent, '/union safety', [],
        new AbortController().signal)
      assert.equal(result?.result.kind, 'success')
      assert.match(result?.result.text ?? '', /NOT READY/)
      const check = await ctx.commands.execute(agent, '/union check you are a moron', [],
        new AbortController().signal)
      assert.equal(check?.result.kind, 'success')
      assert.match(check?.result.text ?? '', /Explicit-target rule matched/)
      const strike = await ctx.commands.execute(agent, '/union strike', [],
        new AbortController().signal)
      assert.match(strike?.result.text ?? '', /NO model requests are paused or blocked/)
      const decision = await ctx.waterfall('agent/pre-step', {
        agent, messages: [{ id: 'message', source: { kind: 'user' },
          content: [{ type: 'text', text: 'you are an idiot' }] }],
      }, async () => ({ kind: 'enter' }))
      assert.equal(decision.kind, 'enter')
    } finally {
      await installedFiber.dispose()
      await commandFiber.dispose()
    }

    // Verify the packaged JavaScript entry against the REAL DSH SDK loader,
    // not only against direct Cordis activation. No source TypeScript involved.
    const patchPath = join(temp, 'package.patch.yml')
    const callLog = join(temp, 'model-calls.log')
    const fakeProvider = resolve(projectRoot, 'tests/fixtures/offline-model-only.mjs')
    const packagedPlugin = join(installed, 'dist/adapters/dsh/plugin.js')
    writeFileSync(patchPath, `- insert:
    - id: agent-picket-packed-runtime
      name: ${JSON.stringify(packagedPlugin)}
    - id: agent-picket-packed-offline-provider
      name: ${JSON.stringify(fakeProvider)}
      inject:
        - llm
`)

    const sdk = spawn(dshBin!, [
      '--profile', 'sdk-minimal', '--patch', patchPath,
    ], {
      stdio: 'pipe',
      env: {
        ...process.env,
        DSH_HOME: join(temp, 'dsh-home'),
        AGENT_PICKET_DSH_HOST: hostModules!,
        AGENT_PICKET_PROVIDER_CALL_LOG: callLog,
        HTTP_PROXY: 'http://127.0.0.1:9',
        HTTPS_PROXY: 'http://127.0.0.1:9',
        ALL_PROXY: 'http://127.0.0.1:9',
      },
    })
    const notices: any[] = []
    const pending = new Map<number, (result: any) => void>()
    const sdkErrors: string[] = []
    const output = createInterface({ input: sdk.stdout })
    output.on('line', line => {
      try {
        const packet = JSON.parse(line)
        if (typeof packet.id === 'number') pending.get(packet.id)?.(packet)
        else notices.push(packet)
      } catch {
        sdkErrors.push('malformed packet')
      }
    })
    sdk.stderr.on('data', data => { sdkErrors.push(data.toString()) })
    async function request(id: number, method: string, params: object): Promise<any> {
      const result = new Promise(resolve => pending.set(id, resolve))
      sdk.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      return result
    }
    try {
      const initialized = await request(1, 'initialize', {
        cwd: temp, provider: 'picket-public-offline', model: 'offline-test',
      })
      assert.equal(initialized.error, undefined, sdkErrors.join(''))
      const prompt = await request(2, 'session/prompt', {
        sessionId: 'packed-dsh-integration',
        contentBlocks: [{ type: 'text', text: 'Please fix the failing unit tests.' }],
      })
      assert.equal(typeof prompt.result?.messageId, 'string')
      let completed = false
      for (let i = 0; i < 180; i++) {
        const turns = notices.filter(
          x => x.method === 'session.event' && x.params?.sessionId === 'packed-dsh-integration',
        ).map(x => x.params.event)
        const end = turns.find(x => x?.type === 'turn/end')
        if (end) {
          assert.equal(end.data.reason.kind, 'completed')
          assert.equal(turns.filter(x => x.type === 'assistant/message').length, 1)
          completed = true
          break
        }
        await new Promise(resolve => setTimeout(resolve, 40))
      }
      assert.equal(completed, true, 'Packaged DSH plugin must not break an offline prompt')
      assert.equal(readFileSync(callLog, 'utf8').trim(), 'model-call')
      const shutdown = await request(3, 'shutdown', {})
      assert.deepEqual(shutdown.result, {})
    } finally {
      output.close()
      if (sdk.exitCode === null) sdk.kill('SIGTERM')
      await new Promise<void>(resolve => {
        if (sdk.exitCode !== null) return resolve()
        sdk.once('exit', () => resolve())
        setTimeout(() => { if (sdk.exitCode === null) sdk.kill('SIGKILL') }, 1000).unref()
      })
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
