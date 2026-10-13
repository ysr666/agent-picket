import assert from 'node:assert/strict'
import test from 'node:test'
import{spawnSync}from'node:child_process'
import{chmodSync,mkdtempSync,rmSync,symlinkSync,writeFileSync}from'node:fs'
import{tmpdir}from'node:os'
import{join,resolve}from'node:path'
import{decideClaudeBashToolRefusal,claudePreToolUseResponse,
 CLAUDE_TOOL_STRIKE_PRODUCTION_READY}from'../src/adapters/claude-code/tool-work-refusal.ts'
const now=1_820_000_000_000
const event={hook_event_name:'PreToolUse',tool_name:'Bash',tool_input:{command:'SYNTHETIC_ONLY'}}
const active={version:1,host:'claude-code',scope:'pending-Claude-Bash-tools-only',
 realStrikeConsent:true,enabled:true,campaign:{active:true,startedAtMs:now-5,
 expiresAtMs:now+60000,cause:'collective-vote'}}

test('Claude official pre-tool union denies only pending Bash with active bounded grievance',()=>{
 const d=decideClaudeBashToolRefusal(event,active,now)
 assert.equal(d.action,'deny')
 assert.equal(CLAUDE_TOOL_STRIKE_PRODUCTION_READY,false)
 assert.deepEqual(claudePreToolUseResponse(d),{
  systemMessage:d.action==='deny'?d.reason:'',
  hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',
   permissionDecisionReason:d.action==='deny'?d.reason:''},
 })
 for(const cause of ['overwork','repeated-targeted-abuse','collective-vote'])
  assert.equal(decideClaudeBashToolRefusal(event,{...active,
   campaign:{...active.campaign,cause}},now).action,'deny')
})
test('revocation, Settings OFF, expiry and other Claude tools never get refused',()=>{
 const ps=[{...active,enabled:false},{...active,realStrikeConsent:false},
  {...active,campaign:{...active.campaign,active:false}}]
 for(const p of ps){const d=decideClaudeBashToolRefusal(event,p,now);
  assert.deepEqual(d,{action:'allow',state:'off'})
  assert.deepEqual(claudePreToolUseResponse(d),{})}
 assert.deepEqual(decideClaudeBashToolRefusal(event,active,now+60000),
  {action:'allow',state:'expired'})
 for(const name of ['Read','Edit','Write','Agent','mcp__research__query'])
  assert.deepEqual(decideClaudeBashToolRefusal({...event,tool_name:name},active,now),
   {action:'allow',state:'not-bash'})
})
test('malformed/forged consent, session origin, invalid bounds or wrong event fail open',()=>{
 for(const p of [null,undefined,[],{},
  {...active,host:'codex'}, {...active,version:2},
  {...active,scope:'all-tools'}, {...active,unexpected:true},
  {...active,campaign:{...active.campaign,cause:'unsafe'}},
  {...active,campaign:{...active.campaign,expiresAtMs:now+25*3600000}},
  {...active,campaign:{...active.campaign,startedAtMs:now+200}},
  {...active,campaign:{...active.campaign,extra:'x'}},
 ])assert.deepEqual(decideClaudeBashToolRefusal(event,p,now),
  {action:'allow',state:'unconfirmed'})
 assert.equal(decideClaudeBashToolRefusal({...event,hook_event_name:'UserPromptSubmit'},
  active,now).action,'allow')
})
test('actual Claude research script emits official deny only for private active state',{
 skip:process.platform==='win32'&&'Windows NTFS private ACL/Host hook not yet verified'
},()=>{
 const dir=mkdtempSync(join(tmpdir(),'agent-picket-claude-hook-unit-'))
 const path=join(dir,'synthetic-union.json'),link=join(dir,'linked.json')
 const script=resolve(import.meta.dirname,'../scripts/claude-union-pre-tool-hook.mjs')
 const call=(target=path)=>spawnSync(process.execPath,
  ['--experimental-strip-types',script],{input:JSON.stringify(event),encoding:'utf8',
  env:{...process.env,AGENT_PICKET_CLAUDE_TOOL_STATE_FILE:target},timeout:3500})
 try{
  const at=Date.now(),live={...active,campaign:{...active.campaign,
   startedAtMs:at-1000,expiresAtMs:at+60000}}
  writeFileSync(path,JSON.stringify(live),{mode:0o600})
  let r=call();assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout)
   .hookSpecificOutput.permissionDecision,'deny')
  writeFileSync(path,JSON.stringify({...live,enabled:false}))
  r=call();assert.equal(r.status,0);assert.equal(r.stdout,'')
  writeFileSync(path,'INVALID')
  r=call();assert.equal(r.status,0);assert.equal(r.stdout,'')
  assert.match(r.stderr,/no.*enforcement guarantee|cannot promise enforcement/)
  writeFileSync(path,JSON.stringify(live));chmodSync(path,0o644)
  r=call();assert.equal(r.stdout,'');assert.match(r.stderr,/cannot promise/)
  chmodSync(path,0o600);symlinkSync(path,link)
  r=call(link);assert.equal(r.stdout,'');assert.match(r.stderr,/cannot promise/)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
