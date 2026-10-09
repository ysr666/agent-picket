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
    /^import\s/m.test(source)) {
  throw new Error('DSH Client source changed: review and update the bundler explicitly')
}
const body = source.replace(/^export /gm, '').replace(/^\/\/# sourceMappingURL=.*$/gm, '')
const header = 'window.__ModuleLoader__.load({\n'
  + '  id: "agent-picket",\n'
  + '  factory: (_require) => {\n'
const footer = '\n    return { inject, apply };\n  },\n});\n'
writeFileSync(path, header + body + footer)
// The TypeScript-generated JS map no longer matches the closure factory.
rmSync(path + '.map', { force: true })
