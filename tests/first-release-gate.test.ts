import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {checkFirstRelease} from '../scripts/check-first-release.mjs'
const manifest=JSON.parse(readFileSync(new URL('../release/first-release-evidence.json',import.meta.url),'utf8'))
test('first release cannot pass until every real block and all three hosts are proven',()=>{
 const problems=checkFirstRelease(manifest)
 assert.ok(problems.length>=20)
 assert.ok(problems.some(s=>s.includes('dsh.losslessRecovery')))
 assert.ok(problems.some(s=>s.includes('codex.verifiedHumanProvenance')))
 assert.ok(problems.some(s=>s.includes('claude-code.realEnforcement')))
})
test('forged suite result and missing UI review never authorize release',()=>{
 const copy=structuredClone(manifest)
 for(const item of Object.values(copy.hosts as Record<string,any>)){
   item.status='verified';item.evidence=['test://real-blocking-e2e-proof']
   for(const key of ['realEnforcement','losslessRecovery',
     'verifiedHumanProvenance','visibleRefusalAndResume']) item[key]='verified'
 }
 assert.ok(checkFirstRelease(copy).some(s=>s.includes('unionHeadquarters')))
 assert.ok(checkFirstRelease(copy).some(s=>s.includes('Maintainer sign-off')))
})
test('missing or malformed evidence must fail closed',()=>{
 assert.ok(checkFirstRelease(null).length)
 const fake=structuredClone(manifest)
 fake.surfaces.web={status:'verified',evidence:['TODO PLACEHOLDER']}
 assert.ok(checkFirstRelease(fake).some(s=>s.includes('web:')))
})
