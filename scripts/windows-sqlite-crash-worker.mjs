// Experimental process-crash fixture. Not packaged.
import {SqliteWorkCandidate} from './windows-sqlite-ledger-candidate.mjs'
const [dir,mode,fp,day,ms]=process.argv.slice(2)
if(!dir||!['committed','uncommitted'].includes(mode))process.exit(2)
const ledger=new SqliteWorkCandidate(dir)
if(mode==='committed')ledger.commitCompleted(fp,day,Number(ms))
else ledger.beginUncommittedForTest(fp,day,Number(ms))
process.stdout.write('WORKER_READY\n')
// Parent force-kills this process before SQLite close or an open TX commit.
setInterval(()=>{},1000)
