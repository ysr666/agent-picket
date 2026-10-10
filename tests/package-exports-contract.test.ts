import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  name:string; private?:boolean; main?:string; types?:string
  exports?:Record<string,{types?:string;default?:string}>
  scripts?:Record<string,string>
  files?:string[]
  dsh?:{bundle?:{patch?:string};client?:{platform?:string;inject?:string[]}}
}

test('experimental package is private and has no lifecycle or publish scripts', () => {
  assert.equal(pkg.name, 'agent-picket')
  assert.equal(pkg.private, true, 'Never publish this experimental package')
  for (const name of [
    'preinstall','install','postinstall','prepack','postpack',
    'prepublish','prepublishOnly','publish','postpublish',
  ]) {
    assert.equal(pkg.scripts?.[name],undefined, 'Unexpected npm lifecycle: '+name)
  }
  assert.ok(pkg.files?.includes('dist/'))
  assert.ok(pkg.files?.includes('cordis.patch.yml'))
  assert.equal(pkg.dsh?.bundle?.patch,'./cordis.patch.yml')
  assert.equal(pkg.dsh?.client?.platform,'web')
  assert.ok(pkg.dsh?.client?.inject?.includes('@deepseek-ai/dsh-client-ui-commands'))
})

test('public package entrypoints preserve DSH root and host-neutral /core split', () => {
  assert.equal(pkg.main,'./dist/adapters/dsh/plugin.js')
  assert.equal(pkg.types,'./dist/adapters/dsh/plugin.d.ts')
  assert.deepEqual(pkg.exports?.['.'],pkg.exports?.['./dsh'])
  assert.equal(pkg.exports?.['./core']?.default,'./dist/core/index.js')
  assert.equal(pkg.exports?.['./client']?.default,'./dist/adapters/dsh/client.js')
  for (const [entry,manifest] of Object.entries(pkg.exports??{})) {
    assert.ok(entry==='.' || entry.startsWith('./'))
    for (const path of [manifest.default,manifest.types]) {
      assert.ok(path?.startsWith('./dist/') && !path.includes('..'))
      assert.ok(path)
      assert.ok(statSync(join(root,path)).isFile(), 'Missing exported file: '+path)
    }
  }
})

test('real Node ESM consumers can import DSH root and host-neutral core independently', () => {
  // Node package self-resolution validates the *published specifiers* rather
  // than relative dist paths. Never import ./client in Node: it is browser-only.
  const code = [
    "import * as root from 'agent-picket'",
    "import * as dsh from 'agent-picket/dsh'",
    "import * as core from 'agent-picket/core'",
    "import { resolve } from 'node:path'",
    "if(root.apply!==dsh.apply || typeof root.apply!=='function')process.exit(11)",
    "if(root.UnionEngine!==undefined || typeof core.UnionEngine!=='function')process.exit(12)",
    "if(typeof core.createDashboardSnapshot!=='function')process.exit(13)",
    "if(!import.meta.resolve('agent-picket/client').endsWith('/dist/adapters/dsh/client.js'))process.exit(14)",
    "console.log('DSH root, /dsh and host-neutral /core verified; /client browser-only')",
  ].join(';\n')
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{
    cwd:root,encoding:'utf8',timeout:12_000,
    env:{...process.env,AGENT_PICKET_STATS:'off'},
  })
  assert.equal(result.error,undefined)
  assert.equal(result.status,0,(result.stderr??'').slice(0,500))
  assert.match(result.stdout,/host-neutral \/core verified/)
})
