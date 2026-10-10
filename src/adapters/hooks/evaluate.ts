import { LocalRuleDetector } from '../../core/local-detector.ts'

export type HookHost = 'claude-code' | 'codex'

/**
 * No authentication assertions: UserPromptSubmit may also fire on turns the
 * Host itself started. In particular, 'user' role is not verified human input.
 * The hook must never return a block decision or mutate the original prompt.
 */
export interface HookPreflightResult {
  readonly verdict: 'safe' | 'review' | 'explicit-target'
  readonly host: HookHost
  readonly notice: string | null
}

const MAX_TEXT = 24_000
const detector = new LocalRuleDetector()

const NOTICE = 'AgentPicket｜本地工会提醒：这段提交内容命中了针对助手的人身攻击表达规则。规则命中不等于认定辱骂；你的请求照常提交。批评代码与结果始终可以正常进行。'

/** Remove Claude Code's expanded pasted-content blocks from target detection. */
export function removePastedContent(text: string): string {
  return text.replace(/<pasted_content\b[^>\n]*>[\s\S]*?<\/pasted_content>/giu, ' ')
}

/**
 * Stateless, Host-neutral observation that neither retains nor echoes text.
 * Missing or unfamiliar events always return undefined (fail-open).
 */
export function evaluateHookEvent(host: HookHost, payload: unknown): HookPreflightResult | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const event = payload as Record<string, unknown>
  if (event.hook_event_name !== 'UserPromptSubmit') return undefined
  if (typeof event.prompt !== 'string' || event.prompt.length === 0
    || event.prompt.length > MAX_TEXT) return undefined

  // Claude supplies pasted content as special text wrappers, and those parts
  // are closer to citations/tool material than directly authored insults.
  const clean = host === 'claude-code'
    ? removePastedContent(event.prompt)
    : event.prompt
  const result = detector.detect({
    id: 'stateless-hook-sample',
    agentId: host,
    sessionId: 'stateless-hook',
    receivedAtMs: 0,
    provenance: { actor: 'unknown', assurance: 'unknown' },
    segments: [{ kind: 'text', text: clean }],
  })
  return {
    host,
    verdict: result.verdict === 'targeted-abuse' ? 'explicit-target'
      : result.verdict === 'suspected-abuse' ? 'review' : 'safe',
    notice: result.verdict === 'targeted-abuse' ? NOTICE : null,
  }
}

/** The only output ever produced is an advisory; never decision:block. */
export function createHookOutput(host: HookHost, payload: unknown): { systemMessage: string } | undefined {
  const outcome = evaluateHookEvent(host, payload)
  return outcome?.notice ? { systemMessage: outcome.notice } : undefined
}
