import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {checkFirstRelease} from '../scripts/check-first-release.mjs'
const manifest=JSON.parse(readFileSync(new URL('../release/first-release-evidence.json',import.meta.url),'utf8'))
test('first release cannot pass until four client targets on three operating systems are proven',()=>{
 const problems=checkFirstRelease(manifest)
 assert.ok(problems.length>=30)
 assert.ok(problems.some(s=>s.includes('dsh-web.discardAndResubmit')))
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
   for(const key of ['realEnforcement','discardAndResubmit',
     'verifiedHumanProvenance','visibleRefusalAndResume']) item[key]='verified'
   for(const evidence of Object.values(item.operatingSystems) as any[]){
     evidence.status='verified';evidence.evidence=['test://target-os-host-real-e2e-proof']
   }
 }
 assert.ok(checkFirstRelease(copy).some(s=>s.includes('unionHeadquarters')))
 assert.ok(checkFirstRelease(copy).some(s=>s.includes('Maintainer sign-off')))
})
test('user-approved discard-and-resend policy replaces auto-recovery, not safe refusal evidence',()=>{
 const old=structuredClone(manifest)
 assert.equal(old.schemaVersion,3)
 old.schemaVersion=2
 assert.ok(checkFirstRelease(old).some(s=>s.includes('schema/version')),
  'Old lossless-recovery release manifests cannot silently bypass the new consent contract')
 const candidate=structuredClone(manifest)
 candidate.targets['dsh-web'].losslessRecovery='verified'
 assert.ok(checkFirstRelease(candidate).some(s=>s.includes('dsh-web.discardAndResubmit')),
  'Legacy recovery claims alone cannot authorize rejection+manual resend')
 candidate.targets['dsh-web'].discardAndResubmit='verified'
 assert.ok(checkFirstRelease(candidate).some(s=>s.includes('dsh-web.realEnforcement')))
 assert.ok(checkFirstRelease(candidate).some(s=>s.includes('dsh-web.visibleRefusalAndResume')))
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
 for(const [name,target] of Object.entries(pass.targets) as [string,any][]){
   target.status='verified';target.evidence=['test://verified-host-runtime-flow']
   for(const key of ['realEnforcement','discardAndResubmit',
     'verifiedHumanProvenance','visibleRefusalAndResume'])target[key]='verified'
   for(const os of Object.values(target.operatingSystems) as any[]){
     os.status='verified';os.evidence=['test://real-windows-mac-linux-e2e']
     if(name==='dsh-desktop'){
       // Synthetic future-build SHAPE only; this does not certify a Host.
       os.officialHostVersion='9.999.0'
       for(const key of ['nativePreModelRefusal',
         'userVisibleResendInstruction']){
         os[key]={status:'verified',
           evidence:['test://synthetic-future-desktop-real-host-proof']}
       }
     }
     if(name==='codex'){
       // Synthetic future-build acceptance SHAPE only; this test does NOT
       // assert that any post-0.146.1 official build is actually safe.
       os.officialHostVersion='9.999.0'
       for(const key of ['exclusiveLiveGoalOwnership','atomicGoalStateTransition']){
         os[key]={status:'verified',evidence:['test://independent-cross-owner-goal-proof']}
       }
     }
   }
 }
 for(const ui of Object.values(pass.userExperience) as any[]){
   ui.status='verified';ui.evidence=['test://independent-real-human-ui-evaluation']
 }
 pass.status='ready';pass.finalHumanApproval=true
 assert.deepEqual(checkFirstRelease(pass),[],
   'Only a completely attested matrix plus explicit sign-off can clear gate')
 // Known official 0.146.1 cross-owner bug survives regardless of forged
 // "verified" cells, human approval or unrelated positive cold-restart CI.
 const win=pass.targets.codex.operatingSystems.windows
 win.officialHostVersion='0.146.1'
 assert.ok(checkFirstRelease(pass).some(s=>
  s.includes('codex/windows: Codex 0.146.1 has a verified duplicate')))
 win.officialHostVersion='9.999.0'
 win.exclusiveLiveGoalOwnership.status='not-verified'
 assert.ok(checkFirstRelease(pass).some(s=>
  s.includes('codex/windows/exclusiveLiveGoalOwnership')))
 win.exclusiveLiveGoalOwnership.status='verified'
 win.atomicGoalStateTransition.evidence=[]
 assert.ok(checkFirstRelease(pass).some(s=>
  s.includes('codex/windows/atomicGoalStateTransition')))
 win.atomicGoalStateTransition.evidence=['test://synthetic-future-atomic-goal-proof']
 win.officialHostVersion='UNKNOWN'
 assert.ok(checkFirstRelease(pass).some(s=>
  s.includes('codex/windows: exact official Host version')))
 win.officialHostVersion='9.999.0'
 assert.deepEqual(checkFirstRelease(pass),[],
  'Synthetic future attestation restored; not a real safety certification')
 pass.targets['dsh-desktop'].operatingSystems.linux.status='not-verified'
 assert.ok(checkFirstRelease(pass).some(s=>s.includes('dsh-desktop/linux')),
   'Even with all other hosts and OS checks attested, one missing cell blocks release')
 pass.targets['dsh-desktop'].operatingSystems.linux.status='verified'
 const desktop=pass.targets['dsh-desktop'].operatingSystems
 desktop.windows.officialHostVersion='0.2.0-rc.2'
 assert.ok(checkFirstRelease(pass).some(s=>
   s.includes('dsh-desktop/windows: official Desktop 0.2.0-rc.2')),
   'Known Windows Desktop binary must stay NO-GO even if every other cell is forged green')
 desktop.windows.officialHostVersion='9.999.0'
 desktop.windows.nativePreModelRefusal.status='not-verified'
 assert.ok(checkFirstRelease(pass).some(s=>
   s.includes('dsh-desktop/windows/nativePreModelRefusal')))
 desktop.windows.nativePreModelRefusal.status='verified'
 desktop.windows.userVisibleResendInstruction.evidence=[]
 assert.ok(checkFirstRelease(pass).some(s=>
   s.includes('dsh-desktop/windows/userVisibleResendInstruction')))
 desktop.windows.userVisibleResendInstruction.evidence=
   ['test://synthetic-future-desktop-real-host-proof']
 assert.deepEqual(checkFirstRelease(pass),[],
   'Synthetic future Desktop proof shape restored, not a real release authorization')
 pass.targets.codex.realEnforcement='not-verified'
 assert.ok(checkFirstRelease(pass).some(s=>s.includes('codex.realEnforcement')))
})

test('installed Windows DSH Desktop rc.2 known-unsafe version and missing native evidence independently block release',()=>{
 const gaps=checkFirstRelease(manifest)
 for(const text of [
  'dsh-desktop/windows: official Desktop 0.2.0-rc.2',
  'dsh-desktop/windows/nativePreModelRefusal',
  'dsh-desktop/windows/userVisibleResendInstruction',
  'dsh-desktop/macos: exact official Desktop Host version',
  'dsh-desktop/linux: exact official Desktop Host version',
 ])assert.ok(gaps.some(s=>s.includes(text)),text)
})
