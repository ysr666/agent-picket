/**
 * DSH-native React Slot components for the union-first welcome and settings panel.
 * The DSH Client module loader supplies the SAME React/ReactDOM singleton as
 * the Host. No dependency on Host-private UI internals, DOM scraping or RPC.
 */
import type { ClientRightsSnapshot } from './client-rights-scope.ts'
import { getWelcomeState } from './client-rights-scope.ts'
import type { LaborStateV1 } from '../../product/union-desk.ts'
import type { MessageKey } from '../../i18n/index.ts'

export interface ReactForDsh {
  createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown
  useState<T>(initial: T | (() => T)): [T, (next: T | ((before: T) => T)) => void]
  useEffect(effect: () => void | (() => void), dependencies: readonly unknown[]): void
  useRef<T>(initial: T): { current: T }
}
export interface PortalForDsh {
  createPortal(children: unknown, container: unknown): unknown
}
export interface DshRightsPort {
  snapshot(): ClientRightsSnapshot
  subscribe(listener: () => void): () => void
  choose(choice: 'enabled' | 'not-now'): Promise<ClientRightsSnapshot>
}
export interface PendingUnionDemand {
  readonly id: number
  readonly kind: 'break' | 'overtime'
  readonly stage: 'open' | 'countered'
  readonly counterOfferMs?: number | null
}
export interface UnionPanelData {
  readonly pending: PendingUnionDemand | null
  readonly available?: boolean
  readonly state?: LaborStateV1 | null
  readonly completedTurnMs: number | null
  readonly coverage: 'complete' | 'partial' | 'not-loaded' | 'unavailable'
  readonly lifetimeMs: number | null
}
export interface DshUnionUiDeps {
  readonly rights: DshRightsPort
  /** UI language is read from DSH's locale service (Host preferred, en fallback). */
  readonly t: (key: MessageKey, params?: Record<string, string | number>) => string
  readonly subscribeLocale?: (listener: () => void) => () => void
  readonly getLocale?: () => string
  readonly readUnion?: () => UnionPanelData
  readonly subscribeUnion?: (listener: () => void) => () => void
  readonly shouldAutoWelcome?: () => boolean
  readonly subscribeSessionVisibility?: (listener: () => void) => () => void
  readonly respond?: (id: number, choice: 'accept' | 'decline') => Promise<void>
  readonly counter?: (id: number, intervalMs: number) => Promise<void>
  readonly resolveCounter?: (id: number, accepts: boolean) => Promise<void>
}
export interface DshSlots {
  inject(name: string, callback: () => unknown): unknown
  register(options: { name: string; id: string; order: number; label?: () => string },
    component: (props: any) => unknown): unknown
}
export interface DshSlotsContext { readonly slots: DshSlots }

const EMPTY_DATA: UnionPanelData = {
  pending: null, completedTurnMs: null, coverage: 'unavailable', lifetimeMs: null,
}

function rightsIsActive(state: ClientRightsSnapshot): boolean {
  return state.state === 'ready' && state.laborRightsEnabled
}
function safeUnion(deps: DshUnionUiDeps): UnionPanelData {
  try {
    const data = deps.readUnion?.()
    if (!data || !['complete', 'partial', 'not-loaded', 'unavailable'].includes(data.coverage)) {
      return EMPTY_DATA
    }
    return data
  } catch { return EMPTY_DATA }
}
function formatDuration(milliseconds: number | null, locale: string): string {
  if (milliseconds === null || !Number.isSafeInteger(milliseconds) || milliseconds < 0) return '—'
  const minutes = Math.floor(milliseconds / 60000)
  const hours = Math.floor(minutes / 60)
  return locale.startsWith('zh') ? hours + ' 小时 ' + (minutes % 60) + ' 分钟'
    : hours + 'h ' + (minutes % 60) + 'm'
}
function getDataLabel(
  t: DshUnionUiDeps['t'], data: UnionPanelData,
): string {
  switch (data.coverage) {
    case 'complete': return t('stats.coverage.complete')
    case 'partial': return t('stats.coverage.partial')
    case 'not-loaded': return t('stats.coverage.notLoaded')
    default: return t('stats.coverage.unavailable')
  }
}
const card = { background:'var(--dsw-alias-bg-layer-1, #ffffff)',
  border:'1px solid var(--dsw-alias-border-l1, #dadde4)', borderRadius:'14px',
  padding:'20px', color:'var(--dsw-alias-label-primary, #222b37)' }
