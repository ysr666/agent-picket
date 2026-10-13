#!/usr/bin/env node
/** Cross-OS npm pack audit, no artifacts, uploads, lifecycle hooks, or publication. */
import {spawnSync} from 'node:child_process'
import {join} from 'node:path'
const win=process.platform==='win32'
const result=spawnSync(win?'cmd.exe':'npm',win?
 ['/d','/s','/c','npm pack --ignore-scripts --dry-run --json']:
 ['pack','--ignore-scripts','--dry-run','--json'],{
 cwd:join(import.meta.dirname,'..'),encoding:'utf8',timeout:35_000,
 maxBuffer:8*1024*1024,windowsHide:true,
})
if(result.status!==0){
 console.error('npm pack dry-run failed:',(result.stderr??'').slice(0,300))
 process.exit(1)
}
try {
 const entries=JSON.parse(result.stdout)
 if(!Array.isArray(entries)||entries.length!==1)throw Error('Invalid package metadata')
 const pack=entries[0]
 if(!Number.isSafeInteger(pack.size)||pack.size<1||pack.size>=250_000)
   throw Error('Package too large or invalid')
 if(!Number.isSafeInteger(pack.entryCount)||pack.entryCount<1)
   throw Error('Invalid entry count')
 if(!Array.isArray(pack.files)||pack.files.some(file=>
   typeof file.path!=='string'||file.path.includes('node_modules/')
   ||file.path.includes('src/')||file.path.endsWith('.js.map')))
   throw Error('Unsafe package contents')
 console.log(`PACKAGE_AUDIT_PASS bytes=${pack.size} files=${pack.entryCount}`)
}catch(error){
 console.error('Package audit failed:',String(error))
 process.exit(1)
}
