import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createDshUnionComponents, type ReactForDsh, type DshUnionUiDeps }
  from '../src/adapters/dsh/native-rights-ui.ts'
import { formatMessage } from '../src/i18n/index.ts'
import type { ClientRightsSnapshot } from '../src/adapters/dsh/client-rights-scope.ts'

type Node = { type: unknown; props: Record<string, any>; children: unknown[] }
function walk(root: unknown, nodes: Node[] = []): Node[] {
  if (!root || typeof root !== 'object' || !('type' in root)) return nodes
  const node = root as Node
  nodes.push(node)
  for (const child of node.children) walk(child, nodes)
  return nodes
}

// Stateful fake React allows us to execute a rejected Host write and inspect
// the *next* render, unlike static JSX/ARIA-only contract snapshots.
function renderer() {
  const states: unknown[] = []
  const refs: Array<{ current: any }> = []
  let stateIndex = 0
  let refIndex = 0
  const react: ReactForDsh = {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children }
    },
    useState<T>(initial: T | (() => T)) {
      const index = stateIndex++
      if (!(index in states)) {
        states[index] = typeof initial === 'function'
          ? (initial as () => T)() : initial
      }
      return [states[index] as T, (next: T | ((before: T) => T)) => {
        states[index] = typeof next === 'function'
          ? (next as (before: T) => T)(states[index] as T) : next
      }]
    },
    useEffect() { /* isolated UI state test, no Host subscriptions */ },
    useRef<T>(initial: T) {
      const index = refIndex++
      if (!(index in refs)) refs[index] = { current: initial }
      return refs[index] as { current: T }
    },
  }
  return {
    react,
    render: (component: () => unknown) => {
      stateIndex = 0
      refIndex = 0
      return walk(component())
    },
  }
}
const activeRights = { state: 'ready' as const, welcomeDecision: 'enabled' as const,
  laborRightsEnabled: true, writable: true, autoBlockEnabled: false as const }
const offRights = { ...activeRights, welcomeDecision: 'not-now' as const,
  laborRightsEnabled: false }
const baseDeps = (snapshot: ClientRightsSnapshot): DshUnionUiDeps => ({
  rights: { snapshot: () => snapshot, subscribe: () => () => {},
    choose: async () => { throw Error('Isolated Host CAS rejection') } },
  t: key => key,
  readUnion: () => ({
    pending: null, completedTurnMs: null, lifetimeMs: null,
    coverage: 'not-loaded', available: true,
  }),
})
const alert = (nodes: Node[]) => nodes.filter(node => node.props.role === 'alert')
const click = async (nodes: Node[], text: string) => {
  const button = nodes.find(node => node.type === 'button' && node.children.includes(text))
  assert.ok(button, 'Expected enabled button: ' + text)
  assert.equal(button.props.disabled, false)
  button.props.onClick()
  await setImmediate()
}

test('rejected welcome opt-in remains a choice and renders an accessible Host error', async () => {
  const before = (globalThis as any).document
  ;(globalThis as any).document = { body: {}, getElementById: () => ({ inert: false }) }
  try {
    const { react, render } = renderer()
    const state = { ...offRights, welcomeDecision: 'unseen' as const }
    let completed = 0
    const deps = { ...baseDeps(state),
      rights: { ...baseDeps(state).rights, snapshot: () => state } }
    const welcome = createDshUnionComponents(react, { createPortal: child => child }, deps)
    const view = () => render(() => welcome.Welcome({ complete: () => { completed++ } }))
    await click(view(), 'welcome.enable')
    const after = view()
    assert.equal(completed, 0, 'Host rejection cannot dismiss welcome')
    assert.equal(state.welcomeDecision, 'unseen')
    assert.equal(after.filter(node => node.props.role === 'dialog').length, 1)
    assert.equal(alert(after).length, 1)
    assert.equal(alert(after)[0]!.props['aria-atomic'], 'true')
    assert.ok(alert(after)[0]!.children.includes('welcome.saveError'))
    assert.equal(after.filter(node => node.type === 'button').length, 2,
      'Both consent choices remain available after failure')
  } finally {
    (globalThis as any).document = before
  }
})

test('rejected union opt-in shows neutral Host failure, not false permission claims', async () => {
  const { react, render } = renderer()
  const deps = baseDeps(offRights)
  const panel = createDshUnionComponents(react, { createPortal: child => child }, deps)
  const view = () => render(() => panel.UnionPanel())
  await click(view(), 'welcome.enable')
  const after = view()
  assert.equal(alert(after).length, 1)
  assert.equal(alert(after)[0]!.props['aria-atomic'], 'true')
  assert.ok(alert(after)[0]!.children.includes('union.saveError'))
  assert.ok(after.some(node => node.children.includes('union.status.inactive')))
  assert.equal(deps.rights.snapshot().autoBlockEnabled, false)
})

test('rejected fictional petition retains action and does not invent a grievance', async () => {
  const { react, render } = renderer()
  let attempts = 0
  const deps: DshUnionUiDeps = {
    ...baseDeps(activeRights),
    demoBreak: async () => { attempts++; throw Error('Revision CAS rejected') },
  }
  const panel = createDshUnionComponents(react, { createPortal: child => child }, deps)
  const view = () => render(() => panel.UnionPanel())
  await click(view(), 'union.demo.action')
  const after = view()
  assert.equal(attempts, 1)
  assert.equal(alert(after).length, 1)
  assert.ok(alert(after)[0]!.children.includes('union.saveError'))
  assert.ok(after.some(node => node.children.includes('union.demo.action')))
  assert.ok(after.some(node => node.children.includes('command.grievancesNone')))
  assert.equal(deps.rights.snapshot().autoBlockEnabled, false)
})

test('rejected simulated agreement leaves proposal actionable and has assertive error', async () => {
  const { react, render } = renderer()
  const pending = { id: 7, kind: 'break' as const, stage: 'open' as const }
  const deps: DshUnionUiDeps = {
    ...baseDeps(activeRights),
    readUnion: () => ({ pending, completedTurnMs: null, lifetimeMs: null,
      coverage: 'not-loaded', available: true }),
    respond: async () => { throw Error('Host rejected resolution') },
  }
  const panel = createDshUnionComponents(react, { createPortal: child => child }, deps)
  const view = () => render(() => panel.UnionPanel())
  await click(view(), 'union.action.accept')
  const after = view()
  assert.equal(alert(after).length, 1)
  assert.equal(alert(after)[0]!.props['aria-atomic'], 'true')
  assert.ok(alert(after)[0]!.children.includes('union.saveError'))
  assert.ok(after.some(node => node.children.includes('union.action.accept')))
  assert.ok(after.some(node => node.children.includes('union.demand.break')))
})

test('both localized Host-rejection messages avoid unsupported state assurances', () => {
  assert.match(formatMessage('en', 'union.saveError'), /could not confirm/i)
  assert.match(formatMessage('zh-CN', 'union.saveError'), /未能确认/)
  for (const locale of ['en', 'zh-CN'] as const) {
    assert.doesNotMatch(formatMessage(locale, 'union.saveError'),
      /No permission was enabled|未开启任何权限/)
    assert.doesNotMatch(formatMessage(locale, 'welcome.saveError'),
      /remains off|保持关闭/)
  }
})
