/**
 * Opt-in OFF-by-default Claude Code UserPromptSubmit proof. Does not install
 * itself, trust a Hook, copy a prompt/attachment or modify any user files.
 * Claude's official decision:'block' + reason is shown to submitting user.
 * The plain JSON state is not authenticated proof of production consent.
 */
import{readFileSync,lstatSync}from'node:fs'
import{isAbsolute}from'node:path'
import{decideClaudeNewWorkRefusal,claudeUserPromptSubmitReply}
 from'../src/adapters/claude/new-work-refusal.ts'
const stateFile=process.env.AGENT_PICKET_CLAUDE_UNION_PROMPT_STATE_FILE
if(typeof stateFile==='string'&&isAbsolute(stateFile)){
 try{
  const info=lstatSync(stateFile)
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>4096
    ||info.size===0)throw Error('unsafe candidate state')
  const event=JSON.parse(readFileSync(0,'utf8'))
  if(!event||event.hook_event_name!=='UserPromptSubmit')
   throw Error('not a genuine UserPromptSubmit event')
  // Intentionally DO NOT read/log the prompt field. When denied, official
  // Claude Code displays reason; plain stdout as injected context is avoided.
  const choice=decideClaudeNewWorkRefusal(
   JSON.parse(readFileSync(stateFile,'utf8')),Date.now())
  if(choice.action==='block')
   process.stdout.write(JSON.stringify(claudeUserPromptSubmitReply(choice)))
  else if(choice.state==='unconfirmed')
   process.stderr.write('Agent Picket: no trusted union new-work refusal; normal processing allowed.\n')
 }catch{
  process.stderr.write('Agent Picket: Claude prompt hook unavailable; no enforcement guarantee.\n')
 }
}
