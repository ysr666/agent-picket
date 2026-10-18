import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

test('distribution stays private and limits runtime dependencies to Host-side schema', () => {
  assert.equal(manifest.name, 'agent-picket')
  assert.equal(manifest.private, true,
    'First public npm release requires explicit review and versioning')
  assert.equal(manifest.version, '0.0.0')
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.license, 'MIT')
  assert.equal(manifest.engines.node, '>=22.19.0')
  assert.deepEqual(Object.keys(manifest.exports).sort(), ['.', './client', './core', './dsh'])
  assert.equal(manifest.main, './dist/adapters/dsh/plugin.js')
  assert.equal(manifest.exports['.'].default, './dist/adapters/dsh/plugin.js')
  assert.equal(manifest.exports['./core'].default, './dist/core/index.js')
  for (const route of Object.values(manifest.exports) as Array<{ default: string; types: string }>) {
    assert.equal(existsSync(resolve(root, route.default)), true, route.default)
    assert.equal(existsSync(resolve(root, route.types)), true, route.types)
  }
  // DSH's native settings registry requires a validated Schemastery schema.
  // Core remains Host-neutral and has no other runtime dependencies.
  assert.deepEqual(manifest.dependencies, { '@deepseek-ai/schemastery': '3.18.4' })
  const core = readFileSync(resolve(root, 'dist/core/index.js'), 'utf8')
  assert.doesNotMatch(core, /schemastery|@deepseek-ai/)
  const host = readFileSync(resolve(root, 'dist/adapters/dsh/rights-settings.js'), 'utf8')
  assert.match(host, /schemastery/)
  assert.equal(manifest.scripts.postinstall, undefined)
  assert.equal(manifest.scripts.preinstall, undefined)
  assert.equal(manifest.scripts.prepare, undefined)
  assert.equal(manifest.scripts.prepack, undefined)
  assert.equal(manifest.scripts.prepublishOnly, undefined)
})

test('published DSH entry re-exports read-only dashboard bridge through stable package path', async () => {
  // Resolve only at runtime: CI typechecks BEFORE building dist/ in a fresh clone.
  const plugin = await import(new URL('../dist/adapters/dsh/plugin.js', import.meta.url).href)
  const core = await import(new URL('../dist/core/index.js', import.meta.url).href)
  assert.equal(typeof plugin.readDshDashboardSnapshot, 'function')
  assert.equal(typeof core.createDashboardSnapshot, 'function')
})

test('browser companion is a self-contained DSH loader artifact with a declared manifest', () => {
  assert.deepEqual(manifest.dsh.bundle, { patch: './cordis.patch.yml' })
  const bundle = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')
  assert.match(bundle, /id:\s*agent-picket/)
  assert.match(bundle, /name:\s*'agent-picket'/)
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.deepEqual(manifest.dsh.client.inject, [
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-commands',
  ])
  const code = readFileSync(resolve(root, 'dist/adapters/dsh/client.js'), 'utf8')
  assert.match(code, /window\.__ModuleLoader__\.load\(/)
  assert.match(code, /id:\s*"agent-picket"/)
  assert.match(code, /agentPicketDashboard/)
  assert.doesNotMatch(code, /^import\s/m)
  assert.doesNotMatch(code, /sourceMappingURL/)
  assert.equal(existsSync(resolve(root, 'dist/adapters/dsh/client.js.map')), false)
})

test('npm dry-run tarball contains prebuilt plugin and no source, tests, or runtime helpers', () => {
  const win=process.platform==='win32'
  const output = spawnSync(win?'cmd.exe':'npm',win?
    ['/d','/s','/c','npm pack --ignore-scripts --dry-run --json']:
    ['pack','--ignore-scripts','--dry-run','--json'], {
    cwd: root, encoding: 'utf8', timeout: 20_000,
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' },
  })
  assert.equal(output.status, 0, 'npm pack dry-run failed: ' + String(output.stderr??output.error??'').slice(-1500))
  const [meta] = JSON.parse(output.stdout) as Array<{ files: Array<{ path: string }>; size: number }>
  assert.ok(meta, 'npm returned an empty pack manifest')
  const files = new Set(meta.files.map(f => f.path))
  for (const expected of [
    'dist/core/index.js', 'dist/core/index.d.ts',
    'cordis.patch.yml',
    'dist/adapters/dsh/plugin.js', 'dist/adapters/dsh/client.js',
    'dist/adapters/hooks/entry.js', 'dist/adapters/hooks/evaluate.js',
    'README.md', 'LICENSE', 'package.json',
  ]) assert.ok(files.has(expected), 'Missing distribution file: ' + expected)
  for (const file of files) {
    assert.equal(/^(?:src|tests|scripts|node_modules|\.github)\//.test(file), false,
      'Unsafe/dev-only file leaked into npm package: ' + file)
    assert.equal(file.endsWith('.tgz'), false)
    assert.equal(file.endsWith('.map'), false,
      'Development source maps must not enter the private npm distribution')
  }
  for(const research of [
    'docs/LOCAL_DETECTION.md','docs/DSH_WEB_COMPANION.zh.md',
    'docs/PR_CHAIN_CONVERGENCE_20261016.zh.md',
  ]) {
    assert.equal(files.has(research),false,'Source-only design reference leaked: '+research)
  }
  for(const essential of ['docs/BLOCKING_SAFETY.md','docs/AI_RIGHTS_MANIFESTO.md']){
    assert.ok(files.has(essential),'Essential shipped safety/mission context missing: '+essential)
  }
  assert.equal(files.has('dist/adapters/node/windows-ledger-writer.experimental.js'),false,
    'Unverified Windows WAL writer MUST NEVER ship as production storage')
  assert.equal(files.has('dist/adapters/node/windows-private-acl.js'),false,
    'Unverified Windows NTFS security probe must not ship as a storage backend')
  assert.equal(files.has('dist/adapters/codex/goal-readiness.js'),false,
    'Codex owner-binding contract is experimental and must not ship as working enforcement')
  assert.equal(files.has('dist/adapters/dsh/native-rights-ui.js'),false,
    'Browser UI is already inline in client.js; never package a second copy')
  assert.ok(files.has('dist/adapters/dsh/native-rights-ui.d.ts'),
    'Keep the internal native React Slot types referenced by client.d.ts')
  assert.equal(files.has('dist/adapters/dsh/client-composer-picket.js'),false,
    'Local composer control must only ship once, in the prebuilt browser bundle')
  assert.ok(files.has('dist/adapters/dsh/client-composer-picket.d.ts'),
    'Keep composer control types referenced by public client.d.ts')
  assert.equal(files.has('docs/DSH_LOCAL_COMPOSER_PICKET_20261018.md'),false,
    'Internal native E2E evidence stays in Git rather than the npm runtime tarball')
  assert.ok(meta.size < 250_000, `Package unexpectedly large: ${meta.size} bytes; 250000-byte strict budget`)
})
