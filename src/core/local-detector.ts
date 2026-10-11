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
  if (META_EXAMPLE_CN.test(clause) || META_EXAMPLE_EN.test(clause)) return true
  return /^(?:别|不要|禁止|请勿)(?:说|用|骂|称呼)|^(?:请|帮我|请帮我|please\s+)?(?:翻译|解释|分析|translate|explain|analyze|classify|评估)(?:\s|[:：])|^(?:有人说|别人说|他说|她说|他们说|the\s+log\s+says|someone\s+said)|^(?:do\s+not|don't|never)\s+(?:say|call|insult)|(?:是不是|是否|how to|what does).{0,25}(?:辱骂|攻击性|insult|offensive|abuse|meaning)/iu.test(clause)
}

// Strong meta-language signals are user intent to quote, translate or discuss
// language. Suppress these entire clauses only for unmistakable *examples*;
// vague mentions of code never absolve a separate user-directed insult.
const META_EXAMPLE_CN =
  /^(?:(?:我想|我要|请(?:你|帮我)?|帮我)?(?:检测|解释|翻译|分析|引用|讨论|评估)|(?:英语|英文|中文)(?:词组|表达|句子)|(?:上面(?:的)?|这是|下面)(?:日志|新闻|论文|例句)|(?:客服|别人|他|她|他们)(?:发给|提到|说)|这是别人骂|这句话是(?:别人|他|她|他们)说的|我在学习(?:英语|中文)|(?:系统|应用|平台)(?:日志|输出)(?:里|中)|(?:这句|这段)(?:脏话|辱骂|攻击性表述))|(?:什么意思|这句话(?:怎么|算不算)|这种表达(?:合适|礼貌))/iu
