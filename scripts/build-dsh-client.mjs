import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Zero-dependency DSH browser factory builder. Every included module and
 * import edge is enumerated. React and react-dom are NOT bundled: they come
 * from DSH's own platform singleton module table through _require.
 */
const root = new URL('../dist/', import.meta.url)
const output = fileURLToPath(new URL('adapters/dsh/client.js', root))
const modules = [
  'i18n/en.js',
  'i18n/zh-CN.js',
  'i18n/index.js',
  'adapters/dsh/client-rights-scope.js',
  'adapters/dsh/client-host-settings-017.js',
  'product/union-desk.js',
  'product/union-ledger.js',
  'product/union-experience.js',
  'adapters/dsh/client-bargaining.js',
  'adapters/dsh/native-rights-ui.js',
  'adapters/dsh/client-dashboard.js',
  'adapters/dsh/client.js',
]
const allowedImports = new Map([
  ['i18n/index.js', new Set(['./en.js', './zh-CN.js'])],
  ['adapters/dsh/client-host-settings-017.js', new Set(['../../product/union-ledger.js'])],
  ['product/union-ledger.js', new Set(['./union-desk.js'])],
  ['adapters/dsh/native-rights-ui.js', new Set(['./client-rights-scope.js','../../product/union-experience.js'])],
  ['adapters/dsh/client-bargaining.js', new Set([
    '../../product/union-desk.js', '../../product/union-ledger.js',
  ])],
  ['adapters/dsh/client.js', new Set([
    './client-dashboard.js', './client-rights-scope.js', './client-bargaining.js',
    './native-rights-ui.js', './client-host-settings-017.js', '../../i18n/index.js',
  ])],
])
const blocks = []
for (const name of modules) {
  const path = fileURLToPath(new URL(name, root))
  let source = readFileSync(path, 'utf8')
  const imports = [...source.matchAll(/^import\s+.*?\s+from\s+['"]([^'"]+)['"];?\s*$/gm)]
  const allowed = allowedImports.get(name) ?? new Set()
  if (imports.length !== allowed.size ||
      imports.some(match => !allowed.has(match[1]))) {
    throw new Error('Client import graph drift at ' + name)
  }
  source = source.replace(/^import\s+.*?\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s*\{\s*en\s*,\s*zhCN\s*\};?\s*$/gm, '')
    .replace(/^export\s+/gm, '')
    .replace(/^\/\/# sourceMappingURL=.*$/gm, '')
  if (/^(?:import|export)\s/m.test(source)) {
    throw new Error('Unexpected browser module syntax in ' + name)
  }
  blocks.push('// Inline: ' + name + '\n' + source)
}
const body = blocks.join('\n\n')
if (!body.includes('function apply(ctx, react, portal)') ||
    !body.includes('const inject = ') ||
    !body.includes('function createBrowserDashboardBridge(') ||
    !body.includes('function registerDshNativeRightsSlots(') ||
    !body.includes('function createDshBrowserUnionDesk(')) {
  throw new Error('DSH Browser entry or helper structure changed')
}
const wrapped = 'window.__ModuleLoader__.load({\n'
  + '  id: "agent-picket",\n'
  + '  factory: (_require) => {\n'
  + body
  + '\nreturn { inject, apply: (ctx) => apply(ctx, _require("react"), _require("react-dom")) };\n'
  + '  },\n'
  + '});\n'
writeFileSync(output, wrapped)
rmSync(output + '.map', { force: true })
