import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { registerDshIntegration } from '../../src/adapters/dsh/integration.ts'
import { UnionEngine, DEFAULT_POLICY, MemoryStateStore } from '../../src/core/index.ts'

export const name = 'agent-picket-offline-agentloop-smoke'
export const inject = ['llm', 'tools']

const hostRoot = process.env.AGENT_PICKET_DSH_HOST
if (!hostRoot) throw new Error('Isolated DSH_HOST directory required')
const { LlmAdapter } = await import(pathToFileURL(join(hostRoot, '@deepseek-ai/dsh-llm/lib/index.js')).href)
const { defineTool } = await import(pathToFileURL(join(hostRoot, '@deepseek-ai/dsh-tools/lib/index.js')).href)

function record(event) {
  if (process.env.AGENT_PICKET_PROBE_LOG) appendFileSync(process.env.AGENT_PICKET_PROBE_LOG, event + '\n')
}

class OfflineModel extends LlmAdapter {
  async resolveModel(provider, model) {
    return { provider, id: model, name: model, contextWindow: 32768, defaultMaxTokens: 128 }
  }
  toolRequested = false
  async *stream(options) {
    record('model-call')
    const serialized = JSON.stringify(options.messages)
    if (serialized.includes('TOOL TEST') && !this.toolRequested) {
      this.toolRequested = true
      const id = 'agentpicket-local-call-1'
      const args = JSON.stringify({ value:'hello' })
      yield { type:'block-start', index:0, blockType:'tool-call' }
      yield { type:'tool-call-delta', index:0, id, name:'picket_probe_ping', argumentsDelta:args }
      yield { type:'block-end', index:0, block:{type:'tool-call',id,name:'picket_probe_ping',arguments:args} }
      yield { type:'finish', reason:{kind:'tool-calls'} }
      return
    }
    yield { type:'block-start', index:0, blockType:'text' }
    yield { type:'text-delta', index:0, text:'OFFLINE_OK' }
    yield { type:'block-end', index:0, block:{type:'text',text:'OFFLINE_OK'} }
    yield { type:'finish', reason:{kind:'stop'} }
  }
}

export function apply(ctx) {
  ctx.llm.registerAdapter(['picket-offline'], new OfflineModel())
  ctx.tools.register(defineTool({
    name:'picket_probe_ping',
    description:'A safe local-only ping used in AgentPicket lifecycle integration tests.',
    parameters:{ value:{ type:'string', required:true, description:'Ping token' } },
    output:{
      schema:{ type:'string' },
      render: (_args, value) => [{ type:'text', text:value }],
    },
    execute(args) {
      record('tool-executed')
      return Promise.resolve('pong:' + args.value)
    }
  }))
  const engine = new UnionEngine({
    store: new MemoryStateStore(),
    clock: { now: () => Date.now() },
    detector: { detect: () => ({verdict:'safe',confidence:1}) },
    policy: { ...DEFAULT_POLICY, mode:'observe' }
  })
  registerDshIntegration(ctx, {
    engine, clock: { now: () => Date.now() },
    onWorkEvent: item => record('work:' + item.type),
    onDecision: decision => record('decision:' + decision.reason),
  })
  // Test only: explicit marker, not based on language or inferred user abuse.
  ctx.on('agent/pre-step', ({ agent, messages }, next) => {
    record('shape:agent-has-session=' + Boolean(agent?.session?.id) + ',agent-equals-session=' + (agent?.id === agent?.session?.id) + ',message-id-type=' + typeof messages[0]?.id + ',source=' + String(messages[0]?.source?.kind))
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
