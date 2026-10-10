import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DshProfileRightsConfig, registerHostRightsNamespace,
  RIGHTS_SETTINGS_NAMESPACE,
} from '../src/adapters/dsh/rights-settings.ts'
import { createNativeUnionCommandPort, type NativeSettingsProvider } from '../src/adapters/dsh/native-rights-command.ts'

test('new DSH Config uses three volatile Host fields without a blocking flag', () => {
  const schema = DshProfileRightsConfig
  assert.equal(schema.type, 'object')
  for (const name of ['welcomeDecision','unionLedger','commandLocale']) {
    assert.equal(schema.dict![name]?.meta.volatile, true, name)
  }
  assert.deepEqual(Object.keys(schema.dict!).sort(),
    ['commandLocale','unionLedger','welcomeDecision'])
  const parsed = schema({})
  assert.equal(parsed.welcomeDecision.get(), 'unseen')
  assert.equal(parsed.unionLedger.get(), '')
  assert.equal(parsed.commandLocale.get(), 'auto')
  assert.throws(() => schema({welcomeDecision:'on' as never}), /./)
})

test('new DSH Config rejects unsafe ledger data at schema-parse boundary', () => {
  const valid = JSON.stringify({schemaVersion:1,sessions:{}})
  assert.equal(DshProfileRightsConfig({unionLedger:valid}).unionLedger.get(),valid)
  for (const input of [
    '{"schemaVersion":1,"sessions":{},"prompt":"private transcript"}',
    '{"schemaVersion":2,"sessions":{}}',
    '{"schemaVersion":1,"sessions":{},"writeToken":"not-a-receipt"}',
    'invalid JSON',
    'x'.repeat(25_000),
  ]) {
    assert.throws(() => DshProfileRightsConfig({unionLedger:input}), /./)
  }
})

test('new Host form uses exactly one official revision-fenced writer for native commands', async () => {
  let revision=3
  let saved:{welcomeDecision:'unseen'|'enabled'|'not-now';unionLedger:string;commandLocale:'auto'|'en'|'zh-CN'}={welcomeDecision:'unseen',unionLedger:'',commandLocale:'auto'}
  let updates=0
  let generatedForms=0
  let settingsConfigured=0
  let settingsDisposed=0
  let provider:NativeSettingsProvider|undefined
  const mockHost = {
    describe:()=>[{ns:RIGHTS_SETTINGS_NAMESPACE,revision,value:{...saved}}],
    async update(ns:string,patch:object,expected?:number) {
      assert.equal(ns,RIGHTS_SETTINGS_NAMESPACE)
      assert.equal(expected,revision,'writes must carry the current official Host revision')
      const next={...saved,...patch}
      const normalized=DshProfileRightsConfig(next)
      saved={
        welcomeDecision:normalized.welcomeDecision.get(),
        unionLedger:normalized.unionLedger.get() ?? '',
        commandLocale:normalized.commandLocale.get() ?? 'auto',
      }
      updates++
      revision++
    },
    configure(opts:{auto?:boolean}) {
      settingsConfigured++
      assert.equal(opts.auto,false)
      return ()=>{settingsDisposed++}
    },
  }
  registerHostRightsNamespace({
    fiber:{},
    inject(services,callback){
      assert.deepEqual(services,['settings'])
      callback({settings:mockHost,effect(register){
        generatedForms++
        const dispose=register()
        assert.equal(typeof dispose,'function')
        dispose()
      }})
    },
  },p=>{provider=p})
  assert.ok(provider)
  assert.equal(settingsConfigured,1)
  assert.equal(settingsDisposed,1)
  assert.equal(generatedForms,1)
  const union=createNativeUnionCommandPort(provider!)
  assert.equal(union.enabled(),false)
  await union.setEnabled(true)
  assert.equal(union.enabled(),true)
  assert.equal(saved.welcomeDecision,'enabled')
  assert.equal(updates,1)
  await union.setEnabled(false)
  assert.equal(saved.welcomeDecision,'not-now')
  assert.equal(updates,2)
  assert.equal(Object.keys(saved).length,3)
  assert.throws(() => provider!.update(RIGHTS_SETTINGS_NAMESPACE,
    {unionLedger:'{"prompt":"private"}'},revision),/Unsafe/)
  assert.equal(updates,2,'malformed ledger never reaches the official settings writer')
  await assert.rejects(provider!.update('other-plugin',
    {welcomeDecision:'enabled'},revision),/Unknown Host/)
  assert.equal(updates,2)
})

test('when legacy register exists, there is no simultaneous new-settings writer',()=>{
  let registered=0
  let newer=0
  registerHostRightsNamespace({
    inject(_keys,callback){
      callback({settings:{
        register(){registered++},
        describe:()=>{newer++;return []},
        update:async()=>{},
      }})
    },
  })
  assert.equal(registered,1)
  assert.equal(newer,0)
})
