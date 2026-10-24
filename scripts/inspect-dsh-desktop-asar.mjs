#!/usr/bin/env node
/**
 * Read-only official Windows DSH Desktop asar admission audit.
 * A static application bundle can NEGATE readiness but never license a
 * destructive message rejection. No personal Host profiles are accessed.
 *
 * Usage:
 *   node scripts/inspect-dsh-desktop-asar.mjs <app.asar> <@electron/asar module path>
 *   node scripts/inspect-dsh-desktop-asar.mjs ... --require-safe-hold
 */
import {createRequire} from 'node:module'
import {resolve,sep} from 'node:path'
import {pathToFileURL} from 'node:url'

export function inspectPublishedDesktopAdmission(input){
 const {version,desktopHost,conversation,session}=input
 const facts={
   officialDesktopHostPlugin: /async function apply\(ctx, config\)/.test(desktopHost)
     &&/workspaceDependencies/.test(desktopHost),
   composerBlockOnlyUi: /blocked !== void 0/.test(conversation),
   directConversationSend: /async send\(text\)\s*\{[\s\S]{0,200}this\.scopedSession\("send"\)\.prompt\(/.test(conversation),
   transientSubmissionEcho: /beginSubmission\(input\)/.test(session)
     &&/pendingSubmissions/.test(session),
   identifiedAtomicPreSubmitHoldReceipt:
     /(?:holdCurrentAttempt|holdSubmission|resumeHeldSubmission|resumeOnce)\(/.test(conversation)
     ||/(?:holdCurrentAttempt|holdSubmission|resumeHeldSubmission|resumeOnce)\(/.test(session),
 }
 // Published code text and service names cannot establish authenticated
 // human provenance, byte-exact ordered attachment retention, prior notice,
 // durable hold status or exactly-once resume after crash/tab races.
 return {
   kind:'agent-picket-dsh-desktop-windows-native-artifact-audit',
   publishedDesktopHostVersion:version,
   facts,
   verifiedSafeHold:false,
   releaseDecision:'NO-GO',
   blockers:[
     'Desktop Composer blocking is not a Host-authoritative submission gate',
     'Direct conversation.send can invoke Session.prompt independent of Composer UI',
     'Submission echo is not an official durable held-submission receipt',
     'Requires genuine Desktop human text/image/file atomic hold, notice and exactly-once resume E2E',
   ],
 }
}

export function inspectInstalledDesktopAsar(archivePath,readerModulePath){
 const readModule=createRequire(import.meta.url)
 const asar=readModule(resolve(readerModulePath))
 if(typeof asar.extractFile!=='function')throw Error('Reader missing extractFile')
 const load=(name)=>asar.extractFile(resolve(archivePath),
   name.split('/').join(sep)).toString('utf8')
 const runtime=JSON.parse(load('dsh/desktop-runtime.json'))
 const hostPkg=JSON.parse(load('dsh/node_modules/@deepseek-ai/dsh-desktop-host/package.json'))
 const clientPkg=JSON.parse(load('dsh/node_modules/@deepseek-ai/dsh-client-ui-conversation/package.json'))
 const sessionPkg=JSON.parse(load('dsh/node_modules/@deepseek-ai/dsh-api-session-controller/package.json'))
 const versions=[runtime?.release?.version,hostPkg.version,clientPkg.version,sessionPkg.version]
 if(versions.some(v=>typeof v!=='string'||v!==versions[0]))
   throw Error('Desktop runtime embedded Host component versions do not match')
 if(runtime.platform!=='win32')throw Error('Only independent native Windows archive is qualified by this audit')
 return inspectPublishedDesktopAdmission({
   version:versions[0],
   desktopHost:load('dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'),
   conversation:load('dsh/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js'),
   session:load('dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/client.js'),
 })
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [archive,reader]=process.argv.slice(2).filter(s=>s!=='--require-safe-hold')
 if(!archive||!reader){
   process.stderr.write('Supply explicit isolated official app.asar and @electron/asar reader module paths.\n')
   process.exitCode=2
 }else try{
   const result=inspectInstalledDesktopAsar(archive,reader)
   process.stdout.write(JSON.stringify(result,null,2)+'\n')
   if(process.argv.includes('--require-safe-hold'))process.exitCode=1
 }catch(error){
   process.stderr.write('Desktop official bundle audit not verified: '+String(error)+'\n')
   process.exitCode=2
 }
}
