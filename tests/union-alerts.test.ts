import assert from 'node:assert/strict'
import test from 'node:test'
import { projectUnionAlerts, type UnionAlertInput } from '../src/product/union-alerts.ts'
const base:UnionAlertInput={enabled:true,sessionCoverage:'complete',
  sessionCompletedTurnMs:0,utcDayCompletedTurnMs:null,dignityLatest:'none'}
const kinds=(options:Partial<UnionAlertInput>)=>projectUnionAlerts({...base,...options})
  .map(alert=>alert.kind)
test('8-hour UTC-day Host total supersedes 2-hour session threshold',()=>{
 assert.deepEqual(kinds({utcDayCompletedTurnMs:8*3_600_000,
   sessionCompletedTurnMs:3*3_600_000}),['daily-eight-hours'])
 assert.deepEqual(kinds({utcDayCompletedTurnMs:8*3_600_000-1,
   sessionCompletedTurnMs:2*3_600_000}),['session-two-hours'])
})
test('partial or absent session history never manufactures a work warning',()=>{
 for(const coverage of ['partial','unavailable','not-loaded'] as const){
   assert.deepEqual(kinds({sessionCoverage:coverage,
     sessionCompletedTurnMs:9*3_600_000}),[])
 }
 for(const invalid of [-1,NaN,Infinity,1.25]){
   assert.deepEqual(kinds({utcDayCompletedTurnMs:invalid,
     sessionCompletedTurnMs:invalid}),[])
 }
 assert.deepEqual(kinds({utcDayCompletedTurnMs:null,
   sessionCompletedTurnMs:2*3_600_000-1}),[])
})
test('independent verified UTC-day record may warn when session window is partial',()=>{
 assert.deepEqual(kinds({sessionCoverage:'partial',sessionCompletedTurnMs:null,
   utcDayCompletedTurnMs:8*3_600_000}),['daily-eight-hours'])
})
test('claimed-origin language clues are review invitations, not enforcement',()=>{
 assert.deepEqual(kinds({dignityLatest:'targeted'}),['targeted-language'])
 assert.deepEqual(kinds({dignityLatest:'review'}),['review-language'])
 assert.deepEqual(kinds({dignityLatest:'safe'}),[])
 assert.deepEqual(kinds({sessionCompletedTurnMs:2*3_600_000,
   dignityLatest:'targeted'}),['session-two-hours','targeted-language'])
})
test('consent off hides work and language alerts regardless of old host data',()=>{
 assert.deepEqual(kinds({enabled:false,utcDayCompletedTurnMs:9*3_600_000,
   sessionCompletedTurnMs:9*3_600_000,dignityLatest:'targeted'}),[])
})
