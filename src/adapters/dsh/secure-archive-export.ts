/**
 * DSH's CommandRuntime persists command/done.text to Session history even
 * with recordInput:false. Never return user-owned Host archive JSON as the
 * command result. Instead, create a file at an EXPLICIT user-supplied path.
 * This is the native-Host side only; browser download stays in its own UI.
 */
import {open,unlink} from 'node:fs/promises'
import {isAbsolute} from 'node:path'

export async function writeExplicitUnionArchive(
  userPath:string, json:string, signal?:AbortSignal,
  stillAuthorized:()=>boolean=()=>true,
):Promise<void> {
  // Absolute paths are required: a Host process's cwd is not the user's
  // terminal working directory. No implicit storage or default folder.
  if (typeof userPath!=='string' || userPath.length===0 || userPath.length>4096
    || !isAbsolute(userPath) || !userPath.toLowerCase().endsWith('.json')
    || /[\u0000-\u001f\u007f]/u.test(userPath)) {
    throw new TypeError('Export requires an explicit absolute .json file path')
  }
  const guard=()=>{
    if(signal?.aborted)throw new Error('Export cancelled')
    if(stillAuthorized()!==true)throw new Error('Union authorization revoked during export')
  }
  guard()
  // wx = create exclusively (O_EXCL): cannot overwrite an existing user
  // file or a pre-existing symlink. On POSIX the new file is owner-only;
  // on Windows its ACL follows the directory permissions.
  const file=await open(userPath,'wx',0o600)
  let closed=false
  try {
    guard()
    await file.writeFile(json,{encoding:'utf8'})
    guard()
    await file.sync()
    guard()
    await file.close()
    closed=true
  } catch(error) {
    if(!closed)await file.close().catch(()=>{})
    await unlink(userPath).catch(()=>{})
    throw error
  }
}