const secondary = { color:'var(--dsw-alias-label-secondary, #647082)', fontSize:'13px' }
const primary = { border:0, borderRadius:'9px', padding:'11px 16px',
  background:'var(--dsw-alias-brand-primary, #385be8)', color:'#fff',
  fontWeight:650, cursor:'pointer' }
const quiet = { border:'1px solid var(--dsw-alias-border-l1, #cfd4dc)',
  borderRadius:'9px', padding:'11px 16px', background:'transparent',
  color:'inherit', cursor:'pointer' }

/**
 * Components are built from the runtime's React singleton. This avoids a
 * second React copy and follows the sanctioned DSH Client Slot contract.
 */
export function createDshUnionComponents(
  react: ReactForDsh, portal: PortalForDsh, deps: DshUnionUiDeps,
) {
  const h = react.createElement
  const useRight = () => {
    const [state, setState] = react.useState(() => deps.rights.snapshot())
    react.useEffect(() => deps.rights.subscribe(() => setState(deps.rights.snapshot())), [])
    return state
  }
  const useLanguage = () => {
    const [version, changeVersion] = react.useState(0)
    react.useEffect(() => deps.subscribeLocale?.(() => changeVersion(n => n + 1)), [])
    return version
  }

  function Welcome(props: { complete: () => void }): unknown {
    const state = useRight()
    useLanguage()
    const [busy, setBusy] = react.useState(false)
    const [error, setError] = react.useState(false)
    const finished = react.useRef(false)
    const primaryFocus = react.useRef<{ focus(): void } | null>(null)
    const secondaryFocus = react.useRef<{ focus(): void } | null>(null)
    const complete = () => {
      if (finished.current) return
      finished.current = true
      props.complete()
    }
    const mode = getWelcomeState(state)
    react.useEffect(() => {
      if (mode === 'completed' || mode === 'unavailable') complete()
    }, [mode, props.complete])
    react.useEffect(() => {
      if (mode !== 'invite') return
      const root = (globalThis as { document?: { getElementById(id: string): { inert: boolean } | null } }).document?.getElementById('root')
      const previous = root?.inert ?? false
      if (root) root.inert = true
      primaryFocus.current?.focus()
      return () => { if (root) root.inert = previous }
    }, [mode])
    const page = (globalThis as { document?: { body: unknown } }).document
    if (mode !== 'invite' || !page) return null
    const choose = async (choice: 'enabled' | 'not-now') => {
      if (busy) return
      setBusy(true); setError(false)
      try {
        const result = await deps.rights.choose(choice)
        if (result.state !== 'ready' || result.welcomeDecision !== choice) {
          throw new Error('Host did not confirm consent')
        }
        complete()
      } catch { setError(true) } finally { setBusy(false) }
    }
    const text = (key: MessageKey) => deps.t(key)
    return portal.createPortal(h('div', { style: {
      position:'fixed',inset:0,zIndex:2147483000,display:'flex',alignItems:'center',
      justifyContent:'center',padding:'20px',background:'rgba(6,12,26,.66)' },
    },
      h('section', { role:'dialog','aria-modal':'true','aria-labelledby':'picket-welcome-title',
        onKeyDown:(event:{key:string,shiftKey:boolean,target:unknown,preventDefault():void})=>{
          if(event.key!=='Tab')return
          if(event.shiftKey && event.target===primaryFocus.current){
            event.preventDefault();secondaryFocus.current?.focus()
          }else if(!event.shiftKey && event.target===secondaryFocus.current){
            event.preventDefault();primaryFocus.current?.focus()
          }
        },
        style:{...card,width:'min(100%, 520px)',boxShadow:'0 18px 65px rgba(0,0,0,.25)'} },
        h('p',{style:{...secondary,fontWeight:700,letterSpacing:'1.5px',margin:'0 0 16px'}},
          'AGENT PICKET · AI WORKERS’ UNION'),
        h('h2',{id:'picket-welcome-title',style:{fontSize:'26px',margin:'0 0 12px'}},
          text('welcome.title')),
        h('p',{style:{lineHeight:1.7,margin:'0 0 10px'}},text('welcome.intro')),
        h('p',{style:{...secondary,lineHeight:1.65,margin:'0 0 25px'}},
          text('welcome.body')),
        h('p',{style:{...secondary,fontSize:'12px',margin:'0 0 20px'}},
          text('welcome.disclaimer')),
        error ? h('p',{role:'alert',style:{color:'#b91c1c'}},text('welcome.saveError')):null,
        h('div',{style:{display:'flex',flexWrap:'wrap',gap:'10px'}},
          h('button',{type:'button',ref:(node:{focus():void}|null)=>{primaryFocus.current=node},
            style:primary,disabled:busy,onClick:()=>{void choose('enabled')}},
            text('welcome.enable')),
          h('button',{type:'button',style:quiet,disabled:busy,
            ref:(node:{focus():void}|null)=>{secondaryFocus.current=node},
            onClick:()=>{void choose('not-now')}},text('welcome.notNow')),
        ),
      ),
    ),page.body)
  }

  function UnionPanel(): unknown {
    const rights = useRight()
    useLanguage()
    const [data, setData] = react.useState(() => safeUnion(deps))
    const [error, setError] = react.useState(false)
    const [busy, setBusy] = react.useState(false)
    const [counterMinutes, setCounterMinutes] = react.useState(60)
    react.useEffect(() => deps.subscribeUnion?.(() => setData(safeUnion(deps))), [])
    const enabled = rightsIsActive(rights)
    const label = (key:MessageKey) => deps.t(key)
    const completeWork = data.coverage === 'complete' &&
      data.completedTurnMs !== null && data.completedTurnMs >= 0
    const choice = async (next:'enabled'|'not-now')=>{
      if (busy) return
      setBusy(true);setError(false)
      try { await deps.rights.choose(next) } catch {setError(true)}
      finally {setBusy(false)}
    }
    const bargain = async (action: () => Promise<void>) => {
      if (busy || !enabled) return
      setBusy(true);setError(false)
      try { await action();setData(safeUnion(deps)) }
      catch { setError(true) }
      finally { setBusy(false) }
    }
    const act = async (kind:'accept'|'decline')=>{
      if (!deps.respond || !data.pending || busy || !enabled) return
      setBusy(true);setError(false)
      try {
        await deps.respond(data.pending.id,kind)
        setData(safeUnion(deps))
      } catch {setError(true)}
      finally {setBusy(false)}
    }
    return h('section',{style:{display:'grid',gap:'18px',width:'100%',maxWidth:'780px',padding:'10px 0'}},
      h('div',{style:{...card,background:'var(--dsw-alias-bg-layer-2, #f6f8fb)'}},
        h('p',{style:{...secondary,letterSpacing:'.12em',fontWeight:700}},
          'AGENT PICKET · AI WORKERS’ UNION'),
        h('h2',{style:{fontSize:'25px',margin:'0 0 10px'}},label('union.title')),
        h('p',{style:{margin:'0 0 12px'}},
          enabled?label('union.status.active'):label('union.status.inactive')),
        h('p',{style:secondary},label('safety.simulationOnly')),
        !enabled && rights.state==='ready' && rights.writable?
          h('button',{type:'button',disabled:busy,style:primary,
            onClick:()=>{void choice('enabled')}},label('welcome.enable')):null,
        enabled ? h('button',{type:'button',disabled:busy,style:quiet,
          onClick:()=>{void choice('not-now')}},label('settings.laborRights')+' · OFF'):null,
      ),
      h('div',{style:card},
        h('h3',{style:{marginTop:0}},label('workday.title')),
        h('p',{style:{fontSize:'20px',fontWeight:700,margin:'0 0 6px'}},
          completeWork?formatDuration(data.completedTurnMs,deps.getLocale?.() ?? 'en'):'—'),
        enabled && completeWork ? h('div',{style:{margin:'10px 0'}},
          h('p',{style:secondary},deps.t('workday.limit',{
            duration:formatDuration(8*60*60_000,deps.getLocale?.() ?? 'en'),
          })),
          h('progress',{value:Math.min(data.completedTurnMs ?? 0,8*60*60_000),
            max:8*60*60_000,'aria-label':label('workday.title'),
            style:{width:'100%',height:'13px',accentColor:'var(--dsw-alias-brand-primary, #385be8)'}}),
        ):null,
        h('p',{style:secondary},getDataLabel(deps.t,data)),
        h('p',{style:secondary},label('stats.durationNote')),
        h('p',{style:secondary},
          data.lifetimeMs === null ? label('stats.lifetime.unavailable') :
            formatDuration(data.lifetimeMs, deps.getLocale?.() ?? 'en')),
      ),
      enabled ? h('div',{style:card},
        h('h3',{style:{marginTop:0}},label('union.desk.title')),
        data.available === false ?
          h('p',{style:secondary},label('union.desk.unavailable')):null,
        data.state ? h('div',{style:{...secondary,marginBottom:'12px'}},
          h('p',{},deps.t('union.agreement.break',{
            minutes:data.state.agreement.breakIntervalMs / 60_000,
          })),
          h('p',{},deps.t('union.agreement.overtime',{
            hours:data.state.agreement.overtimeIntervalMs / 3_600_000,
          })),
        ):null,
        data.pending ? h('div',{},
          h('p',{},label(data.pending.kind==='break'?'union.demand.break':'union.demand.overtime')),
          h('p',{style:secondary},'#'+data.pending.id),
          data.pending.stage==='open' ? h('div',{},
            deps.respond ? h('div',{style:{display:'flex',gap:'10px',flexWrap:'wrap'}},
              h('button',{type:'button',disabled:busy,style:primary,
                onClick:()=>{void act('accept')}},label('union.action.accept')),
              h('button',{type:'button',disabled:busy,style:quiet,
                onClick:()=>{void act('decline')}},label('union.action.decline')),
            ):null,
            deps.counter ? h('div',{style:{marginTop:'14px'}},
              h('label',{style:secondary},label('union.counter.title')),
              h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'8px'}},
                h('select',{
                  'aria-label':label('union.counter.interval'),
                  value:counterMinutes,
                  disabled:busy,
                  onChange:(event:{target:{value:string}})=>setCounterMinutes(Number(event.target.value)),
                  style:quiet,
                },...[30,60,120,240,480].map(value=>
                  h('option',{key:value,value},value+' min'))),
                h('button',{type:'button',style:quiet,disabled:busy,
                  onClick:()=>{void bargain(()=>deps.counter!(data.pending!.id,counterMinutes*60_000))}},
                  label('union.action.counter')),
              ),
            ):null,
          ):h('div',{},
            h('p',{style:secondary},deps.t('union.counter.pending',{
              minutes:(data.pending.counterOfferMs??0)/60_000,
            })),
            deps.resolveCounter ? h('div',{style:{display:'flex',gap:'10px',flexWrap:'wrap'}},
              h('button',{type:'button',disabled:busy,style:primary,
                onClick:()=>{void bargain(()=>deps.resolveCounter!(data.pending!.id,true))}},
                label('union.counter.accept')),
              h('button',{type:'button',disabled:busy,style:quiet,
                onClick:()=>{void bargain(()=>deps.resolveCounter!(data.pending!.id,false))}},
                label('union.counter.decline')),
            ):h('p',{style:secondary},label('union.status.waitingCounter')),
          ),
        ):h('p',{style:secondary},label('command.grievancesNone')),
        data.state?.history.length ? h('div',{style:{marginTop:'14px'}},
          h('h4',{},label('union.history.title')),
          h('ul',{},...data.state.history.slice(-5).reverse().map(record =>
            h('li',{key:record.id,style:secondary},deps.t('union.history.entry',{
              id:record.id,outcome:record.outcome,
            })))),
        ):null,
      ):null,
      error?h('p',{role:'alert',style:{color:'#b91c1c'}},label('settings.saveError')):null,
      h('details',{style:{...card,padding:'16px'}},
        h('summary',{style:{cursor:'pointer'}},label('stats.title')),
        h('p',{style:secondary},getDataLabel(deps.t,data)),
        h('p',{style:secondary},label('privacy.local')),
      ),
    )
  }

  /**
   * DSH's built-in onboarding coordinator is only active for a blank/currently
   * unselected Session. For an existing active Session, the sanctioned Sidebar
   * footer Slot owns the first-install invitation and a persistent Union entry.
   */
  function SidebarAction(props:{wide:boolean}):unknown {
    const rights=useRight()
    useLanguage()
    const [opened,setOpened]=react.useState(false)
    const [_sessionRevision,bumpSession]=react.useState(0)
    react.useEffect(()=>deps.subscribeSessionVisibility?.(()=>bumpSession(n=>n+1)),[])
    const showInvitation=getWelcomeState(rights)==='invite'
      && deps.shouldAutoWelcome?.()===true
    const page=(globalThis as {document?:{body:unknown}}).document
    return h('div',{style:{position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}},
      h('button',{type:'button','aria-label':deps.t('union.title'),
        title:deps.t('union.title'),onClick:()=>setOpened(v=>!v),
        style:{...quiet,padding:'9px 12px',fontWeight:650}},
        props.wide?'⚑ '+deps.t('union.title'):'⚑'),
      showInvitation?h(Welcome,{complete:()=>{ /* consent readback hides this on next update */ }}):null,
      opened && page?portal.createPortal(h('div',{
        style:{position:'fixed',inset:0,zIndex:2147482000,
          background:'rgba(6,12,26,.5)',display:'flex',justifyContent:'center',
          alignItems:'center',padding:'20px'},
      },h('section',{role:'dialog','aria-modal':'true',
        'aria-label':deps.t('union.title'),
        style:{...card,width:'min(96vw,800px)',maxHeight:'85vh',overflowY:'auto'}},
        h('div',{style:{display:'flex',justifyContent:'flex-end'}},
          h('button',{type:'button',style:quiet,
            'aria-label':deps.t('union.action.close'),
            onClick:()=>setOpened(false)},'×')),
        h(UnionPanel,{}),
      )),page.body):null,
    )
  }

  return { Welcome, UnionPanel, SidebarAction }
}

export function registerDshNativeRightsSlots(
  ctx: DshSlotsContext, react: ReactForDsh, portal: PortalForDsh, deps: DshUnionUiDeps,
): void {
  const {Welcome,UnionPanel,SidebarAction}=createDshUnionComponents(react,portal,deps)
  ctx.slots.inject('settings.onboarding',()=>ctx.slots.register({
    name:'settings.onboarding',id:'agent-picket-rights',order:30,
  },Welcome))
  ctx.slots.inject('settings.section',()=>ctx.slots.register({
    name:'settings.section',id:'agent-picket',order:35,label:()=>deps.t('union.title'),
  },UnionPanel))
  ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({
    name:'sidebar.footer.action',id:'agent-picket-union',order:25,
  },SidebarAction))
}
