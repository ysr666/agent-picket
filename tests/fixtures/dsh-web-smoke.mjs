import { writeFileSync } from 'node:fs'
import { apply as installRealAgentPicket } from '../../src/adapters/dsh/plugin.ts'

export const name = 'agent-picket-web-smoke'

export function apply(ctx) {
  // Native plugin still installs the FULL real AgentPicket monitor adapter.
  installRealAgentPicket(ctx)
  if (process.env.AGENT_PICKET_WEB_LOAD_SENTINEL) {
    writeFileSync(process.env.AGENT_PICKET_WEB_LOAD_SENTINEL, 'real-agent-picket-web-loaded\n')
  }
}
