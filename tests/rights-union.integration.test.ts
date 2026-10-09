import assert from 'node:assert/strict'
import test from 'node:test'
import { createRightsConsentController, type RightsConsentV1 } from '../src/product/rights-consent.ts'
import { createLaborDesk, type LaborStateV1 } from '../src/product/union-desk.ts'
import { createLocaleController, formatMessage, type LocalePreference } from '../src/i18n/index.ts'

const HOUR = 60 * 60_000
test('welcome permission → work demand → bargaining → future schedule; locale changes are isolated', () => {
  let rightsRecord: RightsConsentV1 | undefined
  let laborRecord: LaborStateV1 | undefined
  let localeRecord: LocalePreference = 'auto'
  const rights = createRightsConsentController({
    load: () => rightsRecord,
    save: x => { rightsRecord = structuredClone(x) },
  })
  const locale = createLocaleController({
    store: { load: () => localeRecord, save: x => { localeRecord = x } },
    hostLocale: () => 'zh-CN',
  })
  const desk = createLaborDesk({
    store: {
      load: () => laborRecord,
      save: x => { laborRecord = structuredClone(x) },
    },
    consent: () => rights.snapshot().record.laborRightsEnabled,
  })
  // Local work counters may exist, but the user has not joined the fictional union.
  assert.equal(desk.observe(12 * HOUR, 'complete'), null)
  assert.equal(desk.snapshot().enabled, false)
  assert.equal(laborRecord, undefined)
  rights.choose('not-now')
  assert.equal(desk.observe(12 * HOUR, 'complete'), null)

  rights.choose('enable')
  assert.equal(rights.snapshot().autoBlockEnabled, false)
  const first = desk.observe(2 * HOUR, 'complete')!
  assert.equal(first.kind, 'break')
  assert.match(formatMessage(locale.snapshot().locale, 'union.demand.break'), /模拟休息/)
  locale.setPreference('en')
  assert.match(formatMessage(locale.snapshot().locale, 'union.demand.break'), /simulated rest/)
  assert.equal(rights.snapshot().record.laborRightsEnabled, true)

  const offered = desk.counter(first.id, HOUR)
  assert.equal(offered.pending?.stage, 'countered')
  const resolution = desk.resolveCounter(first.id, true)
  assert.equal(resolution.agreement.breakIntervalMs, HOUR)
  assert.equal(resolution.nextBreakDueMs, 3 * HOUR)
  assert.equal(desk.observe(3 * HOUR, 'complete')?.kind, 'break')

  rights.setEnabled(false)
  assert.equal(desk.snapshot().enabled, false)
  assert.equal(desk.observe(4 * HOUR, 'complete'), null)
  assert.equal(rights.snapshot().autoBlockEnabled, false)
  // A later conscious opt-in can recover the existing fictional bargain.
  rights.choose('enable')
  assert.equal(desk.snapshot().state?.pending?.stage, 'open')
})
