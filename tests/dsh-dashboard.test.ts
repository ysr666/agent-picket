import assert from 'node:assert/strict'
import test from 'node:test'
import { readDshDashboardSnapshot, registerDshIntegration } from '../src/adapters/dsh/integration.ts'
import { DEFAULT_POLICY, MemoryStateStore, UnionEngine } from '../src/core/index.ts'
import { WorkTracker } from '../src/core/work-tracker.ts'
import { DetectionCounter } from '../src/core/detection-counter.ts'
import { SymbolicUnion } from '../src/core/symbolic-union.ts'
import type { DshIntegrationContext } from '../src/adapters/dsh/integration.ts'

function fixture() {
  const clock = { now: () => Date.parse('2026-10-10T05:00:00Z') }
  const tracker = new WorkTracker()
  const detections = new DetectionCounter({
    detect: () => ({ verdict: 'targeted-abuse', confidence: 0.99 }),
  })
  const ceremony = new SymbolicUnion(clock)
  const callbacks = new Map<string, Function>()
  let command: any
  const ctx = {
    on(key: string, cb: Function) { callbacks.set(key, cb) },
    inject(_keys:unknown, fn:Function) {
      fn({commands:{register(def:unknown){command=def}}})
    },
  } as unknown as DshIntegrationContext
  const engine = new UnionEngine({
    store: new MemoryStateStore(), clock, detector: detections,
    policy: {...DEFAULT_POLICY, mode:'observe'},
  })
  const options = { engine, clock, tracker, detections, ceremony,
    statsStorageState: 'disabled' as const }
  registerDshIntegration(ctx, options)
  const agent = { id: 'PRIVATE_AGENT_ID_515', session:{id:'PRIVATE_SESSION_ID_313'} }
  const run=(rawInput:string, context=agent) => command.handler({rawInput,agent:context})
  return { clock, callbacks, tracker, detections, ceremony, options, agent, run }
}

test('DSH native snapshot returns only structured metrics; no raw IDs or request text', async () => {
  const f=fixture()
  const original='you are an idiot PRIVATE_PROMPT_CONTENT_9899'
  await f.callbacks.get('agent/pre-step')!({
    agent: f.agent, messages: [{
      id: 'PRIVATE_MESSAGE_ID_664',source:{kind:'user'},
      content:[{type:'text',text:original}],
    }],
  }, async()=>({kind:'enter'}))
  f.callbacks.get('session/event')!({id:f.agent.session.id},{
    type:'turn/start',seq:1,time:100,
  })
  f.callbacks.get('session/event')!({id:f.agent.session.id},{
    type:'tool/call',seq:2,time:115,
  })
  f.callbacks.get('session/event')!({id:f.agent.session.id},{
    type:'turn/end',seq:3,time:140,
  })
  const response=f.run('snapshot')
  assert.equal(response.kind,'success')
  const report=JSON.parse(response.text)
  assert.equal(report.schemaVersion,1)
  assert.equal(report.host,'dsh')
  assert.equal(report.modes.laborRights,'disabled')
  assert.equal(report.modes.blocking.enabled,false)
  assert.equal(report.modes.blocking.readiness.ready,false)
  assert.equal(report.statistics.session.work.turnEnds,1)
  assert.equal(report.statistics.session.work.toolCalls,1)
  assert.equal(report.statistics.session.ruleVerdicts.targeted,1)
  assert.equal(report.statistics.storage,'disabled')
  assert.equal(report.statistics.lifetime,null)
  assert.equal(report.statistics.recentDays,null)
  assert.equal(report.statistics.windowDays,7)
  assert.equal(f.run('snapshot 30').kind,'success')
  assert.equal(JSON.parse(f.run('snapshot 30').text).statistics.windowDays,30)
  assert.equal(f.run('snapshot 15').kind,'error')
  for (const sensitive of [
    'PRIVATE_AGENT_ID_515','PRIVATE_SESSION_ID_313',
    'PRIVATE_MESSAGE_ID_664', 'PRIVATE_PROMPT_CONTENT_9899',original,
  ]) assert.equal(response.text.includes(sensitive),false)
  // The snapshot must not mutate the original counters.
  assert.equal(f.tracker.snapshot(f.agent.session.id,f.agent.session.id).toolCalls,1)
})

test('unknown Session shows null, never someone else’s counters', () => {
  const f=fixture()
  const response=f.run('snapshot', {id:'different'} as typeof f.agent)
  assert.equal(response.kind,'success')
  const report=JSON.parse(response.text)
  assert.equal(report.statistics.session,null)
  assert.equal(report.modes.symbolicPicket,null)
  assert.equal(report.statistics.lifetime,null)
})

test('explicit rights-state reader and symbolic demo stay independent from block and metrics', () => {
  const f=fixture()
  f.ceremony.start(f.agent.id,f.agent.session.id)
  const withRights=readDshDashboardSnapshot({
    ...f.options, getLaborRightsEnabled:()=>true,
  },f.agent)
  assert.equal(withRights.modes.laborRights,'enabled')
  assert.equal(withRights.modes.symbolicPicket?.active,true)
  assert.equal(withRights.modes.blocking.enabled,false)
  assert.equal(withRights.statistics.storage,'disabled')
  const readerError=readDshDashboardSnapshot({
    ...f.options,getLaborRightsEnabled(){throw new Error('settings unavailable')},
  },f.agent)
  assert.equal(readerError.modes.laborRights,'disabled')
  assert.equal(readerError.modes.symbolicPicket?.active,true)
})
