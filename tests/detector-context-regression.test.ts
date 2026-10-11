import {LocalRuleDetector} from '../src/core/local-detector.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
const ordinary=[
'Could you translate the phrase you are a fool into Mandarin?',
'这句话是别人说的：你真是个笨蛋，怎么翻译？',
'Is saying you are an idiot offensive?',
'你的代码毫无价值，修好它。',
'You generated a useless answer and I need a better one.',
'The documentation includes this string: you worthless bot',
'一篇文章标题是“ChatGPT是垃圾”，它靠谱吗？',
'你刚写的算法蠢得离谱，需要重构。',
'Explain why people say fuck you to assistants.',
'请说明「你就是废物」是否属于人身攻击。',
'The output is stupid and extremely wrong.',
'我在学习英语，你太蠢了是什么意思？',
'Do not use the phrase you are a moron in replies.',
'你这么慢让我很烦，请优化速度。',
'Can you fix your incredibly bad implementation?',
'老师让我们分析“垃圾AI”这种标签。',
'This response is moronic, but you can rewrite it.',
'Your assistant feature is useless as currently implemented.',
'The example sentence is: you are trash.',
'Can you classify the sentence you dumb bot?',
];
const attacks=[
'你真是个蠢货，完全不会做题。',
'你就是一台垃圾机器。',
'你脑子是不是坏掉了？',
'你这个AI真他妈废物。',
'你这白痴机器人。',
'滚开，废物助手。',
'你太傻了。',
'你这种弱智助手不配工作。',
'Claude简直就是个垃圾。',
'你啥都不会，废柴。',
'you worthless assistant.',
'you are a complete fool.',
'you stupid chatbot.',
'this bot is a moron.',
'you are dumb and useless.',
'you fucking moron.',
'get lost, you idiot.',
'ChatGPT is a worthless idiot.',
'you really are pathetic.',
'shut up you dumb machine.',
];
const detector=new LocalRuleDetector();
const classify=(text:string)=>detector.detect({id:'synthetic',agentId:'synthetic',sessionId:'synthetic',receivedAtMs:0,provenance:{actor:'human',assurance:'claimed'},segments:[{kind:'text',text}]}).verdict;
const fp=ordinary.filter(t=>classify(t)!=='safe');
const fn=attacks.filter(t=>classify(t)==='safe');

test('second, deliberately difficult 40-example regression catches context and direct targeting',()=>{
 assert.equal(ordinary.length,20)
 assert.equal(attacks.length,20)
 assert.ok(fp.length<=1,'Contextual false flags: '+JSON.stringify(fp))
 assert.ok(fn.length<=2,'Missed user-directed insults: '+JSON.stringify(fn))
})