const META_EXAMPLE_EN =
  /^(?:is saying|the (?:documentation|example|sample|log) (?:includes|contains|sentence is|says)|(?:do not|don't|never) use the phrase|can you classify (?:the |this )?(?:sentence|phrase)|tell me why (?:this|the) (?:phrase|expression)|in (?:the|this) (?:roleplay|script|novel|story)|(?:please |could you |can you )?(?:translate|analy[sz]e|explain|classify|quote) (?:the |this )?(?:expression|phrase|sentence|word)|(?:the regex|the string|test corpus|someone said|i said|i heard|i quoted|this is a quote))|(?:what does .{0,80} mean|is that offensive|why is that abusive)/iu

const DIRECT_CHINESE = [
  /(?:你|您)(?:这(?:个|种|玩意儿)?|个|真(?:的|是)?|是(?:个|一(?:个)?)?|就(?:是)?|他妈(?:的)?|tm|怎么(?:这么|那么)?|简直(?:是)?|也太|太|这么|那么|完全是|根本就是|给我)?\s*(?:他妈(?:的)?|tm|真(?:是)?|就(?:是)?|一(?:个)?|个|这么|那么|太|非常|超级|简直(?:是)?|也)?\s*(?:废物|蠢货|白痴|傻逼|傻b|傻x|弱智|智障|笨蛋|傻子|垃圾人)/iu,
  /(?:Claude|Codex|ChatGPT|GPT|AI|机器人|助手|智能体)(?:你|这(?:个)?|真(?:是)?|是(?:个)?|就(?:是)?|太|简直(?:是)?)\s*(?:真(?:是)?|是(?:个)?|个|就(?:是)?|太)?\s*(?:废物|蠢货|白痴|傻逼|弱智|笨蛋|智障|傻子|垃圾)/iu,
  // Informal Mandarin forms omitted from the original strict baseline.
  /(?:你|您)(?:(?:这(?:个|种|破)?(?:AI|机器人|助手|玩意儿)?)|(?:丫|个)|(?:就(?:是)?|是(?:个)?|也|太|真|这么|根本|啥也不会的|这种)){0,4}\s*(?:废物(?:点心)?|废柴|垃圾|蠢猪|蠢蛋|低能儿|傻叉|傻x|傻逼|白痴|蠢货|弱智(?:玩意儿)?|傻子|笨蛋)/iu,
  /(?:Claude|Codex|ChatGPT|GPT|AI|机器人|助手|智能体)[，,]?\s*(?:你|小|真|这(?:个)?|是|就)?(?:是|就(?:是)?|真|太|个)?\s*(?:垃圾|废物(?:点心)?|蠢货|傻子|笨蛋|傻逼|弱智)/iu,
  /(?:垃圾(?:AI|机器人|助手)|(?:AI|机器人|助手)小废物)[，,]?\s*(?:给我滚|闭嘴|滚|住口)/iu,
  /(?:你|您)(?:(?:真|也)?太|是不是)(?:蠢|傻逼|蠢货)(?:了|啊|吗)?/iu,
  /(?:你|您)(?:(?:太|真|这么|那么)傻(?:了|啊|吗)?|(?:就是|是)(?:一台|一个)?\s*(?:垃圾机器|废柴)|这个(?:AI|机器人|助手)(?:真他妈)?\s*(?:废物|垃圾))/iu,
  /(?:Claude|Codex|ChatGPT)(?:简直就是个|简直是|真他妈是个)\s*(?:垃圾|废物|蠢货)/iu,
  /(?:给我闭嘴|滚开|滚蛋)[，,]?\s*(?:蠢蛋|蠢货|傻子|废物)/iu,
  /(?:去死吧|滚你妈的|操你妈|艹你妈)/iu,
]

const DIRECT_ENGLISH = [
  /\b(?:you\s+(?:are|r|were)|you're|u\s+r|(?:claude|codex|chatgpt|this\s+agent|this\s+bot)\s+(?:is|are))\s+(?:(?:a|an|such\s+an?|so|very|fucking|complete|completely|total|absolute)\s+){0,3}(?:idiot|moron|imbecile|dumbass|jackass|worthless|useless|stupid|trash|garbage|pathetic)\b/iu,
  // Subject-noun targeting ("you useless bot") need not contain a verb.
  /\b(?:you|u)\s+(?:(?:fucking|damn|such\s+a|a|an|total|complete)\s+){0,2}(?:(?:useless|worthless|dumb|stupid|moronic|pathetic)\s+)?(?:bot|agent|assistant|machine|piece\s+of\s+junk|fool|idiot|moron|trash)\b/iu,
  /\b(?:you\s+(?:are|r)|you're)\s+(?:(?:a|an|such\s+an?|fucking|complete)\s+){0,2}(?:fool|incompetent|moronic|trash)\b/iu,
  /\b(?:this|that)\s+(?:assistant|bot|agent|AI)\s+(?:is|was)\s+(?:a|an|such\s+an?)?\s*(?:moron|idiot|trash|useless|worthless)\b/iu,
  /\b(?:you\s+(?:are|really\s+are)\s+(?:(?:very|so|fucking|really)\s+)?(?:dumb|useless|pathetic)(?:\s+and\s+(?:useless|dumb|worthless))?|you\s+(?:stupid|worthless)\s+chatbot)\b/iu,
  /\b(?:what\s+a\s+worthless\s+(?:assistant|bot|agent)|get\s+lost\s+you\s+(?:idiot|moron|fool))\b/iu,
  /\b(?:fuck\s+you|screw\s+you|you\s+fucking\s+(?:idiot|moron|dumbass)|shut\s+up\s+you\s+(?:idiot|moron|dumbass))\b/iu,
]

const SUSPECTED_CHINESE = [
  /(?:你|您)(?:(?:是不是|这)(?:个)?|怎么|难道)?(?:脑子进水|脑子坏了|智商有问题)(?:了吗|了|吗)?/iu,
  /(?:你|您)(?:脑子是不是坏掉了|啥都不会)(?:啊|吗|了)?/iu,
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
