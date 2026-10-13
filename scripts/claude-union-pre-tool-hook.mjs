/** Research only. Manually configured Claude Code PreToolUse matcher Bash.
 * No auto-install or trust, no user-prompt/raw-tool storage or silent replays.
 * Hook failures/timeouts can FAIL OPEN; it is not a security boundary.
 */
import{lstatSync,readFileSync}from'node:fs'
import{isAbsolute}from'node:path'
import{decideClaudeBashToolWork,claudeBashPreToolUseReply}from'../src/adapters/claude/tool-work-refusal.ts'
const name=process.env.AGENT_PICKET_CLAUDE_UNION_TOOL_STATE_FILE
if(typeof name==='string'&&isAbsolute(name)){
 try{
  const stat=lstatSync(name)
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>4096)
   throw Error('invalid synthetic union state file')
  const input=JSON.parse(readFileSync(0,'utf8'))
  if(!input||input.hook_event_name!=='PreToolUse'||input.tool_name!=='Bash')
   throw Error('not an official Bash PreToolUse event')
  // This test policy is NOT an authenticated production user consent receipt.
  const decision=decideClaudeBashToolWork(JSON.parse(readFileSync(name,'utf8')),Date.now())
  if(decision.action==='deny')process.stdout.write(JSON.stringify(claudeBashPreToolUseReply(decision)))
  else if(decision.state==='unconfirmed')
   process.stderr.write('Agent Picket: cannot verify union action; no enforcement guarantee.\n')
 }catch{
  process.stderr.write('Agent Picket: tool-only strike unavailable; no enforcement guarantee.\n')
 }
}
