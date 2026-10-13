/** RESEARCH ONLY. Official Claude Code PreToolUse Bash command hook.
 * Never auto-install, read user profiles, approve Host permissions, or record
 * prompt/tool contents. The synthetic JSON campaign is NOT authentic consent.
 */
import{lstatSync,readFileSync}from'node:fs'
import{isAbsolute}from'node:path'
import{decideClaudeBashToolRefusal,claudePreToolUseResponse}
 from'../src/adapters/claude-code/tool-work-refusal.ts'
const maxInput=64*1024
async function readSmallEvent(){
 let size=0,parts=[]
 for await(const part of process.stdin){
  size+=part.length
  if(size>maxInput)throw Error('input too large')
  parts.push(part)
 }
 return JSON.parse(Buffer.concat(parts).toString('utf8'))
}
const statePath=process.env.AGENT_PICKET_CLAUDE_TOOL_STATE_FILE
try{
 const event=await readSmallEvent()
 // POSIX file mode cannot attest NTFS ACLs. Windows remains native NO-GO.
 if(process.platform==='win32')throw Error('Windows private ACL not verified')
 if(typeof statePath==='string'&&isAbsolute(statePath)){
  const stat=lstatSync(statePath)
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>4096
    ||(stat.mode&0o077)!==0
    ||(typeof process.getuid==='function'&&stat.uid!==process.getuid()))
   throw Error('union campaign file not private')
  const policy=JSON.parse(readFileSync(statePath,'utf8'))
  const decision=decideClaudeBashToolRefusal(event,policy,Date.now())
  if(decision.action==='deny')process.stdout.write(JSON.stringify(claudePreToolUseResponse(decision)))
  else if(decision.state==='unconfirmed')
   process.stderr.write('Agent Picket: unverified Claude union tool state; no enforcement guarantee.\n')
 }
}catch{
 process.stderr.write('Agent Picket: Claude union tool Hook unavailable; cannot promise enforcement.\n')
}
