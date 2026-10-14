import {spawnSync} from 'node:child_process'
import {existsSync,lstatSync,mkdirSync,rmdirSync} from 'node:fs'
import {dirname,isAbsolute,parse,resolve} from 'node:path'

/**
 * Windows DACL can NOT be inferred from stat.mode. This opt-in probe never
 * weakens a filesystem ACL and must not be treated as durable storage support.
 * Uses only supported Windows OS facilities: Windows PowerShell & NTFS ACL.
 */
const INSPECT_SCRIPT=String.raw`
$ErrorActionPreference='Stop'
$p=$env:AGENT_PICKET_ACL_CHECK_PATH
if(-not $p){exit 10}
$item=Get-Item -LiteralPath $p -Force -ErrorAction Stop
if(($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0){exit 11}
$acl=if($item.PSIsContainer){[System.IO.Directory]::GetAccessControl($p)}else{[System.IO.File]::GetAccessControl($p)}
$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
try {
 $owner=([System.Security.Principal.NTAccount]$acl.Owner).Translate([System.Security.Principal.SecurityIdentifier]).Value
}catch {exit 12}
# A Windows elevated token may create files owned by builtin Administrators,
# like POSIX root. Only permit that for files with explicit current-user
# Modify rights and NO untrusted allow ACE; directories require exact owner.
if($owner -ne $me -and -not ((-not $item.PSIsContainer) -and
 $owner -eq 'S-1-5-32-544')){exit 13}
if($item.PSIsContainer -and -not $acl.AreAccessRulesProtected){exit 14}
$allowed=@($me,'S-1-5-18','S-1-5-32-544')
$hasOwnerModify=$false
$rules=$acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])
foreach($rule in $rules){
 $sid=$rule.IdentityReference.Value
 if($rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow){
  if($allowed -notcontains $sid){exit 15}
  if($sid -eq $me){
   $modify=[System.Security.AccessControl.FileSystemRights]::Modify
   if(($rule.FileSystemRights -band $modify) -eq $modify){$hasOwnerModify=$true}
  }
 }
}
if(-not $hasOwnerModify){exit 16}
Write-Output 'PRIVATE_NTFS_DACL_VERIFIED'
`

/** Read-only: no chmod, ACL mutation, process elevation or data access. */
export function verifyPrivateNtfsAcl(path:string,kind:'file'|'directory'):boolean {
  if(process.platform!=='win32'||typeof path!=='string'||path.length<3||!path.trim())
    return false
  try {
    const stat=lstatSync(path)
    if(stat.isSymbolicLink()||(kind==='file'?!stat.isFile()||stat.nlink!==1:!stat.isDirectory()))
      return false
    const encoded=Buffer.from(INSPECT_SCRIPT,'utf16le').toString('base64')
    const result=spawnSync('powershell.exe',[
      '-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded,
    ],{encoding:'utf8',windowsHide:true,timeout:12_000,maxBuffer:65_536,
      env:{...process.env,AGENT_PICKET_ACL_CHECK_PATH:path}})
    return result.status===0&&result.stdout.trim()==='PRIVATE_NTFS_DACL_VERIFIED'
  }catch{return false}
}


/**
 * Experimental native NTFS ACL proof for a tiny set of current SQLite paths.
 * Reuse the EXACT security-descriptor body of verifyPrivateNtfsAcl, but check
 * all paths in one PowerShell process. Every trusted read rechecks ownership.
 * Not an atomic handle-lock or tamper/rollback attestation.
 */
const BATCH_INSPECT_SCRIPT=INSPECT_SCRIPT.replace(
  '$p=$env:AGENT_PICKET_ACL_CHECK_PATH\nif(-not $p){exit 10}',
  [
    '$paths=@(ConvertFrom-Json -InputObject $env:AGENT_PICKET_ACL_CHECK_PATHS)',
    'if($paths.Count -lt 1 -or $paths.Count -gt 4){exit 10}',
    'foreach($p in $paths){',
    'if(-not $p){exit 10}',
  ].join('\n'),
) + '\n}\n'

