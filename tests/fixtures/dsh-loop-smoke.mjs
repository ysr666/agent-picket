import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { registerDshIntegration } from '../../src/adapters/dsh/integration.ts'
import { UnionEngine, DEFAULT_POLICY, MemoryStateStore, WorkTracker, DetectionCounter, LocalRuleDetector } from '../../src/core/index.ts'

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
    // Observe only structural presence, never log prompt or attachment bytes.
    // A post-resume request must be newly submitted by the user.
    if(serialized.includes('ALLOW TEST')){
      record('resend-model-image='+/image|attachment/.test(serialized))
      record('resend-model-saw-blocked='+serialized.includes('BLOCK TEST'))
    }
    if(serialized.includes('NO IMAGE RESEND')){
      record('noimage-resend-saw-old-attachment='+/image|attachment/.test(serialized))
      record('noimage-resend-saw-old-text='+serialized.includes('BLOCK TEST'))
    }
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
  const detections = new DetectionCounter(new LocalRuleDetector())
  const engine = new UnionEngine({
    store: new MemoryStateStore(),
    clock: { now: () => Date.now() },
    detector: {
      detect(prompt) {
        const result = detections.detect(prompt)
        record('local-verdict:' + result.verdict)
        return result
      },
    },
    policy: { ...DEFAULT_POLICY, mode:'observe' }
  })
  // The real integration adapter owns pre-step. This synthetic receipt is
  // deliberately unavailable to the production plugin; it represents a
  // hypothetical separately verified Host grant AND user-visible notice.
  const deliberatelyRefused=new Set()
  registerDshIntegration(ctx, {
    // Isolated smoke test only. Production uses the *current official Host
    // settings* for this callback and remains OFF without an explicit opt-in.
    // Never make the real Adapter's default consent true to satisfy a test.
    getLaborRightsEnabled: () => process.env.AGENT_PICKET_TEST_LOCAL_CONSENT === 'on',
    getExplicitDiscardRefusal:sessionId=>
      process.env.AGENT_PICKET_TEST_LOCAL_CONSENT==='on' &&
      ['picket-offline-test-session','picket-discard-without-reupload']
        .includes(sessionId)&&!deliberatelyRefused.has(sessionId)
        ?{kind:'agent-picket-discard-refusal-v1',
          sessionId,hostAuthenticated:true,explicitConsent:true,
          active:true,visibleResendNotice:true,hostRevision:7}
        :null,
    onExplicitRefusal:sessionId=>{
      deliberatelyRefused.add(sessionId)
      record('pre-step-reject')
    },
    engine, clock: { now: () => Date.now() },
    tracker: new WorkTracker(),
    detections,
    onWorkEvent: item => record('work:' + item.type),
    onDecision: decision => record('decision:' + decision.reason),
  })
  record('plugin-loaded')
}
