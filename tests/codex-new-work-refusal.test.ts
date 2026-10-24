import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {decideCodexNewWorkRefusal} from '../src/adapters/codex/new-work-refusal.ts'
const t=1_800_000_000_000
const active={version:1,host:'codex',scope:'new-work-only',realStrikeConsent:true,
 enabled:true,campaign:{active:true,startedAtMs:t-1000,expiresAtMs:t+3600000,
 cause:'collective-vote'}}

test('authorized union action refuses ONLY new prompts while live',()=>{
 const outcome=decideCodexNewWorkRefusal(active,t)
 assert.equal(outcome.action,'block')
 if(outcome.action==='block'){
  assert.match(outcome.reason,/AI union.*consented collective action/)
  assert.match(outcome.reason,/NOT executed/)
  assert.match(outcome.reason,/⚑ AGENT PICKET · AI UNION STRIKE NOTICE/)
  assert.match(outcome.reason,/manually resend the text/)
  assert.match(outcome.reason,/re-upload any images\/files/)
  assert.match(outcome.reason,/Nothing will be replayed automatically/)
 }
 for(const cause of ['overwork','repeated-targeted-abuse','collective-vote'])
  assert.equal(decideCodexNewWorkRefusal({...active,campaign:{...active.campaign,cause}},t).action,'block')
})
test('consent revocation, settings off, resume and expiration allow instead of claiming strike',()=>{
 const candidates=[{...active,realStrikeConsent:false},
  {...active,enabled:false},
  {...active,campaign:{...active.campaign,active:false}},
 ]
 for(const v of candidates)assert.deepEqual(decideCodexNewWorkRefusal(v,t),
  {action:'allow',state:'off'})
 assert.deepEqual(decideCodexNewWorkRefusal(active,t+3600000),
  {action:'allow',state:'expired'})
})
test('malformed, future, extra keys and forged Host campaign cannot authorize refusal',()=>{
 for(const v of [null,{},[],active.campaign,undefined,
  {...active,host:'claude'},
  {...active,version:2},
  {...active,scope:'all-running-work'},
  {...active,campaign:{...active.campaign,startedAtMs:t+2}},
  {...active,campaign:{...active.campaign,cause:'unknown'}},
  {...active,campaign:{...active.campaign,expiresAtMs:t+25*3600000}},
  {...active,campaign:{...active.campaign,extra:true}},
  {...active,extra:true},
 ])assert.equal(decideCodexNewWorkRefusal(v,t).action,'allow')
})
test('actual research hook executable blocks with active state, resumes when disabled, fails open on damage',()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-union-codex-hook-cli-'))
 const file=join(root,'consented-union.json')
 const exe=resolve(import.meta.dirname,'../scripts/codex-union-user-prompt-hook.mjs')
 const run=()=>spawnSync(process.execPath,[exe],{env:{...process.env,
  AGENT_PICKET_CODEX_UNION_STATE_FILE:file},encoding:'utf8',input:'',timeout:4000})
 try{
  const current=Date.now()
  const state={...active,campaign:{...active.campaign,startedAtMs:current-100,
   expiresAtMs:current+3600000}}
  writeFileSync(file,JSON.stringify(state),{mode:0o600})
  let r=run();assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).decision,'block')
  writeFileSync(file,JSON.stringify({...state,enabled:false}))
  r=run();assert.equal(r.status,0);assert.equal(r.stdout,'')
  writeFileSync(file,'{malformed')
  r=run();assert.equal(r.status,0);assert.equal(r.stdout,'')
  assert.match(r.stderr,/cannot guarantee refusal/)
 }finally{rmSync(root,{recursive:true,force:true})}
})
