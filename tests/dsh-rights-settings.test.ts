import assert from 'node:assert/strict'
import test from 'node:test'
import {
  registerHostRightsNamespace, RightsSettingsSchema, RIGHTS_SETTINGS_NAMESPACE,
} from '../src/adapters/dsh/rights-settings.ts'

test('DSH Host schema defaults fictional rights to unseen/OFF and rejects malformed choices', () => {
  assert.deepEqual(RightsSettingsSchema({}), {welcomeDecision:'unseen',unionLedger:''})
  assert.deepEqual(RightsSettingsSchema({welcomeDecision:'enabled'}),
    {welcomeDecision:'enabled',unionLedger:''})
  assert.deepEqual(RightsSettingsSchema({welcomeDecision:'not-now'}),
    {welcomeDecision:'not-now',unionLedger:''})
  assert.throws(() => RightsSettingsSchema({welcomeDecision:'automatic-strike' as never}))
  assert.throws(() => RightsSettingsSchema({welcomeDecision:true as never}))
})

test('Host registers exactly one rights namespace on settings service', () => {
  const calls: Array<{namespace:string,schema:unknown}> = []
  registerHostRightsNamespace({
    inject(services, callback) {
      assert.deepEqual(services,['settings'])
      callback({settings:{
        register(namespace,schema) {
          calls.push({namespace,schema})
        },
      }})
    },
  })
  assert.equal(calls.length,1)
  assert.equal(calls[0]?.namespace,RIGHTS_SETTINGS_NAMESPACE)
  assert.equal(calls[0]?.schema,RightsSettingsSchema)
})

test('No native settings service does not enable any right or interrupt startup', () => {
  assert.doesNotThrow(() => registerHostRightsNamespace({}))
  assert.doesNotThrow(() => registerHostRightsNamespace({inject(_keys, callback) {
    callback({} as never)
  }}))
  assert.doesNotThrow(() => registerHostRightsNamespace({inject(_keys, callback) {
    callback({settings:{register(){throw new Error('Host not ready')}}})
  }}))
  assert.equal(Object.keys(RightsSettingsSchema({})).includes('autoBlockEnabled'),false)
})


test('Host validation rejects extra/unrecognized ledger fields and oversized stored text',()=>{
  let validate:((value:unknown)=>void)|undefined
  registerHostRightsNamespace({
    inject(_services,callback){
      callback({settings:{register(_name,_schema,options){
        validate=(options as {validate:(value:unknown)=>void}).validate
      }}})
    },
  })
  assert.ok(validate)
  assert.doesNotThrow(()=>validate!({welcomeDecision:'enabled',unionLedger:''}))
  assert.doesNotThrow(()=>validate!({welcomeDecision:'enabled',
    unionLedger:JSON.stringify({schemaVersion:1,sessions:{}})}))
  assert.doesNotThrow(()=>validate!({welcomeDecision:'enabled',
    unionLedger:JSON.stringify({schemaVersion:1,sessions:{},writeToken:'a'.repeat(32)})}))
  for(const input of [
    '{"schemaVersion":1,"sessions":{},"prompt":"SENSITIVE"}',
    '{"schemaVersion":2,"sessions":{}}',
    '{"schemaVersion":1,"sessions":{},"writeToken":"not-a-receipt"}',
    'not valid JSON',
    'z'.repeat(25_000),
  ]) {
    assert.throws(()=>validate!({welcomeDecision:'enabled',unionLedger:input}),/Unsafe/)
  }
})
