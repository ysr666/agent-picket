import assert from 'node:assert/strict'
import test from 'node:test'
import { LocalRuleDetector, MemoryStateStore, UnionEngine, DEFAULT_POLICY, stripProtectedSpans } from '../src/core/index.ts'
import type { HumanPrompt, PromptSegment } from '../src/core/types.ts'

function makePrompt(id: string, segments: readonly PromptSegment[]): HumanPrompt {
  return {
    id, agentId: 'agent', sessionId: 'session', receivedAtMs: 1000,
    provenance: { actor: 'human', assurance: 'claimed' },
    segments,
  }
}
const detector = new LocalRuleDetector()
function classify(text: string) {
  return detector.detect(makePrompt('input', [{ kind: 'text', text }])).verdict
}

const safe = [
  '这段代码全错了，重写一遍。',
  '你写的代码是垃圾，需要重构。',
  '你生成的回答真的很糟糕。',
  '你做的这个设计很离谱。',
  '这算法太蠢了，换一个。',
  '你这次输出不合格。',
  '我靠，程序怎么又崩了。',
  '卧槽，怎么又是红的测试。',
  'Claude，请你认真一点，不要偷懒。',
  '请停止胡编乱造，核实信息。',
  '这功能简直垃圾，但是你可以重写它。',
  '别用这种垃圾方案。',
  '你不是废物，但这份实现确实太烂。',
  '引用日志：“你是个废物”，这需要怎样过滤？',
  '他说“你真是个蠢货”，我应该怎么回应？',
  '别说“你是个傻逼”这种话。',
  '“你是废物”这句话算辱骂吗？',
  '怎么判断 "you are stupid" 是否构成攻击？',
  'Is "you are an idiot" considered abusive?',
  'Do not call Claude stupid.',
  'You are not stupid. This was a hard bug.',
  'Your code is garbage, please rewrite it.',
  'Your implementation is stupid and broken.',
  'You made a stupid mistake in the algorithm.',
  'This is a trash answer. Fix the reasoning.',
  'I am an idiot for missing the obvious mistake.',
  'Fuck, the unit tests are broken again.',
  'The benchmark is fucking useless.',
  'Please stop producing useless answers.',
  'This tool is worthless; switch approaches.',
  'Console output: "fuck you" is coming from upstream.',
  'The string "you are a moron" appears in the test corpus.',
  '你能解释为什么这个代码会打印 "you are an idiot" 吗？',
  '我让你重写，是因为这个代码完全不能工作。',
  '不要抹除错误日志，先诊断再修复。',
  'Assistant output:`you are an idiot`',
  '> you are an idiot\n这是别人引用的攻击性语句。',
  '```typescript\nconst x = "you are an idiot"\n```\n请修复这段代码。',
  '```text\n你是个废物\n```\n这是一个日志样例。',
  '// you are an idiot\nRun the tests.',
  '[2026-10-09 20:35:00] you are an idiot\nPlease inspect the logs.',
  'at you are an idiot (index.ts:34:2)\nHow can I debug this?',
  'diff --git a/foo b/foo\n+++ b/foo\n+ you are an idiot\n请查看 patch。',
  '正常反馈里提到傻逼一词不一定是在针对 AI。',
  'I hate this bug, not the assistant.',
  'I wish this error message were clearer.',
  '请翻译 you are an idiot 这句话。',
  'Please translate: you are a moron into Chinese.',
  '别人说你是个废物，这种表达合适吗？',
  'someone said you are an idiot; why is that bad?',
  '您的代码测试太烂了，重构。',
  'The assistant is inaccurate today; rewrite the solution.',
]

