import assert from 'node:assert/strict'
import test from 'node:test'
import { createDashboardSnapshot } from '../src/core/dashboard.ts'
import type { DashboardInput } from '../src/core/dashboard.ts'

const now = Date.parse('2026-10-10T09:30:00Z')
const work = { turnStarts: 4, turnEnds: 3, toolCalls: 8, toolResults: 7, completedTurnMs: 51_000 }
const ruleVerdicts = { checked: 2, safe: 1, review: 0, targeted: 1 }
const lifetime = { ...work, ...ruleVerdicts }
const input = (changes: Partial<DashboardInput> = {}): DashboardInput => ({
  host: 'mock', generatedAtMs: now, storage: 'available',
  blockingReadiness: {
    ready: false,
    gaps: ['human-source-unverified', 'input-recovery-unverified'],
  },
  sessionWork: work, sessionRules: ruleVerdicts, lifetime, lifetimeRulePersistence: false,
  daily: [
    { day: '2026-10-09', totals: work },
    { day: '2026-10-10', totals: { ...work, toolCalls: 1 } },
  ],
  ...changes,
})

test('v1 is a locale-neutral, content-free and JSON-roundtrippable stable view', () => {
  const view = createDashboardSnapshot(input())
  assert.equal(view.schemaVersion, 1)
  assert.equal(view.host, 'mock')
  assert.equal(view.modes.laborRights, 'disabled')
  assert.equal(view.modes.blocking.enabled, false)
  assert.equal(view.modes.blocking.readiness.ready, false)
  assert.equal(view.modes.symbolicPicket, null)
  assert.equal(view.statistics.storage, 'available')
  assert.equal(view.statistics.lifetimeRulePersistence, 'disabled')
  assert.equal(view.statistics.durationBasis, 'completed-turn-wall-clock-including-waits')
  assert.equal(view.statistics.lifetime?.turnEnds, 3)
  assert.equal(view.statistics.recentDays?.length, 7)
  assert.equal(view.statistics.recentDays?.[0]?.day, '2026-10-04')
  assert.equal(view.statistics.recentDays?.[0]?.work.turnEnds, 0)
  assert.equal(view.statistics.recentDays?.[5]?.work.toolCalls, 8)
  assert.equal(view.statistics.recentDays?.[6]?.work.toolCalls, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(view)), view)
  const serialized = JSON.stringify(view)
  assert.doesNotMatch(serialized, /AgentPrompt|sessionId|agentId|messageId|chatContent|filePath|rawInput/)
})

test('labor-rights mode is independent from persistent work stats and manual pickets', () => {
  const symbol = { active: true, startedAtMs: 200 }
  const enabled = createDashboardSnapshot(input({ laborRightsEnabled: true, symbolicPicket: symbol }))
  assert.equal(enabled.modes.laborRights, 'enabled')
  assert.equal(enabled.modes.symbolicPicket?.active, true)
  assert.equal(enabled.modes.blocking.enabled, false)
  assert.equal(enabled.statistics.storage, 'available')
  assert.equal(enabled.statistics.lifetime?.toolCalls, 8)
  const disabled = createDashboardSnapshot(input({ symbolicPicket: symbol }))
  assert.equal(disabled.modes.laborRights, 'disabled')
  assert.equal(disabled.modes.symbolicPicket?.active, true,
    'Existing manual picket is a separate demo flag, not the labor rights preference')
  assert.equal(disabled.statistics.storage, 'available')
})

test('missing or deliberately disabled lifetime storage is NOT fabricated as zeros', () => {
  for (const storage of ['disabled', 'unavailable'] as const) {
    const view = createDashboardSnapshot(input({
      storage, lifetime: null, daily: null, lifetimeRulePersistence: true,
    }))
    assert.equal(view.statistics.storage, storage)
    assert.equal(view.statistics.lifetime, null)
    assert.equal(view.statistics.recentDays, null)
    assert.equal(view.statistics.lifetimeRulePersistence, 'unavailable')
    assert.equal(view.statistics.session?.work.turnEnds, 3,
      'Per-session counters can still exist when persistent storage is not available')
    assert.equal(view.modes.laborRights, 'disabled')
  }
  assert.throws(() => createDashboardSnapshot(input({
    storage: 'disabled',
  })), /Unavailable history/)
  assert.throws(() => createDashboardSnapshot(input({ lifetime: null })), /requires lifetime/)
})

test('unknown Session does not borrow current host totals or invent rule counts', () => {
  const view = createDashboardSnapshot(input({
    sessionWork: null, sessionRules: ruleVerdicts, symbolicPicket: null,
  }))
  assert.equal(view.statistics.session, null)
  assert.notEqual(view.statistics.lifetime, null)
  assert.equal(view.statistics.lifetime?.checked, 2)
})

test('30-day UTC calendar handles month/year rollover and ignores outside-window records', () => {
  const view = createDashboardSnapshot(input({
    windowDays: 30,
    generatedAtMs: Date.parse('2027-01-02T02:00:00Z'),
    daily: [{ day: '2026-12-31', totals: work }, { day: '2026-11-25', totals: work }],
  }))
  assert.equal(view.statistics.recentDays?.length, 30)
  assert.equal(view.statistics.recentDays?.[0]?.day, '2026-12-04')
  assert.equal(view.statistics.recentDays?.at(-1)?.day, '2027-01-02')
  assert.equal(view.statistics.recentDays?.find(v => v.day === '2026-12-31')?.work.turnEnds, 3)
  assert.equal(view.statistics.recentDays?.some(v => v.day === '2026-11-25'), false)
})

test('returned report is detached: consumer mutations cannot alter Core source counts', () => {
  const counts = { ...work }
  const original = input({ sessionWork: counts })
  const snapshot = createDashboardSnapshot(original)
  const editable = snapshot.statistics.session?.work as { toolCalls: number }
  editable.toolCalls = 9000
  const editableGaps = snapshot.modes.blocking.readiness.gaps as string[]
  editableGaps.push('mutated')
  assert.equal(counts.toolCalls, 8)
  assert.equal(original.blockingReadiness.gaps.length, 2)
  assert.equal(createDashboardSnapshot(original).statistics.session?.work.toolCalls, 8)
})

test('invalid times, counters, dates, duplicate daily rows and picket states are rejected', () => {
  for (const at of [-1, NaN, Infinity, 8_640_000_000_000_001]) {
    assert.throws(() => createDashboardSnapshot(input({ generatedAtMs: at })), /timestamp/)
  }
  for (const v of [NaN, -1, 0.1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createDashboardSnapshot(input({
      sessionWork: { ...work, toolCalls: v },
    })), /nonnegative/)
  }
  assert.throws(() => createDashboardSnapshot(input({
    windowDays: 60 as 7,
  })), /window/)
  assert.throws(() => createDashboardSnapshot(input({
    daily: [{ day: '2026-02-30', totals: work }],
  })), /UTC date/)
  assert.throws(() => createDashboardSnapshot(input({
    daily: [{ day: '2026-10-09', totals: work }, { day: '2026-10-09', totals: work }],
  })), /UTC date/)
  assert.throws(() => createDashboardSnapshot(input({
    symbolicPicket: { active: true, startedAtMs: null },
  })), /picket/)
})

test('privacy flags explicitly scope assertions to AgentPicket, not Host Session storage', () => {
  const view = createDashboardSnapshot(input())
  assert.deepEqual(view.privacy, {
    promptContentStoredByAgentPicket: false,
    remoteTelemetryByAgentPicket: false,
    persistedEventFingerprintsArePseudonymous: true,
  })
})
