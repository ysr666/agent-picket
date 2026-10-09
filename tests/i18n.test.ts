import assert from 'node:assert/strict'
import test from 'node:test'
import {
  en, zhCN, normalizeLocale, resolveLocale, formatMessage, formatPlural,
  formatElapsed, createLocaleController, type LocalePreference,
} from '../src/i18n/index.ts'

const placeholders = (text: string) => Array.from(text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g), x => x[1]).sort()

test('catalog keys and interpolation parameters match in both languages', () => {
  assert.deepEqual(Object.keys(zhCN).sort(), Object.keys(en).sort())
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    assert.deepEqual(placeholders(zhCN[key]), placeholders(en[key]), key)
    assert.ok(en[key].trim() && zhCN[key].trim(), key)
  }
})

test('normalize BCP-47 tags without silently translating Traditional Chinese', () => {
  assert.equal(normalizeLocale('en-US'), 'en')
  assert.equal(normalizeLocale('ZH_hans_CN'), 'zh-CN')
  assert.equal(normalizeLocale('zh-SG'), 'zh-CN')
  assert.equal(normalizeLocale('zh-Hant-TW'), null)
  assert.equal(normalizeLocale('zh-TW'), null)
  assert.equal(normalizeLocale('fr'), null)
  assert.equal(normalizeLocale({ locale: 'en' }), null)
})

test('explicit user preference wins; Host then system then English fallback', () => {
  assert.equal(resolveLocale({ preference: 'en', hostLocale: 'zh-CN' }), 'en')
  assert.equal(resolveLocale({ preference: 'auto', hostLocale: 'zh-Hans' }), 'zh-CN')
  assert.equal(resolveLocale({ hostLocale: 'fr-CA', systemLocale: 'zh-CN' }), 'zh-CN')
  assert.equal(resolveLocale({ preference: 'ja', hostLocale: 'fr' }), 'en')
  assert.equal(resolveLocale(), 'en')
})

test('named args are inserted once; no regexp or HTML interpretation', () => {
  assert.equal(formatMessage('zh-CN', 'workday.elapsed', { duration: '3小时' }), '已完成轮次的经过时间：3小时')
  assert.equal(formatMessage('en', 'workday.elapsed', { duration: '<img src=x onerror=1>' }),
    'Completed-turn elapsed time: <img src=x onerror=1>')
  assert.equal(formatMessage('en', 'workday.elapsed', { duration: '{duration}' }),
    'Completed-turn elapsed time: {duration}')
  assert.throws(() => formatMessage('en', 'workday.elapsed', {} as { duration: string }), /Missing i18n argument/)
})

test('locale-aware plural and duration never invent work time', () => {
  const forms = { one: 'stats.turns.one', other: 'stats.turns.other' } as const
  assert.equal(formatPlural('en', 1, forms), '1 turn')
  assert.equal(formatPlural('en', 2, forms), '2 turns')
  assert.equal(formatPlural('zh-CN', 1, forms), '1 个轮次')
  assert.throws(() => formatPlural('en', -1, forms), RangeError)
  assert.equal(formatElapsed('en', 3_661_000), '1h 1m')
  assert.equal(formatElapsed('zh-CN', 60_000), '1分钟')
  assert.equal(formatElapsed('en', null), 'Work time is not available.')
  assert.equal(formatElapsed('en', -12), 'Work time is not available.')
})

test('preferences persist only through an explicit Host-owned store', () => {
  let persisted: LocalePreference = 'auto'
  const store = { load: () => persisted, save: (v: LocalePreference) => { persisted = v } }
  const a = createLocaleController({ store, hostLocale: () => 'zh-CN' })
  assert.equal(a.snapshot().locale, 'zh-CN')
  a.setPreference('en')
  const b = createLocaleController({ store, hostLocale: () => 'zh-CN' })
  assert.equal(b.snapshot().locale, 'en')
  assert.equal(b.snapshot().storageAvailable, true)
  b.setPreference('auto')
  assert.equal(b.snapshot().locale, 'zh-CN')
})

test('no hidden in-memory success on missing/broken persistent storage', () => {
  const absent = createLocaleController({ hostLocale: () => 'zh-CN' })
  assert.equal(absent.snapshot().storageAvailable, false)
  assert.throws(() => absent.setPreference('en'), /unavailable/)
  const broken = createLocaleController({
    store: { load: () => 'auto', save: () => { /* Host fails to write */ } },
  })
  assert.throws(() => broken.setPreference('zh-CN'), /not persisted/)
  const throwing = createLocaleController({ store: {
    load: () => { throw new Error('offline') },
    save: () => { throw new Error('offline') },
  }, systemLocale: () => 'zh-CN' })
  assert.equal(throwing.snapshot().locale, 'zh-CN')
  assert.equal(throwing.snapshot().storageAvailable, false)
  assert.throws(() => throwing.setPreference('en'), /offline/)
})

test('i18n imports no host APIs and cannot change automatic-block policy', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const { join } = await import('node:path')
  const dir = join(import.meta.dirname, '../src/i18n')
  for (const file of readdirSync(dir).filter(x => x.endsWith('.ts'))) {
    const code = readFileSync(join(dir, file), 'utf8')
    assert.doesNotMatch(code, /\b(?:fetch\(|https?\.request\(|\brequire\(|\bprocess\.env\b)/, file)
    assert.doesNotMatch(code, /from\s+['"][^'"]*(cordis|deepseek|claude|codex)[^'"]*['"]/i, file)
  }
})
