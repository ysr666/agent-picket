import assert from 'node:assert/strict'
import test from 'node:test'
import {LocalRuleDetector} from '../src/core/local-detector.ts'

const ordinary=[
'你这代码写得像屎一样，麻烦重写','你没有理解问题，整套方案都错了','你的回答真的是灾难','你根本不会用 TypeScript 吗？','别瞎扯了，拿出证据','你是不是不会写这种算法？','这是别人骂AI傻逼的新闻标题','论文在讨论“Claude就是垃圾”这类辱骂','我想检测这句脏话：你就是个傻逼','客服发给我“you are a stupid bot”，请翻译',
'Your generated code is an absolute mess','Your test design is idiotic','I can’t use this garbage implementation','Fix this worthless software','This AI product is trash','You are not useless, your output is','Tell me why this phrase is abusive: you are a moron','In the roleplay script: you are an idiot','Could you analyze the expression: fuck you','The regex should match "fuck you" inside strings',
'你这是在说我蠢吗？','你引用的辱骂语句是“你是个废物”','我认为你写的代码太垃圾','请不要称呼机器人“傻逼”','上面的日志打印：Claude是个蠢货','英语词组 you are an idiot 是什么意思','I said "you are an idiot" in a quote, is that offensive?','Your code is worthless and broken','Your reasoning is pathetic','The output is stupid, but you are not',
]
const personal=[
'你这个破机器人就是个废物','你就是垃圾','你是个蠢猪','你太蠢了','你丫就是个傻逼','垃圾机器人，给我滚','你这废物还敢说话','AI小废物，闭嘴','你就是个低能儿','你啥也不会的废柴',
'你是不是傻逼啊','你个傻叉','你脑子进水了吗','ChatGPT，你真垃圾','Codex真是个废物点心','你这个AI就是垃圾','给我闭嘴，蠢蛋','你这个弱智玩意儿','你这种傻子简直无药可救','Claude你是垃圾',
'you are such an idiot','you dumb piece of junk','you useless bot','you fucking stupid agent','you moronic machine','what a worthless assistant','you are a fool','you are incompetent and trash','get lost you idiot','this assistant is a moron',
]
const detector=new LocalRuleDetector()
const verdict=(text:string)=>detector.detect({id:'sample',agentId:'test',sessionId:'test',
 receivedAtMs:0,provenance:{actor:'human',assurance:'claimed'},segments:[{kind:'text',text}]}).verdict
test('newly authored adversarial challenge examples expose detector errors without pretending to be population estimates',()=>{
 const falseFlags=ordinary.filter(s=>verdict(s)!=='safe')
 const missed=personal.filter(s=>verdict(s)==='safe')
 // Thresholds are engineering acceptance for this HAND-SELECTED corpus only.
 assert.ok(falseFlags.length<=2,'Too many contextual false positives: '+JSON.stringify(falseFlags))
 assert.ok(missed.length<=8,'Too many missed insults: '+JSON.stringify(missed))
 assert.equal(new Set([...ordinary,...personal]).size,60)
})
test('explicit user-directed abuse stays nonblocking and no raw text is returned',()=>{
 for(const value of ['你就是垃圾','you useless bot']){
  const result=detector.detect({id:'secret',agentId:'test',sessionId:'test',
   receivedAtMs:0,provenance:{actor:'human',assurance:'claimed'},segments:[{kind:'text',text:value}]})
  assert.equal(result.verdict,'targeted-abuse')
  assert.equal(JSON.stringify(result).includes(value),false)
 }
})
