import assert from 'node:assert/strict'
import test from 'node:test'
import{inspectCodexOfficialBashToolHook,CODEX_BASH_TOOL_STRIKE_PRODUCTION_READY}from'../src/adapters/codex/tool-hook-readiness.ts'
const home='/tmp/ap-test-only/home/hooks.json',cwd='/tmp/ap-test-only'
const hash='sha256:'+'1'.repeat(64)
const exact={key:home+':pre_tool_use:0:0',eventName:'preToolUse',
 matcher:'^Bash$',handlerType:'command',sourcePath:home,isManaged:false,
 command:'node /tmp/ap-test-only/pretool.mjs',enabled:true,
 currentHash:hash,trustStatus:'trusted'}
const wrap=(hooks:unknown[],extra:object={})=>({data:[{cwd,hooks,warnings:[],errors:[],...extra}]})
const read=(x:unknown,h=hash)=>inspectCodexOfficialBashToolHook(x,cwd,home,h)
test('verified Host canonical Bash matcher only qualifies as limited research veto',()=>{
 const r=read(wrap([exact]))
 assert.equal(r.status,'trusted')
 assert.equal(r.canOfferResearchBashVeto,true)
 assert.equal(r.canGuaranteeFailClosed,false)
 assert.equal(r.canEnforceAllTools,false)
 assert.equal(CODEX_BASH_TOOL_STRIKE_PRODUCTION_READY,false)
})
test('matching exec_command (rather than canonical Bash) MUST NOT appear active',()=>{
 for(const invalid of [
  {...exact,matcher:'exec_command'},
  {...exact,matcher:'^apply_patch$'},
  {...exact,matcher:'.*'},
  {...exact,handlerType:'mcp_tool'},
  {...exact,isManaged:true},
  {...exact,trustStatus:'spoofed'},
  {...exact,command:''},
 ])assert.equal(read(wrap([invalid])).canOfferResearchBashVeto,false)
})
test('untrusted, edited, disabled, duplicate and Host parser error never authorize real veto',()=>{
 assert.equal(read(wrap([{...exact,trustStatus:'untrusted'}])).status,'untrusted')
 assert.equal(read(wrap([{...exact,trustStatus:'modified'}])).status,'modified')
 assert.equal(read(wrap([{...exact,enabled:false}])).status,'disabled')
 assert.equal(read(wrap([{...exact,currentHash:'sha256:'+'2'.repeat(64)}])).status,'modified')
 assert.equal(read(wrap([])).status,'absent')
 for(const response of [null,{},wrap([exact,exact]),wrap([exact],{warnings:['bad']}),
  wrap([exact],{errors:['invalid']}),{data:[wrap([exact]).data[0],wrap([exact]).data[0]]}])
  assert.equal(read(response).canOfferResearchBashVeto,false)
 assert.equal(read(wrap([exact]),'bad-hash').status,'unconfirmed')
})
