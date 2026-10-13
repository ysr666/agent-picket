import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtempSync,writeFileSync,openSync,writeSync,fsyncSync,closeSync,
  renameSync,rmSync,symlinkSync,lstatSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createProtectedNtfsDirectory} from '../src/adapters/node/windows-private-acl.ts'
import {inspectPrivateNtfsLedgerLayout} from '../src/adapters/node/windows-ledger-layout.ts'

test('NTFS layout probe stays unsupported on non-Windows systems',()=>{
 if(process.platform!=='win32')assert.equal(inspectPrivateNtfsLedgerLayout('/tmp').private,false)
})

test('real NTFS synthetic WAL, private snapshot rename and lock lifecycle',{
 skip:process.platform!=='win32'&&'Native Windows only',timeout:35_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'agent-picket-ntfs-layout-'))
 const dir=join(parent,'fresh-secure-ledger')
 try{
  assert.equal(createProtectedNtfsDirectory(dir),true)
  assert.deepEqual(inspectPrivateNtfsLedgerLayout(dir),{
    private:true,reason:'verified',fileCount:0})
  const temp=join(dir,'aggregate.v1-0123456789abcdef.tmp')
  const fd=openSync(temp,'wx',0o600)
  try{writeSync(fd,Buffer.from('{"version":1}'));fsyncSync(fd)}finally{closeSync(fd)}
  assert.equal(inspectPrivateNtfsLedgerLayout(dir).private,true)
  renameSync(temp,join(dir,'aggregate.v1.json'))
  assert.equal(inspectPrivateNtfsLedgerLayout(dir).private,true,
   'Atomic snapshot rename must preserve private NTFS DACL')
  const journal=join(dir,'aggregate.v1.journal')
  const log=openSync(journal,'a',0o600)
  try{writeSync(log,Buffer.from('synthetic-event\\n'));fsyncSync(log)}finally{closeSync(log)}
  // DurableStats checkpoint replaces an EXISTING journal, not merely a
  // missing snapshot: verify Windows NTFS rename/overwrite semantics.
  const checkpoint=join(dir,'aggregate.v1-fedcba9876543210.tmp')
  const checkpointFd=openSync(checkpoint,'wx',0o600)
  try {fsyncSync(checkpointFd)}finally{closeSync(checkpointFd)}
  assert.equal(inspectPrivateNtfsLedgerLayout(dir).private,true)
  renameSync(checkpoint,journal)
  assert.equal(inspectPrivateNtfsLedgerLayout(dir).private,true,
    'Replacing the old journal with a checkpoint temp must preserve its private ACL')
  const lock=join(dir,'aggregate.v1.lock')
  writeFileSync(lock,'synthetic-process-lock',{flag:'wx',mode:0o600})
  assert.deepEqual(inspectPrivateNtfsLedgerLayout(dir),{
   private:true,reason:'verified',fileCount:3})
  // A second process must not accidentally replace a currently-held wx lock.
  assert.throws(()=>writeFileSync(lock,'other-owner',{flag:'wx'}),{code:'EEXIST'})
  const publicGrant=spawnSync('icacls',[journal,'/grant','*S-1-1-0:(R)'],{
   encoding:'utf8',windowsHide:true,timeout:8_000})
  assert.equal(publicGrant.status,0,'Test ACL change must succeed')
  assert.equal(inspectPrivateNtfsLedgerLayout(dir).private,false,
   'A single publicly readable WAL invalidates the entire ledger layout')
 }finally{rmSync(parent,{recursive:true,force:true})}
})

test('unknown files always reject the NTFS ledger directory',{
 skip:process.platform!=='win32'&&'Native Windows only',timeout:35_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'agent-picket-ntfs-negative-'))
 const dir=join(parent,'private-ledger')
 try{
  assert.equal(createProtectedNtfsDirectory(dir),true)
  writeFileSync(join(dir,'surprise.tmp'),'untrusted',{flag:'wx'})
  assert.equal(inspectPrivateNtfsLedgerLayout(dir).reason,'unexpected-file')
 }finally{rmSync(parent,{recursive:true,force:true})}
})


test('native NTFS junction alias cannot inherit a valid private-ledger verdict',{
 skip:process.platform!=='win32'&&'Real Windows junction/reparse test',timeout:20_000,
},()=>{
 const parent=mkdtempSync(join(tmpdir(),'agent-picket-junction-'))
 const genuine=join(parent,'private-ledger')
 const alias=join(parent,'redirected-ledger')
 try{
  assert.equal(createProtectedNtfsDirectory(genuine),true)
  assert.equal(inspectPrivateNtfsLedgerLayout(genuine).private,true)
  // A Windows junction requires no symlink development-mode privileges and
  // must be rejected before any ACL or file access through the alias.
  symlinkSync(genuine,alias,'junction')
  assert.equal(lstatSync(alias).isSymbolicLink(),true,
    'The test actually produced a reparse/junction directory')
  const inspected=inspectPrivateNtfsLedgerLayout(alias)
  assert.equal(inspected.private,false)
  assert.equal(inspected.reason,'unsafe-ancestor')
  assert.equal(inspectPrivateNtfsLedgerLayout(genuine).private,true,
    'Rejecting an alias does not damage or change the genuine private ledger')
 }finally{rmSync(parent,{recursive:true,force:true})}
})