export function verifyPrivateNtfsAclBatch(
  items:readonly {readonly path:string;readonly kind:'file'|'directory'}[],
):boolean {
  if(process.platform!=='win32'||items.length<1||items.length>4)return false
  try {
    const paths:string[]=[]
    for(const item of items){
      if(typeof item.path!=='string'||item.path.length<3||!item.path.trim())return false
      if(item.kind!=='file'&&item.kind!=='directory')return false
      const entry=lstatSync(item.path)
      if(entry.isSymbolicLink()||
        (item.kind==='file'?(!entry.isFile()||entry.nlink!==1):!entry.isDirectory()))
        return false
      if(paths.includes(item.path))return false
      paths.push(item.path)
    }
    const encoded=Buffer.from(BATCH_INSPECT_SCRIPT,'utf16le').toString('base64')
    const result=spawnSync('powershell.exe',[
      '-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded,
    ],{encoding:'utf8',windowsHide:true,timeout:15_000,maxBuffer:65_536,
      env:{...process.env,AGENT_PICKET_ACL_CHECK_PATHS:JSON.stringify(paths)}})
    const lines=result.stdout.trim().split(/\r?\n/)
    return result.status===0&&lines.length===items.length&&
      lines.every(line=>line.trim()==='PRIVATE_NTFS_DACL_VERIFIED')
  }catch{return false}
}


/**
 * Experimental NEW EMPTY directory creator. It does not relax DurableStats'
 * Windows NO-GO and must never mutate an already existing user directory.
 * Nothing sensitive is written between mkdir and DACL verification.
 */
const PROTECT_NEW_DIRECTORY=String.raw`
$ErrorActionPreference='Stop'
$p=$env:AGENT_PICKET_ACL_CHECK_PATH
if(-not $p){exit 10}
$info=Get-Item -LiteralPath $p -Force -ErrorAction Stop
if(-not $info.PSIsContainer){exit 11}
if(($info.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0){exit 12}
if(@([System.IO.Directory]::EnumerateFileSystemEntries($p)).Count -ne 0){exit 13}
$acl=[System.IO.Directory]::GetAccessControl($p)
$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.SetAccessRuleProtection($true,$false)
foreach($existing in @($acl.GetAccessRules($true,$false,
 [System.Security.Principal.SecurityIdentifier]))){
 $acl.RemoveAccessRuleSpecific($existing)
}
$acl.SetOwner($me)
foreach($sid in @($me.Value,'S-1-5-18','S-1-5-32-544')){
 $identity=New-Object System.Security.Principal.SecurityIdentifier($sid)
 $rule=New-Object System.Security.AccessControl.FileSystemAccessRule(
  $identity,[System.Security.AccessControl.FileSystemRights]::FullControl,
  [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',
  [System.Security.AccessControl.PropagationFlags]::None,
  [System.Security.AccessControl.AccessControlType]::Allow)
 $acl.AddAccessRule($rule)
}
[System.IO.Directory]::SetAccessControl($p,$acl)
Write-Output 'NEW_NTFS_DACL_PROTECTED'
`

export function createProtectedNtfsDirectory(path:string):boolean {
 if(process.platform!=='win32'||typeof path!=='string'||!isAbsolute(path)
   ||!path.trim()||existsSync(path))return false
 let created=false
 try {
   // Checking only the immediate parent is insufficient: an earlier
   // ancestor can itself be an NTFS junction that redirects our new folder
   // into an unrelated tree. This is read-only path validation; handle-based
   // atomic identity is still required before any production use.
   let current=dirname(resolve(path))
   const root=parse(current).root
   while(true){
     const p=lstatSync(current)
     if(!p.isDirectory()||p.isSymbolicLink())return false
     if(current.toLowerCase()===root.toLowerCase())break
     const next=dirname(current)
     if(next===current)return false
     current=next
   }
   mkdirSync(path,{recursive:false})
   created=true
   const check=lstatSync(path)
   if(!check.isDirectory()||check.isSymbolicLink())return false
   const encoded=Buffer.from(PROTECT_NEW_DIRECTORY,'utf16le').toString('base64')
   const result=spawnSync('powershell.exe',[
    '-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded,
   ],{encoding:'utf8',windowsHide:true,timeout:12_000,maxBuffer:65_536,
      env:{...process.env,AGENT_PICKET_ACL_CHECK_PATH:path}})
   if(result.status!==0||result.stdout.trim()!=='NEW_NTFS_DACL_PROTECTED')return false
   return verifyPrivateNtfsAcl(path,'directory')
 }catch{return false}
 finally {
   // A failed operation may remove its own still-empty test directory, but
   // MUST never recursively delete data written by another process.
   if(created&&!verifyPrivateNtfsAcl(path,'directory')){
    try{rmdirSync(path)}catch{/* preserve uncertain paths, never recurse */}
   }
 }
}
