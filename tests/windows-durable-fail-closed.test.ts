import assert from 'node:assert/strict'
import test from 'node:test'
import {existsSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DurableStats} from '../src/adapters/node/durable-stats.ts'

test('unsupported Windows durable analytics refuses before creating any ledger path',{
 skip:process.platform!=='win32'&&'Windows production fail-closed gate only',
},()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-windows-ledger-refusal-'))
 const intended=join(root,'must-not-create','stats')
 try{
  assert.equal(existsSync(intended),false)
  assert.throws(()=>new DurableStats(intended),
   /Windows DurableStats disabled: verified private NTFS ledger backend required/)
  assert.equal(existsSync(join(root,'must-not-create')),false,
   'A refused ledger must not leave any unverified directory or file behind')
 }finally{rmSync(root,{recursive:true,force:true})}
})
