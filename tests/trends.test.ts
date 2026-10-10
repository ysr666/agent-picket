import assert from 'node:assert/strict'
import test from 'node:test'
import { formatWorkTrends } from '../src/core/trends.ts'

const now = Date.parse('2026-10-10T09:10:00Z')
const records = [
  { day:'2026-10-08', totals:{turnEnds:3,toolCalls:8,completedTurnMs:1000} },
  { day:'2026-10-09', totals:{turnEnds:5,toolCalls:12,completedTurnMs:3000} },
  { day:'2026-10-10', totals:{turnEnds:1,toolCalls:4,completedTurnMs:800} },
  { day:'2026-09-01', totals:{turnEnds:1000,toolCalls:5000,completedTurnMs:99} },
] as const

test('UTC 7-day trend includes zero days, totals, partial current day', () => {
  const report=formatWorkTrends(records,now,7)
  assert.match(report,/2026-10-04 → 2026-10-10/)
  assert.match(report,/Active days: 3\/7/)
  assert.match(report,/finished turns: 9; tool calls: 24/)
  assert.match(report,/spans: 4800 ms/)
  assert.match(report,/2026-10-07: 0 finished turns, 0 tool calls/)
  assert.match(report,/current day incomplete/)
  const sparkline = report.match(/Tool calls\/day \(relative scale\): (\S+)/)?.[1]
  assert.equal(Array.from(sparkline??'').length,7)
  assert.doesNotMatch(report,/5000|1000 finished/)
})
test('30-day trends summarize all days, but detail only the last seven', () => {
  const report=formatWorkTrends(records,now,30)
  const sparkline=report.match(/Tool calls\/day \(relative scale\): (\S+)/)?.[1]
  assert.equal(Array.from(sparkline??'').length,30)
  assert.match(report,/Active days: 3\/30/)
  assert.match(report,/Latest 7 days:/)
  assert.doesNotMatch(report,/2026-09-01/)
})
test('missing data renders empty local history without fabricated activity',()=>{
  const report=formatWorkTrends([],now)
  assert.match(report,/Active days: 0\/7; finished turns: 0; tool calls: 0/)
  assert.match(report,/Tool calls\/day \(relative scale\): ▁▁▁▁▁▁▁/)
})
test('year boundary is computed with UTC, not host locale',()=>{
  const report=formatWorkTrends([],Date.parse('2027-01-02T00:00:00Z'))
  assert.match(report,/2026-12-27 → 2027-01-02/)
})
test('unsupported spans and invalid time fail visibly',()=>{
  assert.throws(()=>formatWorkTrends([],now,14 as 7),/Unsupported/)
  assert.throws(()=>formatWorkTrends([],NaN),/Invalid/)
})
