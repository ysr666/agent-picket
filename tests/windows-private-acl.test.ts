import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {verifyPrivateNtfsAcl} from '../src/adapters/node/windows-private-acl.ts'

test('Windows ACL probe explicitly refuses unsupported Unix platform',()=>{
  if(process.platform==='win32')return
  assert.equal(verifyPrivateNtfsAcl('/tmp','directory'),false)
})

test('NTFS DACL check rejects a default inherited directory and missing file',{
  skip:process.platform!=='win32'&&'Native Windows-only ACL verification',
},()=>{
  const root=mkdtempSync(join(tmpdir(),'agent-picket-acl-'))
  try {
    assert.equal(verifyPrivateNtfsAcl(join(root,'missing'),'file'),false)
    // An inherited temp DACL is NOT evidence of protected directory rights.
    assert.equal(verifyPrivateNtfsAcl(root,'directory'),false)
    const file=join(root,'sample.json')
    writeFileSync(file,'{}',{mode:0o600})
    // A file inside an unverified parent must never grant permission to
    // enable DurableStats by itself: owner directory remains unverified.
    assert.equal(verifyPrivateNtfsAcl(root,'directory'),false)
  }finally{rmSync(root,{recursive:true,force:true})}
})


test('native Windows ACL verifier accepts only owner-only protected directories and safe files',{
  skip:process.platform!=='win32'&&'Windows NTFS ACL integration only',
  timeout:20_000,
},()=>{
 const root=mkdtempSync(join(tmpdir(),'agent-picket-ntfs-positive-'))
 try {
  const script=String.raw`
$ErrorActionPreference='Stop'
$p=$env:AGENT_PICKET_WINDOWS_TEST_PATH
$acl=[System.IO.Directory]::GetAccessControl($p)
$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.SetAccessRuleProtection($true,$false)
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
`
  const secured=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive',
   '-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{
   encoding:'utf8',timeout:10_000,windowsHide:true,
   env:{...process.env,AGENT_PICKET_WINDOWS_TEST_PATH:root},
  })
  assert.equal(secured.status,0,secured.stderr??'Native NTFS setup failed')
  assert.equal(verifyPrivateNtfsAcl(root,'directory'),true,
   'The native verifier should accept an explicit owner-only protected DACL')
  const file=join(root,'aggregate.json')
  writeFileSync(file,'{}',{mode:0o600})
  assert.equal(verifyPrivateNtfsAcl(file,'file'),true,
   'New files inheriting an approved owner-only DACL must be recognized')
  const publicGrant=spawnSync('icacls',[file,'/grant','*S-1-1-0:(R)'],{
   encoding:'utf8',timeout:6_000,windowsHide:true,
  })
  assert.equal(publicGrant.status,0,publicGrant.stderr??'Failed to set test ACL')
  assert.equal(verifyPrivateNtfsAcl(file,'file'),false,
   'Granting even read access to Everyone must revoke private-file verification')
 }finally{rmSync(root,{recursive:true,force:true})}
})
