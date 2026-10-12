import {lstatSync,readdirSync} from 'node:fs'
import {dirname,isAbsolute,join,parse,resolve} from 'node:path'
import {verifyPrivateNtfsAcl} from './windows-private-acl.ts'

/** Experimental READ-ONLY NTFS ledger layout preflight, never a write permit. */
const NAMES=new Set([
  'aggregate.v1.json','aggregate.v1.journal',
  'aggregate.v1.lock','aggregate.v1.recovery',
])
const SNAPSHOT_TEMP=/^aggregate\.v1-[0-9a-f]{16}\.tmp$/

/** Fail closed for unrecognized files, junction ancestors and non-private ACLs. */
export function inspectPrivateNtfsLedgerLayout(directory:string):{
 readonly private:boolean
 readonly reason:'verified'|'platform'|'unsafe-directory'|'unsafe-ancestor'|'unexpected-file'|'unsafe-file'
 readonly fileCount:number
}{
 const no=(reason: 'platform'|'unsafe-directory'|'unsafe-ancestor'|'unexpected-file'|'unsafe-file')=>
  ({private:false,reason,fileCount:0} as const)
 if(process.platform!=='win32'||typeof directory!=='string'||!isAbsolute(directory))
  return no('platform')
 try{
  // Reject NTFS reparse/junction/symlink ancestors, not only final path.
  let cursor=resolve(directory)
  const root=parse(cursor).root
  while(true){
   const meta=lstatSync(cursor)
   if(meta.isSymbolicLink()||!meta.isDirectory())return no('unsafe-ancestor')
   if(cursor.toLowerCase()===root.toLowerCase())break
   const parent=dirname(cursor)
   if(parent===cursor)return no('unsafe-ancestor')
   cursor=parent
  }
  if(!verifyPrivateNtfsAcl(directory,'directory'))return no('unsafe-directory')
  const names=readdirSync(directory)
  for(const name of names){
   if(!NAMES.has(name)&&!SNAPSHOT_TEMP.test(name))return no('unexpected-file')
   // Always inspect actual SECURITY DESCRIPTOR of every file, not POSIX mode.
   if(!verifyPrivateNtfsAcl(join(directory,name),'file'))return no('unsafe-file')
  }
  return {private:true,reason:'verified',fileCount:names.length} as const
 }catch{return no('unsafe-directory')}
}
