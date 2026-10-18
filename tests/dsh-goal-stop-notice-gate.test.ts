import assert from 'node:assert/strict'
import test from 'node:test'
import {createDshGoalStopNoticeGate,type UnionGoalHold} from '../src/adapters/dsh/client.ts'
const hold=(id:string,revision:number):UnionGoalHold=>
 ({sessionId:id,goalId:'official-goal',revision,canResume:true})

test('native union Goal notice is transition-only and exactly once for a revision',()=>{
 const gate=createDshGoalStopNoticeGate()
 gate.seed('A',null)
 assert.equal(gate.change('A',null),false)
 assert.equal(gate.change('A',hold('A',4)),true)
 assert.equal(gate.change('A',hold('A',4)),false)
 assert.equal(gate.change('A',null),false)
 assert.equal(gate.change('A',hold('A',7)),true)
 assert.equal(gate.change('A',hold('A',7)),false)
})

test('cold-restart and session switching never present historical stops as new',()=>{
 const gate=createDshGoalStopNoticeGate()
 gate.seed('A',hold('A',12))
 assert.equal(gate.change('A',hold('A',12)),false)
 assert.equal(gate.change('B',hold('B',3)),false)
 gate.seed('B',hold('B',3))
 assert.equal(gate.change('B',hold('B',3)),false)
 assert.equal(gate.change('B',null),false)
 assert.equal(gate.change('A',hold('A',14)),false)
 gate.seed(null,null)
 assert.equal(gate.change('B',hold('B',6)),false)
})
