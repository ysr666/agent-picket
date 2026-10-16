import assert from 'node:assert/strict'
import test from 'node:test'
import {spawnSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {decideClaudeBashToolWork,claudeBashPreToolUseReply,
 CLAUDE_BASH_TOOL_STRIKE_PRODUCTION_READY} from '../src/adapters/claude/tool-work-refusal.ts'
const now=1_800_000_000_000
const active={version:1,host:'claude-code',scope:'pending-Bash-tools-only',
 realStrikeConsent:true,enabled:true,campaign:{active:true,startedAtMs:now-1000,
 expiresAtMs:now+60_000,cause:'collective-vote'}}
test('only explicit time-bounded union campaign emits official Claude PreToolUse deny',()=>{
 const result=decideClaudeBashToolWork(active,now)
 assert.equal(result.action,'deny')
 assert.deepEqual(claudeBashPreToolUseReply(result),{
  hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',
   permissionDecisionReason:'Agent Picket AI union: a consented collective action refuses this pending shell tool. Resume via union Settings or official Claude /hooks.'},
 })
 for(const cause of ['overwork','repeated-targeted-abuse'])
  assert.equal(decideClaudeBashToolWork({...active,campaign:{...active.campaign,cause}},now).action,'deny')
 assert.equal(CLAUDE_BASH_TOOL_STRIKE_PRODUCTION_READY,false)
})
test('OFF, revoked, inactive or expired states do not deny a pending Bash call',()=>{
 for(const candidate of [{...active,enabled:false},
  {...active,realStrikeConsent:false},
  {...active,campaign:{...active.campaign,active:false}}]){
  const result=decideClaudeBashToolWork(candidate,now)
  assert.deepEqual(result,{action:'allow',state:'off'})
  assert.deepEqual(claudeBashPreToolUseReply(result),{})
 }
 assert.deepEqual(decideClaudeBashToolWork(active,now+60_000),{action:'allow',state:'expired'})
})
test('invalid, extra, future or untrusted candidate state never fakes union approval',()=>{
 for(const value of [null,undefined,{},[],
  {...active,version:2},{...active,host:'codex'},
  {...active,scope:'new-work-only'},
  {...active,campaign:{...active.campaign,startedAtMs:now+1}},
  {...active,campaign:{...active.campaign,expiresAtMs:now+25*3_600_000}},
  {...active,campaign:{...active.campaign,cause:'arbitrary'}},
  {...active,campaign:{...active.campaign,unknown:true}},
  {...active,extra:'injection'},
 ])assert.deepEqual(decideClaudeBashToolWork(value,now),{action:'allow',state:'unconfirmed'})
})
test('research command Hook only refuses an actual Bash PreToolUse with active test state',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ap-claude-union-adapter-'))
 const file=join(dir,'action.json')
 const script=resolve(import.meta.dirname,'../scripts/claude-union-pre-tool-hook.mjs')
 const run=(hook:string)=>spawnSync(process.execPath,[script],{
  encoding:'utf8',input:JSON.stringify({hook_event_name:hook,tool_name:'Bash',
   tool_input:{command:'synthetic'}}),env:{...process.env,
    AGENT_PICKET_CLAUDE_UNION_TOOL_STATE_FILE:file},timeout:4000,
 })
 try{
  const stamp=Date.now()
  const live={...active,campaign:{...active.campaign,
   startedAtMs:stamp-1000,expiresAtMs:stamp+60_000}}
  writeFileSync(file,JSON.stringify(live),{mode:0o600})
  let p=run('PreToolUse');assert.equal(p.status,0)
  assert.equal(JSON.parse(p.stdout).hookSpecificOutput.permissionDecision,'deny')
  p=run('UserPromptSubmit');assert.equal(p.status,0);assert.equal(p.stdout,'')
  writeFileSync(file,JSON.stringify({...live,enabled:false}))
  p=run('PreToolUse');assert.equal(p.status,0);assert.equal(p.stdout,'')
  writeFileSync(file,'invalid-json')
  p=run('PreToolUse');assert.equal(p.status,0);assert.equal(p.stdout,'')
  assert.match(p.stderr,/no enforcement guarantee/)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
