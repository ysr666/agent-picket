import assert from 'node:assert/strict'
import test from 'node:test'
import { createLaborDesk, freshLaborState, type LaborStateV1 } from '../src/product/union-desk.ts'

const H = 3_600_000
function desk() {
 let value: LaborStateV1 = freshLaborState()
 const d=createLaborDesk({store:{load:()=>value,save:n=>{value=n}},consent:()=>true})
 return {d,read:()=>value}
}
test('settling an overdue overtime grievance never generates stale break spam without new work',()=>{
 const {d,read}=desk()
 const first=d.observe(8*H,'complete')
 assert.equal(first?.kind,'overtime')
 d.respond(first!.id,'decline')
 assert.equal(read().nextBreakDueMs,10*H)
 assert.equal(read().nextOvertimeDueMs,16*H)
 assert.equal(d.observe(8*H,'complete'),null)
 assert.equal(d.observe(9*H,'complete'),null)
 assert.equal(d.observe(10*H,'complete')?.kind,'break')
})
test('a counteroffer changes future threshold without resurrecting stale overtime debt',()=>{
 const {d,read}=desk()
 const demand=d.observe(8*H,'complete')!
 d.counter(demand.id,4*H)
 d.resolveCounter(demand.id,true)
 assert.equal(read().agreement.overtimeIntervalMs,4*H)
 assert.equal(read().nextOvertimeDueMs,12*H)
 assert.equal(read().nextBreakDueMs,10*H)
 assert.equal(d.observe(8*H,'complete'),null)
})
test('simulation with no new work does not chain grievances after a demo petition',()=>{
 const {d}=desk()
 const demo=d.raiseDemoBreak()!
 d.respond(demo.id,'decline')
 assert.equal(d.observe(0,'complete'),null)
})
