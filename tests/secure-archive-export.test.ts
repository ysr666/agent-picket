import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,writeFileSync,lstatSync,rmSync,symlinkSync,renameSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {writeExplicitUnionArchive} from '../src/adapters/dsh/secure-archive-export.ts'

test('file archive export is explicitly located, exclusive, owner-only and does not overwrite',async()=>{
 const root=mkdtempSync(join(tmpdir(),'picket-explicit-private-export-'))
 try{
  const path=join(root,'cases.json')
  const privateJson='{"format":"agent-picket-union-cases","PRIVATE_CASE_SENTINEL":true}\n'
  await writeExplicitUnionArchive(path,privateJson)
  assert.equal(readFileSync(path,'utf8'),privateJson)
  if(process.platform!=='win32')
   assert.equal(lstatSync(path).mode&0o777,0o600)
  await assert.rejects(writeExplicitUnionArchive(path,'{"overwritten":true}'),{
    code:'EEXIST',
  })
  assert.equal(readFileSync(path,'utf8'),privateJson)
  // O_EXCL must never follow a destination symlink.
  const other=join(root,'original.json')
  writeFileSync(other,'DO NOT MODIFY')
  const symlink=join(root,'alias.json')
  symlinkSync(other,symlink)
  await assert.rejects(writeExplicitUnionArchive(symlink,privateJson),{code:'EEXIST'})
  assert.equal(readFileSync(other,'utf8'),'DO NOT MODIFY')
  for(const bad of ['archive.json','',root,'../path.json','\0.json','no.json\njunk',root+'/wrong.txt'])
   await assert.rejects(writeExplicitUnionArchive(bad,privateJson))
  const spaced=join(root,'committee case history.json')
  await writeExplicitUnionArchive(spaced,privateJson)
  assert.equal(readFileSync(spaced,'utf8'),privateJson)
  assert.equal(lstatSync(path).isFile(),true)
 } finally {rmSync(root,{recursive:true,force:true})}
})
test('abort before file creation does not leave another retained copy',async()=>{
 const root=mkdtempSync(join(tmpdir(),'picket-export-abort-'))
 try {
  const controller=new AbortController()
  controller.abort()
  await assert.rejects(writeExplicitUnionArchive(join(root,'file.json'),'secret',controller.signal),
   /Export cancelled/)
  assert.throws(()=>readFileSync(join(root,'file.json')))
 } finally {rmSync(root,{recursive:true,force:true})}
})


test('a Host consent revocation during export unlinks the newly written file',async()=>{
 const root=mkdtempSync(join(tmpdir(),'picket-export-revocation-'))
 try {
  const file=join(root,'revoked.json')
  let checks=0
  await assert.rejects(writeExplicitUnionArchive(file,'{"PRIVATE_CASE":"do not retain"}',
   undefined,()=>++checks<=2),/revoked/)
  assert.ok(checks>=3)
  assert.throws(()=>readFileSync(file),'A revoked Host cannot leave an extra export copy')
 } finally {rmSync(root,{recursive:true,force:true})}
})

test('revoked export never deletes a different file swapped into its destination',async()=>{
 const root=mkdtempSync(join(tmpdir(),'picket-export-replace-race-'))
 try {
  const original=join(root,'case.json')
  const moved=join(root,'old-export.json')
  let calls=0
  await assert.rejects(writeExplicitUnionArchive(original,'PRIVATE_SECRET_EXPORT',undefined,()=>{
   calls++
   if(calls===3){
    // A separate actor renamed the newly created export to a different path
    // and installed an unrelated valuable file at the original path.
    renameSync(original,moved)
    writeFileSync(original,'USER_FILE_DO_NOT_DELETE')
    return false
   }
   return true
  }),/revoked/)
  assert.equal(readFileSync(original,'utf8'),'USER_FILE_DO_NOT_DELETE',
   'Cleanup must never unlink a replacement belonging to another actor')
 } finally{rmSync(root,{recursive:true,force:true})}
})

test('a swapped destination cannot be falsely reported as a successful private export',async()=>{
 const root=mkdtempSync(join(tmpdir(),'picket-export-swapped-success-'))
 try{
  const destination=join(root,'original.json')
  const relocated=join(root,'relocated-secret.json')
  let probes=0
  await assert.rejects(writeExplicitUnionArchive(destination,'PRIVATE_EXPORTED_JSON',undefined,()=>{
   probes++
   if(probes===3){
    renameSync(destination,relocated)
    writeFileSync(destination,'DIFFERENT_USER_FILE')
   }
   return true
  }),/replaced|destination|changed/,
  'Host must not claim export success if the user-selected path no longer contains its file')
  assert.equal(readFileSync(destination,'utf8'),'DIFFERENT_USER_FILE',
   'Never delete or overwrite the replacement user file')
 }finally{rmSync(root,{recursive:true,force:true})}
})
