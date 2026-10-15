#!/usr/bin/env node
/**
 * Bounded OFFICIAL native Windows Codex Goal test runner.
 * Does not intercept, mock, patch or authorize Host enforcement.
 * A hung Host leaves a failed CI job, not a passing or skipped test.
 */
import {spawn,spawnSync} from 'node:child_process'
import {join} from 'node:path'

if(process.platform!=='win32'||process.env.AGENT_PICKET_CODEX_GOAL_NATIVE!=='1'){
 console.error('CODEX_GOAL_WINDOWS_NATIVE_RUNNER_UNAVAILABLE')
 process.exit(2)
}
const root=join(import.meta.dirname,'..')
const script=join(root,'tests','codex-goal-native.real.test.ts')
const child=spawn(process.execPath,[
 '--experimental-strip-types','--test','--test-reporter=tap',script,
],{cwd:root,env:process.env,stdio:'inherit',windowsHide:true})
let completed=false
const timeout=setTimeout(()=>{
 if(completed)return
 completed=true
 console.error('CODEX_GOAL_NATIVE_WINDOWS_TIMEOUT: genuine Host cold Goal test exceeded 120 seconds')
 if(typeof child.pid==='number'){
  const stopped=spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{
   timeout:12_000,windowsHide:true,encoding:'utf8',
  })
  if(stopped.error||stopped.status!==0)
   console.error('CODEX_GOAL_NATIVE_WINDOWS_TREE_KILL_UNCONFIRMED')
 }
 process.exit(1)
},120_000)
child.once('error',()=>{
 if(completed)return
 completed=true;clearTimeout(timeout)
 console.error('CODEX_GOAL_NATIVE_WINDOWS_SPAWN_FAILED')
 process.exitCode=1
})
child.once('exit',(code,signal)=>{
 if(completed)return
 completed=true;clearTimeout(timeout)
 if(code!==0||signal!==null){
  console.error('CODEX_GOAL_NATIVE_WINDOWS_FAILED: official test exited without success')
  process.exitCode=1
 }else{
  console.log('CODEX_GOAL_NATIVE_WINDOWS_PASS=1')
 }
})
