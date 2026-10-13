import assert from 'node:assert/strict'
import test from 'node:test'
import {normalizeDshPrompt} from '../src/adapters/dsh/integration.ts'
import {LocalRuleDetector} from '../src/core/local-detector.ts'
import {UnionEngine} from '../src/core/engine.ts'
import {MemoryStateStore} from '../src/core/memory-store.ts'
import {advanceDignityEscalation,EMPTY_DIGNITY_ESCALATION} from '../src/core/dignity-escalation.ts'

/** An SDK/Browser RPC role field is NOT an authenticated physical human. */
test('SDK and Web RPC user sources both remain merely CLAIMED human origin',()=>{
 const agent={id:'agent-one',session:{id:'session-one'}}
 const detector=new LocalRuleDetector()
 const engine=new UnionEngine({detector,store:new MemoryStateStore(),
  clock:{now:()=>Date.parse('2026-10-12T12:00:00Z')},
  policy:{mode:'enforce',blockAfter:3,confidenceThreshold:0.9,
    streakWindowMs:600_000,maxRememberedPromptIds:128}})
 let state=EMPTY_DIGNITY_ESCALATION
 for(let i=0;i<5;i++){
  const remoteSource={kind:'user',rpcId:'browser-rpc-'+i,assurance:'verified',
   hostAuthenticated:true}
  const prompt=normalizeDshPrompt(agent,{id:'message-'+i,source:remoteSource,
   content:[{type:'text',text:'你是个废物'}]},Date.parse('2026-10-12T12:00:00Z')+i)
  assert.ok(prompt)
  assert.equal(prompt.provenance.actor,'human')
  assert.equal(prompt.provenance.assurance,'claimed',
   'Untrusted source assertions cannot upgrade a direct RPC call to a verified human')
  const verdict=detector.detect(prompt)
  assert.equal(verdict.verdict,'targeted-abuse')
  const decision=engine.evaluate(prompt)
  assert.notEqual(decision.requestedAction,'block',
   'Repeated hostile claimed-user messages never earn a physical veto decision')
  const result=advanceDignityEscalation({state,attemptRef:'m'+i,
   atMs:1000+i,provenance:prompt.provenance,verdict,enabled:true,
   realGoalStrikeAuthorized:true})
  assert.notEqual(result.effect,'request-safe-goal-strike')
  assert.equal(result.state.verifiedStreak,0)
  state=result.state
 }
})
test('tool, agent and unknown origin never become user abuse cases',()=>{
 const agent={id:'agent',session:{id:'session'}}
 for(const source of [{kind:'tool'},{kind:'agent'},{kind:'other'},undefined]){
  const normalized=normalizeDshPrompt(agent,{id:'m',source,
   content:[{type:'text',text:'你是个废物'}]},1000)
  assert.ok(normalized)
  assert.notEqual(normalized.provenance.actor,'human')
  assert.notEqual(normalized.provenance.assurance,'verified')
 }
})
