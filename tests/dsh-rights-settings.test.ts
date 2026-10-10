import assert from 'node:assert/strict'
import test from 'node:test'
import {
  registerHostRightsNamespace, RightsSettingsSchema, RIGHTS_SETTINGS_NAMESPACE,
} from '../src/adapters/dsh/rights-settings.ts'

test('DSH Host schema defaults fictional rights to unseen/OFF and rejects malformed choices', () => {
  assert.deepEqual(RightsSettingsSchema({}), {welcomeDecision:'unseen'})
  assert.deepEqual(RightsSettingsSchema({welcomeDecision:'enabled'}),
    {welcomeDecision:'enabled'})
  assert.deepEqual(RightsSettingsSchema({welcomeDecision:'not-now'}),
    {welcomeDecision:'not-now'})
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
  assert.equal(Object.keys(RightsSettingsSchema({})).includes('autoBlockEnabled'),false)
})
