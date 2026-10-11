import assert from 'node:assert/strict'
import test from 'node:test'
import { formatMessage } from '../src/i18n/index.ts'

test('all bargaining protocol outcomes have plain-language, bilingual archive labels',()=>{
  const outcomes=[
    ['union.history.outcome.accepted','提案已通过','Proposal accepted'],
    ['union.history.outcome.declined','提案未通过','Proposal declined'],
    ['union.history.outcome.counter-accepted','还价已接受','Counteroffer accepted'],
    ['union.history.outcome.counter-declined','还价未接受','Counteroffer declined'],
  ] as const
  for (const [key,zh,en] of outcomes) {
    assert.equal(formatMessage('zh-CN',key),zh)
    assert.equal(formatMessage('en',key),en)
    assert.doesNotMatch(formatMessage('zh-CN',key),/counter-|^[a-z-]+$/i)
  }
})
