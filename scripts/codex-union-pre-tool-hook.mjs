/**
 * RESEARCH ONLY. Official Codex `PreToolUse`, matcher `^Bash$`.
 * NO auto installation, auto trust, input collection or process interception.
 * Hook errors FAIL OPEN on pinned native Codex; do not advertise as security.
 */
import{readFileSync,lstatSync}from'node:fs'
import{isAbsolute}from'node:path'
import{decideCodexToolWorkRefusal,codexPreToolUseResponse}from'../src/adapters/codex/tool-work-refusal.ts'
const path=process.env.AGENT_PICKET_CODEX_UNION_TOOL_STATE_FILE
if(typeof path==='string'&&isAbsolute(path)){
 try{
  const st=lstatSync(path)
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>4096)
   throw Error('invalid local union state')
  const decision=decideCodexToolWorkRefusal(JSON.parse(readFileSync(path,'utf8')),Date.now())
  if(decision.action==='deny')
   process.stdout.write(JSON.stringify(codexPreToolUseResponse(decision)))
  else if(decision.state==='unconfirmed')
   process.stderr.write('Agent Picket: cannot verify union tool hold; no blocking guarantee.\n')
 }catch{
  process.stderr.write('Agent Picket: union tool state unavailable; no blocking guarantee.\n')
 }
}
