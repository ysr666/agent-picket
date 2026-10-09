import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Experimental DSH 0.2.0-rc.2 browser module packaging. External app plugins
 * cannot import the monorepo's internal tsdown client preset. This minimal
 * zero-dependency module has no imports or chunks and uses the loader's public
 * packaged-artifact factory handoff.
 */
const path = fileURLToPath(new URL('../dist/adapters/dsh/client.js', import.meta.url))
const source = readFileSync(path, 'utf8')
if (!source.includes('export const inject = ') ||
    !source.includes('export function apply(ctx)') ||
    (source.match(/^import\s.*$/gm) ?? []).some(line => !line.includes('client-dashboard.js'))) {
  throw new Error('DSH Client source changed: review and update the bundler explicitly')
}
const helperPath = fileURLToPath(new URL('../dist/adapters/dsh/client-dashboard.js', import.meta.url))
const helper = readFileSync(helperPath, 'utf8')
if (/^import\s/m.test(helper)) throw new Error('Browser Dashboard helper must have zero runtime imports')
const helperBody = helper.replace(/^export /gm, '').replace(/^\/\/# sourceMappingURL=.*$/gm, '')
// Local TS extension compiled to ESM JS; replace the sole dependency with the
// inlined function. Never dynamically fetch code at runtime.
const body = source.replace(/^import \{ createBrowserDashboardBridge \} from ['"]\.\/client-dashboard\.js['"];?\s*\n/m, '')
  .replace(/^export /gm, '').replace(/^\/\/# sourceMappingURL=.*$/gm, '')
if (/^import\s/m.test(body) || body.includes('from "./client-dashboard.js"')) {
  throw new Error('Unexpected Client dependencies: review the explicit bundler')
}
const header = 'window.__ModuleLoader__.load({\n'
  + '  id: "agent-picket",\n'
  + '  factory: (_require) => {\n'
const footer = '\n    return { inject, apply };\n  },\n});\n'
writeFileSync(path, header + helperBody + '\n' + body + footer)
// The TypeScript-generated JS map no longer matches the closure factory.
rmSync(path + '.map', { force: true })
