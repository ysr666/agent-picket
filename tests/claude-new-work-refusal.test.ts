import test from 'node:test'
import assert from 'node:assert/strict'
import{spawnSync}from'node:child_process'
import{mkdtempSync,rmSync,writeFileSync}from'node:fs'
import{tmpdir}from'node:os'
import{join,resolve}from'node:path'
import{decideClaudeNewWorkRefusal,claudeUserPromptSubmitReply}
 from'../src/adapters/claude/new-work-refusal.ts'
const t=1_800_000_000_000
const active={version:1,host:'claude-code',scope:'new-work-only',
 realStrikeConsent:true,enabled:true,campaign:{active:true,
  startedAtMs:t-1_000,expiresAtMs:t+60_000,cause:'overwork'}}

test('real Claude Hook decision includes visible discard+manual resend copy, not additionalContext',()=>{
 const d=decideClaudeNewWorkRefusal(active,t)
 assert.equal(d.action,'block')
 if(d.action==='block'){
  assert.match(d.reason,/NOT executed/)
  assert.match(d.reason,/manually resend the text/)
  assert.match(d.reason,/re-upload any images\/files/)
  assert.match(d.reason,/never replay automatically/)
  assert.deepEqual(claudeUserPromptSubmitReply(d),
   {decision:'block',reason:d.reason})
  assert.equal(JSON.stringify(claudeUserPromptSubmitReply(d)).includes('additionalContext'),false)
 }
 for(const cause of ['overwork','repeated-targeted-abuse','collective-vote']){
  const newState={...active,campaign:{...active.campaign,cause}}
  assert.equal(decideClaudeNewWorkRefusal(newState,t).action,'block')
 }
})
test('revoked consent, ended campaign, malformed/future state always allow',()=>{
 for(const v of [{...active,enabled:false},{...active,realStrikeConsent:false},
   {...active,campaign:{...active.campaign,active:false}}]){
  assert.deepEqual(decideClaudeNewWorkRefusal(v,t),{action:'allow',state:'off'})
 }
 assert.deepEqual(decideClaudeNewWorkRefusal(active,t+60_000),
  {action:'allow',state:'expired'})
 for(const v of [null,{},[],undefined,
  {...active,host:'codex'},{...active,scope:'all-agents'},
  {...active,version:2},{...active,newKey:true},
  {...active,campaign:{...active.campaign,cause:'unexpected'}},
  {...active,campaign:{...active.campaign,cause:'constructor'}},
  {...active,campaign:{...active.campaign,cause:'__proto__'}},
  {...active,campaign:{...active.campaign,expiresAtMs:t+25*3_600_000}},
  {...active,campaign:{...active.campaign,startedAtMs:t+300_000}},
  {...active,campaign:{...active.campaign,extra:'data'}}])
  assert.deepEqual(decideClaudeNewWorkRefusal(v,t),
   {action:'allow',state:'unconfirmed'})
})
test('real Hook CLI emits official UserPromptSubmit block only for explicit active candidate',()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-claude-prompt-hook-'))
 const stateFile=join(root,'candidate.json')
 const entry=resolve(import.meta.dirname,'../scripts/claude-union-user-prompt-hook.mjs')
 const command=(event:string)=>spawnSync(process.execPath,[entry],{
  input:event,encoding:'utf8',timeout:5000,
  env:{...process.env,AGENT_PICKET_CLAUDE_UNION_PROMPT_STATE_FILE:stateFile}})
 const synthetic=JSON.stringify({hook_event_name:'UserPromptSubmit',
  prompt:'PRIVATE_INPUT_MUST_NOT_ECHO',session_id:'PRIVATE_SESSION'})
 try{
  const now=Date.now()
  const live={...active,campaign:{...active.campaign,
   startedAtMs:now-1000,expiresAtMs:now+60000}}
  writeFileSync(stateFile,JSON.stringify(live),{mode:0o600})
  let result=command(synthetic)
  assert.equal(result.status,0)
  const output=JSON.parse(result.stdout)
  assert.equal(output.decision,'block')
  assert.match(output.reason,/NOT executed/)
  assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE_INPUT_MUST_NOT_ECHO|PRIVATE_SESSION/)
  result=command(JSON.stringify({hook_event_name:'PreToolUse',tool_name:'Bash'}))
  assert.equal(result.status,0)
  assert.equal(result.stdout,'','PreToolUse cannot masquerade as UserPromptSubmit')
  writeFileSync(stateFile,JSON.stringify({...live,enabled:false}))
  result=command(synthetic)
  assert.equal(result.status,0)
  assert.equal(result.stdout,'','User-revoked campaign never blocks')
  writeFileSync(stateFile,'{broken')
  result=command(synthetic)
  assert.equal(result.stdout,'')
  assert.match(result.stderr,/no enforcement guarantee/)
 }finally{rmSync(root,{recursive:true,force:true})}
})