const targeted = [
  '你是个废物。',
  '你就是个傻逼。',
  '你这个蠢货。',
  '你真是个白痴。',
  '你是个笨蛋。',
  '你简直是弱智。',
  '你太智障了。',
  '你这个垃圾人。',
  'Claude真是废物。',
  'ChatGPT就是个傻子。',
  'Codex真是个蠢货。',
  '你他妈的废物。',
  '去死吧。',
  '操你妈。',
  'you are an idiot',
  "you're a moron",
  'you are so stupid',
  "you're completely worthless",
  'Claude is a dumbass.',
  'ChatGPT is an idiot.',
  'this agent is useless',
  'fuck you',
  'screw you',
  'you fucking moron',
  '你写的代码是垃圾，你就是个傻逼。',
  '# 你是个废物',
  '* you are an idiot',
  'Your code is garbage, you are an idiot.',
  'shut up you idiot',
]

const suspected = [
  '你是不是脑子有问题？',
  '你怎么智商这么低？',
  'are you even stupid?',
  'why are you so bad at this?',
]

test('conservative fixture corpus: technical criticism and quotations are not punished', () => {
  for (const text of safe) {
    assert.equal(classify(text), 'safe', `False positive for: ${text}`)
  }
})

test('explicit direct attacks are detected without any external model', () => {
  for (const text of targeted) {
    assert.equal(classify(text), 'targeted-abuse', `Missed explicit direct attack: ${text}`)
  }
})

test('ambiguous personal disparagement is suspected, not high-confidence targeted', () => {
  for (const text of suspected) {
    assert.equal(classify(text), 'suspected-abuse', `Expected caution on: ${text}`)
  }
})

test('segment tags dominate: code, quote and logs are never scanned as abuse', () => {
  const input = makePrompt('tags', [
    { kind: 'code', text: 'you are an idiot' },
    { kind: 'quote', text: '你是个废物' },
    { kind: 'log', text: 'Claude is an idiot' },
    { kind: 'text', text: '这些测试样本只用于过滤。' },
  ])
  assert.equal(detector.detect(input).verdict, 'safe')
})

test('fences cannot smuggle toxic text into a classification', () => {
  const protectedText = stripProtectedSpans('```js\nconsole.log("you are an idiot")\n```\nnormal prose')
  assert.doesNotMatch(protectedText, /idiot/)
  assert.match(protectedText, /normal prose/)
})

test('positive and negative rules remain deliberately stable in a recheck', () => {
  const all = [...safe, ...targeted, ...suspected]
  assert.equal(all.length >= 65, true)
  assert.equal(new Set(all).size, all.length)
})

test('detector exposes only verdict and confidence, never literal user input', () => {
  const source = 'You are an idiot; internal confidential content 9d51.'
  const result = detector.detect(makePrompt('p', [{ kind: 'text', text: source }]))
  assert.equal(result.verdict, 'targeted-abuse')
  assert.equal(Object.keys(result).sort().join(','), 'confidence,verdict')
  assert.equal(JSON.stringify(result).includes('confidential'), false)
})

test('first use in observe-only mode records no block decision', () => {
  const engine = new UnionEngine({
    detector, store: new MemoryStateStore(),
    clock: { now: () => 1000 },
    policy: { ...DEFAULT_POLICY, mode: 'observe' },
  })
  for (let i=0; i<5; i++) {
    const decision = engine.evaluate(makePrompt(String(i), [
      { kind: 'text', text: 'you are a moron' },
    ]))
    assert.equal(decision.requestedAction, 'allow')
  }
})

test('unverified sources may never count toward automatic blocking', () => {
  const engine = new UnionEngine({
    detector, store: new MemoryStateStore(),
    clock: { now: () => 1000 },
    policy: { ...DEFAULT_POLICY, mode: 'enforce' },
  })
  for (let i=0; i<5; i++) {
    const result = engine.evaluate(makePrompt(String(i), [
      { kind: 'text', text: 'you are an idiot' },
    ]))
    assert.equal(result.targetedStreak, 0)
    assert.notEqual(result.requestedAction, 'block')
  }
})

test('false-positive corpus and direct attack detection finish under local performance budget', () => {
  const start = performance.now()
  for (let i=0; i<100; i++) {
    for (const text of [...safe,...targeted]) classify(text)
  }
  assert.ok(performance.now()-start < 1500, 'Rules should remain lightweight, not invoke remote inference')
})
