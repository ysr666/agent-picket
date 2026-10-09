import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const executable = process.env.AGENT_PICKET_DSH_BIN
const profile = 'sdk-minimal'

test('isolated DSH SDK Profile boots the real AgentPicket adapter via --patch', {
  skip: !executable && 'Supply AGENT_PICKET_DSH_BIN to run the isolated Profile smoke test',
  timeout: 15_000,
}, async () => {
  const work = mkdtempSync(join(tmpdir(), 'agent-picket-dsh-smoke-'))
  const home = join(work, 'dsh-home')
  const sentinel = join(work, 'adapter-loaded.txt')
  const patch = join(work, 'smoke.patch.yml')
  const entry = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dsh-smoke.mjs')
  // No permanent profiles and no package installation outside the temporary directory.
  writeFileSync(patch, `- insert:
    - id: agent-picket-isolated-smoke
      name: ${JSON.stringify(entry)}
`)
  const stdout: string[] = []
  const stderr: string[] = []
  const child = spawn(executable!, [
    '--profile', profile, '--patch', patch,
  ], {
    env: {
      ...process.env,
      DSH_HOME: home,
      AGENT_PICKET_SPIKE_FILE: sentinel,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (b: Buffer) => { stdout.push(b.toString()) })
  child.stderr.on('data', (b: Buffer) => { stderr.push(b.toString()) })

  let exitCode: number | null = null
  child.on('exit', code => { exitCode = code })
  try {
    for (let i = 0; i < 100; i++) {
      if (existsSync(sentinel) || exitCode !== null) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.equal(existsSync(sentinel), true,
      `Adapter was not loaded; runtime exit=${exitCode}, stderr=${stderr.join('').slice(-600)}`)
    assert.equal(readFileSync(sentinel, 'utf8').trim(), 'agent-picket-adapter-loaded')
    assert.equal(exitCode, null, `DSH SDK Profile exited unexpectedly: ${stderr.join('').slice(-600)}`)
  } finally {
    child.kill('SIGTERM')
    await new Promise<void>(resolve => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', () => resolve())
      setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL') }, 1000).unref()
    })
    rmSync(work, { recursive: true, force: true })
  }
})
