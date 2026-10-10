import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// Real Host tests must NEVER leave synthetic test-session statistics in the
// developer's normal profile. Disable default persistence for the suite;
// the dedicated dsh-durable.real.test.ts re-enables it in its own disposable
// stats directory, verifying production defaults via genuine Cordis.
const root = fileURLToPath(new URL('..', import.meta.url))
const paths = readdirSync(join(root, 'tests'))
  .filter(name => /^dsh.*\.real\.test\.ts$/.test(name))
  .sort()
  .map(name => join(root, 'tests', name))
if (paths.length < 1) throw new Error('Real DSH test files not found')
const child = spawn(process.execPath, ['--experimental-strip-types', '--test', ...paths], {
  cwd: root,
  env: { ...process.env, AGENT_PICKET_STATS: 'off' },
  stdio: 'inherit',
})
child.on('error', error => {
  process.stderr.write('Could not start DSH integration tests: ' + error.message + '\n')
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  if (signal) process.exitCode = 1
  else process.exitCode = code ?? 1
})
