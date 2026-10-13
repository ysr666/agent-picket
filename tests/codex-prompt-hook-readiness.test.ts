import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectCodexOfficialPromptHook} from '../src/adapters/codex/prompt-hook-readiness.ts'
const home='/tmp/offline-codex-home/hooks.json'
const cwd='/tmp/offline-codex-work'
const hash='sha256:'+'a'.repeat(64)
const hook={key:home+':user_prompt_submit:0:0',eventName:'userPromptSubmit',
 handlerType:'command',sourcePath:home,isManaged:false,enabled:true,
 command:'node /tmp/synthetic-hook.mjs',currentHash:hash,trustStatus:'trusted'}
const response=(items:unknown[],overrides:Record<string,unknown>={})=>({
 data:[{cwd,hooks:items,warnings:[],errors:[],...overrides}],
})
const inspect=(v:unknown,h=hash)=>inspectCodexOfficialPromptHook(v,cwd,home,h)

test('only precisely trusted official prompt hook may be OFFERED, never fail-closed assumed',()=>{
 assert.deepEqual(inspect(response([hook])),{
  status:'trusted',canOfferOptInNewWorkRefusal:true,failClosedOnHookErrorProven:false,
 })
 assert.equal(inspect(response([{...hook,trustStatus:'untrusted'}])).status,'untrusted')
 assert.equal(inspect(response([{...hook,trustStatus:'modified'}])).status,'modified')
 assert.equal(inspect(response([{...hook,enabled:false}])).status,'disabled')
 assert.equal(inspect(response([{...hook,currentHash:'sha256:'+'b'.repeat(64)}])).status,'modified')
 assert.equal(inspect(response([])).status,'absent')
})
test('duplicate, tampered, malformed and error Host readback cannot enable prompt refusal',()=>{
 for(const v of [undefined,null,{},[],{data:[]},
  response([hook,hook]),response([hook],{warnings:['bad config']}),
  response([hook],{errors:['unparseable']}),response([{...hook,handlerType:'mcp_tool'}]),
  response([{...hook,isManaged:true}]),response([{...hook,trustStatus:'invented'}]),
  {data:[{cwd,hooks:[hook],warnings:[],errors:[]},{cwd,hooks:[hook],warnings:[],errors:[]}]},
 ])assert.equal(inspect(v).canOfferOptInNewWorkRefusal,false)
 assert.equal(inspectCodexOfficialPromptHook(response([hook]),cwd,home,'invalid').status,
  'unconfirmed')
 assert.equal(inspectCodexOfficialPromptHook(response([hook]),'/other',home,hash).status,
  'unconfirmed')
})
