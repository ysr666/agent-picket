import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {checkFirstRelease} from '../scripts/check-first-release.mjs'
const manifest=JSON.parse(readFileSync(new URL('../release/first-release-evidence.json',import.meta.url),'utf8'))
test('first release cannot pass until four client targets on three operating systems are proven',()=>{
 const problems=checkFirstRelease(manifest)
 assert.ok(problems.length>=30)
 assert.ok(problems.some(s=>s.includes('dsh-web.losslessRecovery')))
 assert.ok(problems.some(s=>s.includes('dsh-desktop/windows')))
 assert.ok(problems.some(s=>s.includes('codex.verifiedHumanProvenance')))
 assert.ok(problems.some(s=>s.includes('claude-code.realEnforcement')))
 assert.ok(!problems.some(s=>s.includes('acp:')))
 assert.ok(!problems.some(s=>s.includes('cli:')))
})
test('forged suite result and missing UI review never authorize release',()=>{
 const copy=structuredClone(manifest)
 for(const item of Object.values(copy.targets as Record<string,any>)){
   item.status='verified';item.evidence=['test://real-blocking-e2e-proof']
   for(const key of ['realEnforcement','losslessRecovery',
     'verifiedHumanProvenance','visibleRefusalAndResume']) item[key]='verified'
   for(const evidence of Object.values(item.operatingSystems) as any[]){
     evidence.status='verified';evidence.evidence=['test://target-os-host-real-e2e-proof']
   }
 }
 assert.ok(checkFirstRelease(copy).some(s=>s.includes('unionHeadquarters')))
 assert.ok(checkFirstRelease(copy).some(s=>s.includes('Maintainer sign-off')))
})
test('missing or malformed evidence must fail closed',()=>{
 assert.ok(checkFirstRelease(null).length)
 const fake=structuredClone(manifest)
 fake.targets['dsh-web'].operatingSystems.windows={
   status:'verified',evidence:['TODO PLACEHOLDER']}
 assert.ok(checkFirstRelease(fake).some(s=>s.includes('dsh-web/windows:')))
})

test('release demands an independent target-by-OS matrix, not aggregate OS or ACP evidence',()=>{
 const pass=structuredClone(manifest)
 for(const target of Object.values(pass.targets) as any[]){
   target.status='verified';target.evidence=['test://verified-host-runtime-flow']
   for(const key of ['realEnforcement','losslessRecovery',
     'verifiedHumanProvenance','visibleRefusalAndResume'])target[key]='verified'
   for(const os of Object.values(target.operatingSystems) as any[]){
     os.status='verified';os.evidence=['test://real-windows-mac-linux-e2e']
   }
 }
 for(const ui of Object.values(pass.userExperience) as any[]){
   ui.status='verified';ui.evidence=['test://independent-real-human-ui-evaluation']
 }
 pass.status='ready';pass.finalHumanApproval=true
 assert.deepEqual(checkFirstRelease(pass),[],
   'Only a completely attested matrix plus explicit sign-off can clear gate')
 pass.targets['dsh-desktop'].operatingSystems.linux.status='not-verified'
 assert.ok(checkFirstRelease(pass).some(s=>s.includes('dsh-desktop/linux')),
   'Even with all other hosts and OS checks attested, one missing cell blocks release')
 pass.targets['dsh-desktop'].operatingSystems.linux.status='verified'
 pass.targets.codex.realEnforcement='not-verified'
 assert.ok(checkFirstRelease(pass).some(s=>s.includes('codex.realEnforcement')))
})
