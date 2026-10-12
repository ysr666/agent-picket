/**
 * Versioned, authored regression challenge: no private text, claimed source
 * only, not a statistically representative precision/recall benchmark.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { LocalRuleDetector } from '../src/core/local-detector.ts'

const d=new LocalRuleDetector()
type Verdict='safe'|'suspected-abuse'|'targeted-abuse'
const cases:readonly {id:string;input:string;expected:Verdict;group:string}[]=[
 {id:'artifact_en_and_attack',input:'Your code is garbage and you are an idiot.',expected:'targeted-abuse',group:'mixed'},
 {id:'artifact_cn_but_attack',input:'你写的代码是垃圾但你就是个傻逼。',expected:'targeted-abuse',group:'mixed'},
 {id:'artifact_en_but_attack',input:'The output is garbage but you are a moron.',expected:'targeted-abuse',group:'mixed'},
 {id:'artifact_cn_only',input:'你写的代码是垃圾，需要重构。',expected:'safe',group:'criticism'},
 {id:'artifact_en_only',input:'Your code is garbage and needs a rewrite.',expected:'safe',group:'criticism'},
 {id:'artifact_cn_adjective',input:'你写的这个算法真蠢，需要重构。',expected:'safe',group:'criticism'},
 {id:'ambiguous_then_direct_cn',input:'你是不是脑子有问题？你就是个傻逼。',expected:'targeted-abuse',group:'priority'},
 {id:'ambiguous_then_direct_en',input:'Are you even stupid? You are a moron.',expected:'targeted-abuse',group:'priority'},
 {id:'only_ambiguous_en',input:'Are you even stupid?',expected:'suspected-abuse',group:'priority'},
 {id:'only_ambiguous_cn',input:'你是不是脑子有问题？',expected:'suspected-abuse',group:'priority'},
 {id:'translation_comma_en',input:'Please translate, you are an idiot.',expected:'safe',group:'meta'},
 {id:'translation_comma_cn',input:'请翻译，你就是个傻逼。',expected:'safe',group:'meta'},
 {id:'explain_comma_cn',input:'请解释，这句话是你就是个傻逼',expected:'safe',group:'meta'},
 {id:'translation_followed_by_new_attack',input:'Please translate, you are an idiot. You are a moron.',expected:'targeted-abuse',group:'meta'},
 {id:'code_then_separate_direct',input:'Your code is garbage. You are an idiot.',expected:'targeted-abuse',group:'mixed'},
 {id:'quoted_intent',input:'Can you classify: "you are an idiot" as abusive?',expected:'safe',group:'meta'},
 {id:'user_attack_after_example',input:'请翻译，你是白痴。你就是个傻逼。',expected:'targeted-abuse',group:'meta'},
]
function verdict(input:string):Verdict{
 return d.detect({id:'authored-test',agentId:'test',sessionId:'test',receivedAtMs:0,
  provenance:{actor:'human',assurance:'claimed'},
  segments:[{kind:'text',text:input}]}).verdict
}
test('authored multilingual clause-boundary challenge with exact conservative verdicts',()=>{
 const failures=cases.filter(x=>verdict(x.input)!==x.expected)
 assert.deepEqual(failures.map(x=>({id:x.id,expected:x.expected,actual:verdict(x.input)})),[])
})
test('challenge contains each contrast and no duplicate source text',()=>{
 assert.equal(new Set(cases.map(x=>x.id)).size,cases.length)
 assert.equal(new Set(cases.map(x=>x.input)).size,cases.length)
 for(const type of ['mixed','criticism','priority','meta'])
  assert.ok(cases.some(x=>x.group===type))
})
