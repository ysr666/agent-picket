/**
 * DSH's CommandRuntime persists command/done.text to Session history even
 * with recordInput:false. Never return user-owned Host archive JSON as the
 * command result. Instead, create a file at an EXPLICIT user-supplied path.
 * This is the native-Host side only; browser download stays in its own UI.
 */
import {open} from 'node:fs/promises'
import {fstatSync,lstatSync,unlinkSync} from 'node:fs'
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
  let owned:{dev:number;ino:number}|null=null
  const assertOwnPath=()=>{
    // Checking the selected pathname and the original descriptor matters
    // BOTH on error cleanup and on success: another filesystem actor may
    // have renamed our open file and placed an unrelated file at that path.
    if(!owned?.ino)throw new Error('Cannot verify private export file identity')
    const current=lstatSync(userPath)
    if(!current.isFile()||current.dev!==owned.dev||current.ino!==owned.ino)
      throw new Error('Private export destination changed during write')
  }
  try {
    const stat=fstatSync(file.fd)
    owned={dev:stat.dev,ino:stat.ino}
    guard()
    assertOwnPath()
    await file.writeFile(json,{encoding:'utf8'})
    guard()
    assertOwnPath()
    await file.sync()
    guard()
    assertOwnPath()
    await file.close()
    closed=true
    assertOwnPath()
  } catch(error) {
    // Cleanup may run after another actor has renamed/replaced the file we
    // opened. Never unlink a different user's file by pathname alone.
    // Capture the OPEN descriptor's identity before closing it, then check
    // the path again synchronously with no JS scheduling point in between.
    // An adversarial second OS process may still race lstat+unlink; the
    // official Host must own its private export directory for strong isolation.
    if(!closed){
      if(!owned)try{const stat=fstatSync(file.fd);owned={dev:stat.dev,ino:stat.ino}}catch{}
      await file.close().catch(()=>{})
    }
    if(owned?.ino){
      try{
        const atPath=lstatSync(userPath)
        if(atPath.dev===owned.dev && atPath.ino===owned.ino && atPath.isFile())
          unlinkSync(userPath)
      }catch{ /* never hide the original failure or remove a replacement */ }
    }
    throw error
  }
}
