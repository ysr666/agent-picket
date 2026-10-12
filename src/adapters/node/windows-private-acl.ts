import {spawnSync} from 'node:child_process'
import {lstatSync} from 'node:fs'

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
if($owner -ne $me){exit 13}
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
    ],{encoding:'utf8',windowsHide:true,timeout:7_000,maxBuffer:65_536,
      env:{...process.env,AGENT_PICKET_ACL_CHECK_PATH:path}})
    return result.status===0&&result.stdout.trim()==='PRIVATE_NTFS_DACL_VERIFIED'
  }catch{return false}
}
