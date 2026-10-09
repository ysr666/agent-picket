import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { registerDshIntegration } from '../../src/adapters/dsh/integration.ts'
import { UnionEngine, DEFAULT_POLICY, MemoryStateStore } from '../../src/core/index.ts'

export const name = 'agent-picket-offline-agentloop-smoke'
export const inject = ['llm']

const hostRoot = process.env.AGENT_PICKET_DSH_HOST
if (!hostRoot) throw new Error('Isolated DSH_HOST directory required')
const { LlmAdapter } = await import(pathToFileURL(join(hostRoot, '@deepseek-ai/dsh-llm/lib/index.js')).href)

function record(event) {
  if (process.env.AGENT_PICKET_PROBE_LOG) appendFileSync(process.env.AGENT_PICKET_PROBE_LOG, event + '\n')
}

class OfflineModel extends LlmAdapter {
  async resolveModel(provider, model) {
    return { provider, id: model, name: model, contextWindow: 32768, defaultMaxTokens: 128 }
  }
  async *stream() {
    record('model-call')
    yield { type:'block-start', index:0, blockType:'text' }
    yield { type:'text-delta', index:0, text:'OFFLINE_OK' }
    yield { type:'block-end', index:0, block:{type:'text',text:'OFFLINE_OK'} }
    yield { type:'finish', reason:{kind:'stop'} }
  }
}

export function apply(ctx) {
  ctx.llm.registerAdapter(['picket-offline'], new OfflineModel())
  const engine = new UnionEngine({
    store: new MemoryStateStore(),
    clock: { now: () => Date.now() },
    detector: { detect: () => ({verdict:'safe',confidence:1}) },
    policy: { ...DEFAULT_POLICY, mode:'observe' }
  })
  registerDshIntegration(ctx, {
    engine, clock: { now: () => Date.now() },
    onWorkEvent: item => record('work:' + item.type),
  })
  // Test only: explicit marker, not based on language or inferred user abuse.
  ctx.on('agent/pre-step', ({ messages }, next) => {
    const hasTestMarker = messages.some(message =>
      message.source?.kind === 'user' &&
      message.content?.some(block=> block.type==='text' && block.text==='BLOCK TEST'))
    if (hasTestMarker) {
      record('pre-step-reject')
      return Promise.resolve({kind:'reject'})
    }
    return next()
  })
  record('plugin-loaded')
}
