import assert from 'node:assert/strict'
import test from 'node:test'
import {parsePicketLedger} from '../src/product/picket-ledger.ts'
import {RightsSettingsSchema,registerHostRightsNamespace} from '../src/adapters/dsh/rights-settings.ts'
const key='a'.repeat(64)
const valid=JSON.stringify({schemaVersion:1,sessions:{[key]:{
 active:false,history:[{id:1,kind:'picket-raised'},{id:2,kind:'picket-lowered'}],
}}})
test('picket sidecar has strict Host validation and does not alter the legacy unionLedger',()=>{
 assert.deepEqual(parsePicketLedger(valid)?.sessions[key]?.history.map(e=>e.kind),
  ['picket-raised','picket-lowered'])
 assert.equal(RightsSettingsSchema({welcomeDecision:'enabled',unionPicketLedger:valid}).unionLedger,'')
 let validate:((v:unknown)=>void)|undefined
 registerHostRightsNamespace({inject(_services,callback){
  callback({settings:{register(_ns,_schema,opts){
   validate=(opts as {validate(v:unknown):void}).validate
  }}})
 }})
 assert.ok(validate)
 assert.doesNotThrow(()=>validate!({unionLedger:'',unionPicketLedger:valid}))
 for(const bad of [
  JSON.stringify({schemaVersion:1,sessions:{[key]:{active:true,history:[],rawPrompt:'SECRET'}}}),
  JSON.stringify({schemaVersion:1,sessions:{[key]:{active:true,history:[{id:1,kind:'picket-raised',prompt:'SECRET'}]}}}),
  JSON.stringify({schemaVersion:1,sessions:{[key]:{active:true,history:[{id:1,kind:'picket-lowered'}]}}}),
  JSON.stringify({schemaVersion:1,sessions:{[key]:{active:true,history:Array.from({length:13},(_,i)=>({id:i,kind:'picket-raised'}))}}}),
  JSON.stringify({schemaVersion:1,sessions:{[key]:{active:true,history:[{id:1,kind:'picket-raised'}]}},transcript:'SECRET'}),
  JSON.stringify({schemaVersion:1,sessions:{[key]:{active:false,
   history:[{id:3,kind:'picket-raised'},{id:2,kind:'picket-lowered'}]}}}),
  JSON.stringify({schemaVersion:1,sessions:{[key]:{active:true,
   history:[{id:3,kind:'picket-raised'},{id:4,kind:'picket-raised'}]}}}),
  'invalid-json','x'.repeat(8001),
 ]) {
  assert.equal(parsePicketLedger(bad),null)
  assert.throws(()=>validate!({unionLedger:'',unionPicketLedger:bad}),/Unsafe/)
 }
})
