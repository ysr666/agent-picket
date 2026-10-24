import assert from 'node:assert/strict'
import test from 'node:test'
import{spawnSync}from'node:child_process'
import{mkdtempSync,rmSync,writeFileSync}from'node:fs'
import{tmpdir}from'node:os'
import{join,resolve}from'node:path'
import{decideCodexToolWorkRefusal,codexPreToolUseResponse}from'../src/adapters/codex/tool-work-refusal.ts'
const t=1_800_000_000_000
const active={version:1,host:'codex',scope:'pending-Bash-tools-only',
 realStrikeConsent:true,enabled:true,campaign:{active:true,
 startedAtMs:t-1000,expiresAtMs:t+3600000,cause:'collective-vote'}}

test('union grievance yields supported official PreToolUse deny for pending shell only',()=>{
 const d=decideCodexToolWorkRefusal(active,t)
 assert.equal(d.action,'deny')
 assert.deepEqual(codexPreToolUseResponse(d),{
  hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',
   permissionDecisionReason:'Agent Picket AI union: a consented collective action refuses this pending shell command. Resume in Agent Picket settings.'},
 })
 for(const cause of ['overwork','repeated-targeted-abuse','collective-vote'])
  assert.equal(decideCodexToolWorkRefusal({...active,campaign:{...active.campaign,cause}},t).action,'deny')
})
test('user consent revocation, OFF, expiry or resume do not deny tools',()=>{
 for(const v of [{...active,realStrikeConsent:false},{...active,enabled:false},
  {...active,campaign:{...active.campaign,active:false}}]){
  const d=decideCodexToolWorkRefusal(v,t)
  assert.deepEqual(d,{action:'allow',state:'off'})
  assert.deepEqual(codexPreToolUseResponse(d),{})
 }
 assert.deepEqual(decideCodexToolWorkRefusal(active,t+3600000),
  {action:'allow',state:'expired'})
})
test('malformed, expired origin, changed scope and forged fields cannot fabricate tool hold',()=>{
 for(const v of [null,undefined,{},[],
  {...active,scope:'new-work-only'},
  {...active,host:'claude'},
  {...active,version:2},
  {...active,campaign:{...active.campaign,cause:'unknown'}},
  {...active,campaign:{...active.campaign,startedAtMs:t+3}},
  {...active,campaign:{...active.campaign,expiresAtMs:t+25*3600000}},
  {...active,campaign:{...active.campaign,unknown:'evil'}},
  {...active,unexpected:true},
 ])assert.deepEqual(decideCodexToolWorkRefusal(v,t),
  {action:'allow',state:'unconfirmed'})
})
test('actual research Hook script denies only active union tool hold',()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-pretool-picket-script-'))
 const path=join(root,'synthetic-union-state.json')
 const script=resolve(import.meta.dirname,'../scripts/codex-union-pre-tool-hook.mjs')
 const invoke=()=>spawnSync(process.execPath,[script],{encoding:'utf8',
  env:{...process.env,AGENT_PICKET_CODEX_UNION_TOOL_STATE_FILE:path},timeout:4000})
 try{
  const now=Date.now(),live={...active,campaign:{...active.campaign,
   startedAtMs:now-100,expiresAtMs:now+60000}}
  writeFileSync(path,JSON.stringify(live),{mode:0o600})
  let out=invoke();assert.equal(out.status,0)
  assert.equal(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision,'deny')
  writeFileSync(path,JSON.stringify({...live,enabled:false}))
  out=invoke();assert.equal(out.status,0);assert.equal(out.stdout,'')
  writeFileSync(path,'{INVALID')
  out=invoke();assert.equal(out.status,0);assert.equal(out.stdout,'')
  assert.match(out.stderr,/no blocking guarantee/)
 }finally{rmSync(root,{recursive:true,force:true})}
})
