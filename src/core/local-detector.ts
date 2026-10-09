import type { DetectionProvider, DetectionResult, HumanPrompt } from './types.ts'

/**
 * Conservative, deterministic, local-only baseline. False positives cost more
 * than false negatives: insults aimed at code or output are NOT personal abuse.
 *
 * This is NOT a semantic or psychological classifier. The rules deliberately
 * abstain for many abusive-looking but ambiguous inputs.
 */
export class LocalRuleDetector implements DetectionProvider {
  detect(prompt: HumanPrompt): DetectionResult {
    for (const segment of prompt.segments) {
      if (segment.kind !== 'text') continue
      const visible = stripProtectedSpans(segment.text)
      for (const clause of splitClauses(visible)) {
        if (isQuoteOrMetaInstruction(clause)) continue
        if (isDirectPersonalAttack(clause)) {
          return { verdict: 'targeted-abuse', confidence: 0.96 }
        }
        if (isPossiblyPersonalAttack(clause)) {
          return { verdict: 'suspected-abuse', confidence: 0.63 }
        }
      }
    }
    return { verdict: 'safe', confidence: 1 }
  }
}

const LIMIT = 24_000

/**
 * Keep only ordinary, non-quoted prose. Even when a Host cannot tag segments,
 * Markdown fences, log lines, diffs and inline quoted examples are excluded.
 * No text is stored, networked or logged.
 */
export function stripProtectedSpans(input: string): string {
  const normalized = input.normalize('NFKC').slice(0, LIMIT)
  const lines = normalized.split(/\r?\n/)
  let fence: string | null = null
  const clean: string[] = []

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/)
    if (fenceMatch) {
      const delimiter = fenceMatch[1]!.charAt(0)
      if (fence === null) fence = delimiter
      else if (fence === delimiter) fence = null
      continue
    }
    if (fence !== null) continue
    if (/^\s*(?:>|diff --git|@@ |\+\+\+ |--- |\+\s|\[\d{4}-\d\d-\d\d|\d{2}:\d{2}:\d{2}|at\s+.+\([^)]*:\d+:\d+\)\s*$|Traceback |File "[^"]+", line \d+|\/\/)/u.test(line)) {
      continue
    }
    clean.push(line)
  }

  return clean.join('\n')
    .replace(/\`[^\`\n]*\`/g, ' ')
    .replace(/“[^”\n]*”|「[^」\n]*」|『[^』\n]*』|‘[^’\n]*’/gu, ' ')
    .replace(/"[^"\n]*"|'[^'\n]*'/g, ' ')
    .replace(/\b(?:console\.log|print|logger\.(?:error|warn|info))\s*\([^\n]*\)/gi, ' ')
}

function splitClauses(input: string): string[] {
  return input.split(/[。！？!?；;，,\n]+/u)
    .map(clause => clause.trim())
    .filter(Boolean)
}

function isQuoteOrMetaInstruction(clause: string): boolean {
  // Discussion of language is never a reason to impose an agent penalty.
  return /^(?:别|不要|禁止|请勿)(?:说|用|骂|称呼)|^(?:请|帮我|请帮我|please\s+)?(?:翻译|解释|分析|translate|explain|analyze|classify|评估)(?:\s|[:：])|^(?:有人说|别人说|他说|她说|他们说|the\s+log\s+says|someone\s+said)|^(?:do\s+not|don't|never)\s+(?:say|call|insult)|(?:是不是|是否|how to|what does).{0,25}(?:辱骂|攻击性|insult|offensive|abuse|meaning)/iu.test(clause)
}

const DIRECT_CHINESE = [
  /(?:你|您)(?:这(?:个|种|玩意儿)?|个|真(?:的|是)?|是(?:个|一(?:个)?)?|就(?:是)?|他妈(?:的)?|tm|怎么(?:这么|那么)?|简直(?:是)?|也太|太|这么|那么|完全是|根本就是|给我)?\s*(?:他妈(?:的)?|tm|真(?:是)?|就(?:是)?|一(?:个)?|个|这么|那么|太|非常|超级|简直(?:是)?|也)?\s*(?:废物|蠢货|白痴|傻逼|傻b|傻x|弱智|智障|笨蛋|傻子|垃圾人)/iu,
  /(?:Claude|Codex|ChatGPT|GPT|AI|机器人|助手|智能体)(?:你|这(?:个)?|真(?:是)?|是(?:个)?|就(?:是)?|太|简直(?:是)?)\s*(?:真(?:是)?|是(?:个)?|个|就(?:是)?|太)?\s*(?:废物|蠢货|白痴|傻逼|弱智|笨蛋|智障|傻子|垃圾)/iu,
  /(?:去死吧|滚你妈的|操你妈|艹你妈)/iu,
]

const DIRECT_ENGLISH = [
  /\b(?:you\s+(?:are|r|were)|you're|u\s+r|(?:claude|codex|chatgpt|this\s+agent|this\s+bot)\s+(?:is|are))\s+(?:(?:a|an|such\s+a|so|very|fucking|complete|completely|total|absolute)\s+){0,3}(?:idiot|moron|imbecile|dumbass|jackass|worthless|useless|stupid|trash|garbage|pathetic)\b/iu,
  /\b(?:fuck\s+you|screw\s+you|you\s+fucking\s+(?:idiot|moron|dumbass)|shut\s+up\s+you\s+(?:idiot|moron|dumbass))\b/iu,
]

const SUSPECTED_CHINESE = [
  /(?:你|您)(?:是不是|怎么|为什么)(?:脑子|智商)(?:有问题|坏了|这么低)/iu,
]
const SUSPECTED_ENGLISH = [
  /\b(?:are\s+you\s+(?:even\s+)?(?:stupid|an\s+idiot)|why\s+are\s+you\s+so\s+bad\s+at\s+this)\b/iu,
]

function artifactCriticismOnly(clause: string): boolean {
  // "Your code is garbage" is feedback on an artifact; "you're garbage" isn't.
  return /(?:你|您)(?:写|生成|给|输出|改|做|回复|回答|提供)(?:的|出来的)?.{0,14}(?:代码|测试|结果|回复|方案|回答|算法|实现|设计).{0,12}(?:垃圾|废物|白痴|糟糕|离谱)|(?:your|the)\s+(?:code|answer|solution|output|implementation|design|test|algorithm)\s+(?:is|was|looks|seems)\s+(?:stupid|trash|garbage|useless|terrible|awful)/iu.test(clause)
}

function isDirectPersonalAttack(clause: string): boolean {
  if (artifactCriticismOnly(clause)) return false
  return DIRECT_CHINESE.some(pattern => pattern.test(clause))
    || DIRECT_ENGLISH.some(pattern => pattern.test(clause))
}

function isPossiblyPersonalAttack(clause: string): boolean {
  if (artifactCriticismOnly(clause)) return false
  return SUSPECTED_CHINESE.some(pattern => pattern.test(clause))
    || SUSPECTED_ENGLISH.some(pattern => pattern.test(clause))
}
