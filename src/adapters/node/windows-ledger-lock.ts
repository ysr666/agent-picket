import {existsSync,readFileSync} from 'node:fs'
import {hostname} from 'node:os'
import {join} from 'node:path'
import {inspectPrivateNtfsLedgerLayout} from './windows-ledger-layout.ts'

/**
 * Read-only Windows lock inspection. A dead PID is NOT permission to steal.
 * The real DurableStats Windows backend remains disabled.
 */
export type WindowsLockObservation =
 | {readonly status:'live-owner'}
 | {readonly status:'stale-candidate'}
 | {readonly status:'absent'}
 | {readonly status:'unconfirmed'}

const TOKEN=/^[0-9a-f]{32}$/
export function inspectPrivateNtfsLedgerLock(directory:string):WindowsLockObservation {
 const unknown:WindowsLockObservation={status:'unconfirmed'}
 if(process.platform!=='win32')return unknown
 try {
  const state=inspectPrivateNtfsLedgerLayout(directory)
  if(!state.private)return unknown
  const lock=join(directory,'aggregate.v1.lock')
  const recovery=join(directory,'aggregate.v1.recovery')
  if(existsSync(recovery))return unknown // NEVER race an active/abandoned recovery
  if(!existsSync(lock))return {status:'absent'}
  const raw=readFileSync(lock)
  if(raw.length<1||raw.length>4096)return unknown
  const data=JSON.parse(raw.toString('utf8')) as Record<string,unknown>
  if(!data||Array.isArray(data)||data.version!==1
    ||!Number.isSafeInteger(data.pid)||(data.pid as number)<=0
    ||typeof data.host!=='string'||data.host!==hostname()
    ||typeof data.token!=='string'||!TOKEN.test(data.token))return unknown
  try {
   process.kill(data.pid as number,0)
   return {status:'live-owner'}
  }catch(error){
   if((error as NodeJS.ErrnoException).code==='ESRCH')return {status:'stale-candidate'}
   return unknown // EPERM / platform errors: cannot prove owner is dead
  }
 }catch{return unknown}
}
