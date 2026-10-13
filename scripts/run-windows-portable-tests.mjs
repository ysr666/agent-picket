#!/usr/bin/env node
/**
 * Explicitly partial Windows CI: POSIX mode bits are NOT NTFS privacy.
 * Never bypass the DurableStats security gate. This tests other cross-OS code.
 * DurableStats on Windows remains UNSUPPORTED and is a release NO-GO.
 */
import {readdirSync} from 'node:fs'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const root=join(import.meta.dirname,'..')
const excluded=new Set([
  'dsh-durable-stats.test.ts',
  'dsh-goal-work-enforcement.test.ts',
  'durable-stats.test.ts',
  'durable-wal.test.ts',
])
if(process.platform!=='win32'){
  console.error('Windows-only portable test selector; use npm test on Unix')
  process.exit(2)
}
const all=readdirSync(join(root,'tests')).filter(f=>f.endsWith('.test.ts'))
const selected=all.filter(f=>!excluded.has(f)).map(f=>join(root,'tests',f))
for(const name of excluded)if(!all.includes(name))throw Error(`Excluded test file missing: ${name}`)
console.warn(`WINDOWS_DURABLE_LEDGER_UNVERIFIED: skipped ${excluded.size} entire test files: ${[...excluded].join(', ')}`)
console.warn('Windows installed Host & NTFS ACL security acceptance remain mandatory for 1.0; this job is PORTABLE ONLY.')
// NTFS DACL verification invokes a separate PowerShell/.NET process.
// Under high native test-file parallelism on two-vCPU Windows runners,
// isolated ACL probes can hit their conservative 7s process timeout and
// refuse a legitimate private directory. Serialize test files to obtain
// meaningful owner/ACL verdicts instead of load-dependent false negatives.
const run=spawnSync(process.execPath,['--experimental-strip-types','--test',
  '--test-concurrency=1',...selected],{
  cwd:root,stdio:'inherit',windowsHide:true,
})
if(run.error){console.error(String(run.error));process.exit(1)}
process.exit(run.status??1)
