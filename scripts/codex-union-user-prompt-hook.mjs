/**
 * Research-only Codex OFFICIAL UserPromptSubmit command hook.
 * Never silently install/trust it. The user must explicitly approve in Codex
 * /hooks and enable real strikes in Agent Picket. No prompt text is read.
 * Hooks can fail open; this is not a security enforcement boundary.
 */
import {readFileSync,lstatSync} from 'node:fs'
import {isAbsolute} from 'node:path'
import {decideCodexNewWorkRefusal} from '../src/adapters/codex/new-work-refusal.ts'

const filename=process.env.AGENT_PICKET_CODEX_UNION_STATE_FILE
if(typeof filename==='string'&&isAbsolute(filename)){
 try{
  const st=lstatSync(filename)
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>4096)
   throw Error('Invalid campaign state file')
  const state=JSON.parse(readFileSync(filename,'utf8'))
  const decision=decideCodexNewWorkRefusal(state,Date.now())
  if(decision.action==='block'){
   process.stdout.write(JSON.stringify({decision:'block',reason:decision.reason}))
  }else if(decision.state==='unconfirmed'){
   process.stderr.write('Agent Picket: union campaign state unconfirmed; cannot guarantee refusal.\n')
  }
 }catch{
  process.stderr.write('Agent Picket: union campaign state unavailable; hook cannot guarantee refusal.\n')
 }
}
