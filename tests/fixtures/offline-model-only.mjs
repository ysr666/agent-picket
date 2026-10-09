import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

// Test-only local fake provider: no network access, secrets or tools.
export const name = 'agent-picket-public-entry-offline-provider'
export const inject = ['llm']

const root = process.env.AGENT_PICKET_DSH_HOST
if (!root) throw new Error('AGENT_PICKET_DSH_HOST must point to the isolated DSH runtime')
const { LlmAdapter } = await import(pathToFileURL(join(root,'@deepseek-ai/dsh-llm/lib/index.js')).href)

class OfflineProvider extends LlmAdapter {
  async resolveModel(provider,model) {
    return {provider,id:model,name:model,contextWindow:32_768,defaultMaxTokens:128}
  }
  async *stream() {
    if(process.env.AGENT_PICKET_PROVIDER_CALL_LOG) {
      appendFileSync(process.env.AGENT_PICKET_PROVIDER_CALL_LOG,'model-call\n')
    }
    yield {type:'block-start',index:0,blockType:'text'}
    yield {type:'text-delta',index:0,text:'OFFLINE_OK'}
    yield {type:'block-end',index:0,block:{type:'text',text:'OFFLINE_OK'}}
    yield {type:'finish',reason:{kind:'stop'}}
  }
}
export function apply(ctx) {
  ctx.llm.registerAdapter(['picket-public-offline'],new OfflineProvider())
}
