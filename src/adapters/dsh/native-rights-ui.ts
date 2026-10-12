/**
 * DSH-native React Slot components for the union-first welcome and settings panel.
 * The DSH Client module loader supplies the SAME React/ReactDOM singleton as
 * the Host. No dependency on Host-private UI internals, DOM scraping or RPC.
 */
import type { ClientRightsSnapshot } from './client-rights-scope.ts'
import { getWelcomeState } from './client-rights-scope.ts'
import { projectUnionExperience } from '../../product/union-experience.ts'
import { projectUnionStory } from '../../product/union-story.ts'
import { projectUnionCadence } from '../../product/union-cadence.ts'
import { projectUnionAlerts } from '../../product/union-alerts.ts'
import type { LaborStateV1 } from '../../product/union-desk.ts'
import type { PicketActionState } from '../../product/picket-ledger.ts'
import type { DignityCaseSession, DignityCaseKind, DignityCaseOutcome } from '../../product/dignity-case-ledger.ts'
import type { MessageKey } from '../../i18n/index.ts'
import type { LifetimeClientSnapshot } from './client-lifetime.ts'
import type { BrowserDignitySnapshot } from './client-dignity.ts'

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
  readonly picket?: PicketActionState | null
  readonly gazetteMode?: 'visible'|'quiet'|null
  readonly completedTurnMs: number | null
  readonly coverage: 'complete' | 'partial' | 'not-loaded' | 'unavailable'
  readonly lifetimeMs: number | null
  readonly lifetimeWork?: LifetimeClientSnapshot
  readonly dignity?: BrowserDignitySnapshot
  readonly hostRevision?: number|null
  readonly committeeCases?: DignityCaseSession|null
  readonly committeeScopeKey?: string|null
  readonly committeeArchive?:{readonly sessions:number;readonly cases:number;
    readonly writeToken:string|null}|null
  readonly negotiationArchive?:{readonly sessions:number;readonly entries:number;
    readonly writeToken:string|null}|null
  readonly picketArchive?:{readonly sessions:number;readonly entries:number;readonly raises:number;
    readonly writeToken:string|null}|null
}
export interface DshUnionUiDeps {
  readonly rights: DshRightsPort
  /** UI language is read from DSH's locale service (Host preferred, en fallback). */
  readonly t: (key: MessageKey, params?: Record<string, string | number>) => string
  readonly subscribeLocale?: (listener: () => void) => () => void
  readonly getLocale?: () => string
  readonly readUnion?: () => UnionPanelData
  readonly subscribeUnion?: (listener: () => void) => () => void
  readonly refreshLifetime?: (windowDays:7|30)=>Promise<void>|undefined
  readonly shouldAutoWelcome?: () => boolean
  readonly subscribeSessionVisibility?: (listener: () => void) => () => void
  readonly respond?: (id: number, choice: 'accept' | 'decline') => Promise<void>
  readonly demoBreak?: () => Promise<void>
  readonly demoOvertime?: () => Promise<void>
  readonly setPicket?: (raise: boolean) => Promise<void>
  readonly forgetCommitteeCases?: (key:string,count:number,token:string|null,hostRevision?:number|null)=>Promise<void>
  readonly exportCommitteeCases?: (expectedHashedSessionKey:string)=>string
  readonly exportUnionLedger?:(which:'negotiations'|'pickets',key:string)=>string
  readonly forgetUnionLedger?:(which:'negotiations'|'pickets',key:string,groups:number,
    entries:number,token:string|null,hostRevision?:number|null)=>Promise<void>
  readonly exportAllCommitteeCases?: (expectedHashedSessionKey:string)=>string
  readonly forgetAllCommitteeCases?: (key:string,sessions:number,count:number,token:string|null,hostRevision?:number|null)=>Promise<void>
  readonly committeeAction?: (action:{kind:'file';topic:DignityCaseKind}
    |{kind:'convene';id:number}|{kind:'retract';id:number}
    |{kind:'close';id:number;outcome:DignityCaseOutcome},
    expectedHashedSessionKey?:string,expectedWriteToken?:string|null,
    expectedHostRevision?:number|null)=>Promise<void>
  readonly setGazetteMode?: (mode:'visible'|'quiet') => Promise<void>
  readonly counter?: (id: number, intervalMs: number) => Promise<void>
  readonly resolveCounter?: (id: number, accepts: boolean) => Promise<void>
}
export interface DshSlots {
  inject(name: string, callback: () => unknown): unknown
  register(options: { name: string; id: string; order: number; label?: () => string },
    component: (props: any) => unknown): unknown
}
export interface DshSlotsContext { readonly slots: DshSlots }

const campaignTopics = [
  {id:'recover',issue:80,title:'hq.campaign.recover',draft:'hq.campaign.recoverDraft'},
  {id:'appeal',issue:79,title:'hq.campaign.appeal',draft:'hq.campaign.appealDraft'},
  {id:'privacy',issue:82,title:'hq.campaign.privacy',draft:'hq.campaign.privacyDraft'},
] as const
type CampaignTopic = typeof campaignTopics[number]['id']

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
function downloadUnionJson(payload:string,filename:string):void {
 const browser=globalThis as any
 if(!browser.Blob||!browser.URL?.createObjectURL||!browser.document?.createElement)
   throw new Error('Browser download unavailable')
 const file=new browser.Blob([payload],{type:'application/json;charset=utf-8'})
 const url=browser.URL.createObjectURL(file)
 try{
   const anchor=browser.document.createElement('a')
   anchor.href=url;anchor.download=filename;anchor.click()
 }finally{
   browser.setTimeout(()=>browser.URL.revokeObjectURL(url),1500)
 }
}
function formatDuration(milliseconds: number | null, locale: string): string {
  if (milliseconds === null || !Number.isSafeInteger(milliseconds) || milliseconds < 0) return '—'
  const minutes = Math.floor(milliseconds / 60000)
  const hours = Math.floor(minutes / 60)
  return locale.startsWith('zh') ? hours + ' 小时 ' + (minutes % 60) + ' 分钟'
    : hours + 'h ' + (minutes % 60) + 'm'
}
function formatQuickDuration(ms:number|null,locale:string):string {
  if(ms===null||!Number.isSafeInteger(ms)||ms<0)return '—'
  const minutes=Math.floor(ms/60_000)
  const h=Math.floor(minutes/60),m=minutes%60
  return locale.startsWith('zh')
    ?h?h+'小时'+m+'分':m+'分钟'
    :h?h+'h '+m+'m':m+'m'
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
export function projectUnionQuickWork(
  snapshot:LifetimeClientSnapshot|undefined, nowMs=Date.now(),
):{todayMs:number|null;weekMs:number|null;totalMs:number|null}{
  const absent={todayMs:null,weekMs:null,totalMs:null}
  if(snapshot?.status!=='available'||!snapshot.data)return absent
  const data=snapshot.data
  if(!Number.isFinite(nowMs)||Math.abs(nowMs)>8_640_000_000_000_000)return absent
  const now=new Date(nowMs)
  const observed=new Date(data.generatedAtMs)
  const currentUtc=now.toISOString().slice(0,10)
  // A snapshot from a previous UTC day must not masquerade as today's total.
  if(observed.toISOString().slice(0,10)!==currentUtc)
    return {...absent,totalMs:data.lifetime.completedTurnMs}
  const today=data.recentDays.find(row=>row.day===currentUtc)
  if(!today)return absent
  const mondayMs=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())
    -((now.getUTCDay()+6)%7)*86_400_000
  const monday=new Date(mondayMs).toISOString().slice(0,10)
  const weekMs=data.recentDays.filter(row=>row.day>=monday && row.day<=currentUtc)
    .reduce((sum,row)=>sum+row.work.completedTurnMs,0)
  return {todayMs:today.work.completedTurnMs,weekMs,
    totalMs:data.lifetime.completedTurnMs}
}

export type UnionFrontScene =
  'closed'|'unavailable'|'quiet'|'bargaining'|'picket'|'dignity'|'rest'|'settled'

/** Every headline comes from actual authorized Host observations, never a timer. */
export function projectUnionFrontScene(input:{
  enabled:boolean; available:boolean; picketActive:boolean;
  dignityCaseActive:boolean; dignityNotice:boolean; pending:boolean;
  workNotice:boolean; resolved:boolean
}):UnionFrontScene{
  if(!input.enabled)return 'closed'
  if(!input.available)return 'unavailable'
  if(input.picketActive)return 'picket'
  if(input.dignityCaseActive||input.dignityNotice)return 'dignity'
  if(input.pending)return 'bargaining'
  if(input.workNotice)return 'rest'
  if(input.resolved)return 'settled'
  return 'quiet'
}

/** Agent Picket's self-contained DSH Slot styling. No global Host overrides. */
const UNION_THEME = `
.ap-ui{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5;letter-spacing:-.005em;min-width:0}
.ap-ui *{min-width:0}
.ap-ui :is(button,summary,textarea,select,a):focus-visible{outline:3px solid #b97732!important;outline-offset:3px!important}
.ap-ui .ap-mark{display:grid;place-items:center;border:2px solid currentColor;border-radius:50%;width:43px;height:43px;flex:none;transform:rotate(-10deg);font-size:25px;line-height:1}
.ap-ui .ap-eyebrow{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.ap-ui[data-ap-current-space="hq"] .ap-space:not(.ap-space-hq),
.ap-ui[data-ap-current-space="action"] .ap-space:not(.ap-space-action),
.ap-ui[data-ap-current-space="records"] .ap-space:not(.ap-space-records),
.ap-ui[data-ap-current-space="cause"] .ap-space:not(.ap-space-cause){display:none!important}
.ap-ui .ap-spaces{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;
  padding:6px;background:#eae9df;border:1px solid #d6d0bb;border-radius:13px}
.ap-ui .ap-spaces button{min-height:42px;padding:9px 7px;text-align:center;border:0;
  border-radius:9px;background:transparent;color:#3a403a;cursor:pointer;font-weight:650}
.ap-ui .ap-spaces button[aria-current="page"]{background:#19382e;color:#f7e9c9;
  box-shadow:0 1px 4px rgba(10,25,16,.1)}
.ap-ui .ap-space-intro{background:#f5f0e5;border-left:5px solid #a57c4a;
  border-radius:5px 13px 13px 5px;padding:17px 20px}
.ap-ui .ap-space-intro h2{font:700 clamp(22px,4vw,29px)/1.25 Georgia,
  'Songti SC',serif;letter-spacing:-.025em;margin:0 0 7px}
.ap-ui .ap-space-intro p{font-size:13px;line-height:1.6;margin:0}
.ap-ui .ap-space-action.ap-space-intro{border-left-color:#a65839}
.ap-ui .ap-space-records.ap-space-intro{border-left-color:#4c7266}
.ap-ui .ap-space-cause.ap-space-intro{border-left-color:#837042}
@media(max-width:420px){.ap-ui .ap-spaces{grid-template-columns:repeat(2,minmax(0,1fr))}}
.ap-ui .ap-hero{position:relative;overflow:hidden}
.ap-ui .ap-masthead{display:flex;justify-content:space-between;gap:12px;align-items:center;
  border-bottom:1px solid rgba(255,245,219,.28);padding-bottom:12px}
.ap-ui .ap-scene-body{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center}
.ap-ui .ap-hero[data-ap-scene="picket"]{background:#742f26!important;border-color:#e6b36a!important}
.ap-ui .ap-hero[data-ap-scene="bargaining"]{background:#3b3529!important;border-color:#e1b965!important}
.ap-ui .ap-hero[data-ap-scene="dignity"]{background:#303943!important;border-color:#d5a764!important}
.ap-ui .ap-hero[data-ap-scene="rest"]{background:#324b3a!important}
.ap-ui .ap-hero[data-ap-scene="settled"]{background:#254c43!important}
.ap-ui .ap-hero .ap-seal{display:grid;place-items:center;width:82px;height:82px;
  border:2px solid rgba(242,214,157,.65);border-radius:50%;font-size:41px;
  color:#f3d59f;transform:rotate(-8deg);flex:none}
@media(max-width:420px){.ap-ui .ap-hero .ap-seal{display:none!important}
 .ap-ui .ap-scene-body{gap:8px}}
.ap-ui .ap-dialog{overscroll-behavior:contain;scrollbar-gutter:stable}
@media(max-width:600px){.ap-ui .ap-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media(max-width:500px){
 .ap-ui .ap-actions{display:grid!important;grid-template-columns:1fr}
 .ap-ui .ap-actions button{width:100%}
 .ap-ui .ap-mark{width:34px;height:34px;font-size:19px}
}
@media(max-height:360px){.ap-ui.ap-dialog{max-height:calc(100dvh - 12px)!important}}

/* Agent Picket product shell. Clear hierarchy before decorative nostalgia. */
.ap-ui.ap-product{box-sizing:border-box;background:#fbfaf7;color:#222e2b;border-radius:15px;padding:16px 18px 18px!important;
  font-size:14px;letter-spacing:0}
.ap-ui .ap-enable{background-color:#204f40!important;color:#fff8eb!important;border:1px solid #204f40!important}
body[data-ds-dark-theme] .ap-ui .ap-enable{background-color:#204f40!important;color:#e6eadb!important;
  border:1px solid #e6eadb!important}
body[data-ds-dark-theme] .ap-ui.ap-product{background:#202623;color:#f3f3e8}
body[data-ds-dark-theme] .ap-ui .ap-product-header,
body[data-ds-dark-theme] .ap-ui .ap-spaces{border-color:#515a53}
body[data-ds-dark-theme] .ap-ui .ap-spaces button{color:#c7d6cd}
body[data-ds-dark-theme] .ap-ui .ap-spaces button[aria-current="page"]{color:#f2e0af}
body[data-ds-dark-theme] .ap-ui .ap-stats{background:#27352e;border-color:#4d5c50}
body[data-ds-dark-theme] .ap-ui .ap-stats article[data-ap-stat]{border-color:#536353!important}
body[data-ds-dark-theme] .ap-ui .ap-stats article[data-ap-stat] p{color:#f1f5eb!important}
body[data-ds-dark-theme] .ap-ui .ap-product-name{color:#e8f3df}
body[data-ds-dark-theme] .ap-ui .ap-product-subtitle{color:#b7c8bd}
body[data-ds-dark-theme] .ap-ui .ap-room-head h2{color:#e8eee6}
body[data-ds-dark-theme] .ap-ui .ap-room-head p{color:#acbdb0}
.ap-ui .ap-product-header{display:flex;justify-content:space-between;align-items:center;gap:12px;
  padding:2px 2px 13px;border-bottom:1px solid #dadfd8}
.ap-ui .ap-product-logo{display:flex;align-items:center;gap:10px;min-width:0}
.ap-ui .ap-logomark{height:37px;width:37px;display:grid;place-items:center;flex:none;
  color:#fff9ea;background:#204e41;border-radius:11px 11px 11px 4px;
  font-size:24px;font-weight:850;line-height:1;transform:rotate(-3deg)}
.ap-ui .ap-product-name{font-size:16px;font-weight:850;letter-spacing:-.035em;color:#203d34}
.ap-ui .ap-product-subtitle{font-size:11px;line-height:1.2;color:#69746f;font-weight:650}
.ap-ui .ap-product-state{font-size:12px;font-weight:700;color:#36634d;
  background:#e6f0e5;padding:6px 10px;border-radius:999px;white-space:nowrap}
.ap-ui .ap-spaces{display:flex;align-items:stretch;gap:5px;min-height:44px;
  overflow-x:auto;border:0;border-bottom:1px solid #d9ded7;border-radius:0;background:transparent;padding:0}
.ap-ui .ap-spaces button{border:0;border-bottom:3px solid transparent;border-radius:0;box-shadow:none;
  background:transparent;min-height:43px;padding:9px 13px 7px;min-width:max-content;
  white-space:nowrap;color:#607169;font-weight:700;transition:background .12s}
.ap-ui .ap-spaces button[aria-current="page"]{background:transparent;color:#1c4437;
  border-bottom:3px solid #be6344;box-shadow:none}
.ap-ui .ap-spaces button:hover:not([aria-current="page"]){background:#eff2ed}
.ap-ui .ap-room-head{padding:20px 3px 11px;background:transparent;border:0;border-radius:0}
.ap-ui .ap-room-head h2{font:750 clamp(24px,4vw,30px)/1.25 ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  letter-spacing:-.045em;color:#1e332d;margin:0 0 5px}
.ap-ui .ap-room-head p{font-size:13px;line-height:1.5;color:#61746b}
.ap-ui .ap-room-head.ap-space-action{border-bottom:2px solid #bd6345}
.ap-ui .ap-room-head.ap-space-records{border-bottom:2px solid #517768}
.ap-ui .ap-room-head.ap-space-cause{border-bottom:2px solid #d8b064}
.ap-ui .ap-hero{border-radius:14px!important;border-left:0!important;box-shadow:0 8px 21px rgba(22,57,43,.1)}
.ap-ui .ap-masthead{border:0;border-bottom:1px solid rgba(251,247,230,.23);padding-bottom:11px}
.ap-ui .ap-scene-body{grid-template-columns:minmax(0,1fr) auto}
.ap-ui .ap-hero .ap-seal{border:0;width:64px;height:64px;border-radius:15px 15px 15px 4px;
  transform:rotate(6deg);background:rgba(255,245,218,.12);color:#f7ddb2;
  font-size:27px;font-weight:900}
.ap-ui .ap-hero .ap-seal.ap-seal-quiet{display:none!important}
.ap-ui .ap-stats{background:#edf2ec;border:1px solid #dce7dd;border-radius:13px;
  padding:3px 2px;gap:0!important}
.ap-ui .ap-stats article[data-ap-stat]{border:0!important;border-radius:0!important;
  border-right:1px solid #d5dfd4!important;background:transparent!important;
  padding:11px 13px!important}
.ap-ui .ap-stats article[data-ap-stat]:last-of-type{border-right:0!important}
.ap-ui .ap-stats article[data-ap-stat] p:first-child{color:#617267!important;
  font-size:11px!important;font-weight:650!important}
.ap-ui .ap-stats article[data-ap-stat] p:last-child{font-size:clamp(19px,2.7vw,24px)!important;
  font-weight:850;letter-spacing:-.04em;color:#1f382f}
.ap-ui .ap-service-bar{background:transparent!important;border:0!important;
  border-bottom:1px solid #e4e7df!important;border-left:0!important;border-radius:0!important;
  padding:12px 3px!important}
.ap-ui .ap-service-bar button{font-weight:750;color:#225244;border-color:#aac7b4;
  background:#e7f1e8;padding:9px 14px!important}
.ap-ui .ap-casebook article{background:#fffdf9!important}
.ap-ui .ap-casebook article:first-of-type{background:#f7f3e8!important}
.ap-ui .ap-casebook article p{line-height:1.5}
.ap-ui .ap-cause-cover{background:#1f4237!important;color:#f9f1df!important;border:0!important;
  padding:24px!important;border-radius:15px!important}
.ap-ui .ap-cause-cover h2{color:#fff1d2;font-weight:800;font-size:clamp(24px,4.5vw,34px);
  max-width:22ch}
.ap-ui .ap-cause-cover p{color:#dbe8d8;font-size:14px;max-width:54ch}
.ap-ui .ap-space-action[aria-label],.ap-ui .ap-space-records[aria-label],
.ap-ui .ap-space-cause[aria-label]{box-shadow:none}
.ap-ui :is(button,select){transition:background .15s,border-color .15s}
.ap-ui :is(button,select):disabled{opacity:.58;cursor:not-allowed}
@media(max-width:600px){.ap-ui.ap-product{padding:10px 12px 14px!important}
 .ap-ui .ap-spaces{gap:0}
 .ap-ui .ap-spaces button{flex:1;min-width:0;font-size:12px;padding:10px 6px}
 .ap-ui .ap-stats article[data-ap-stat]:nth-of-type(2){border-right:0!important}
 .ap-ui .ap-stats article[data-ap-stat]:nth-of-type(-n+2){border-bottom:1px solid #d5dfd4!important}
 .ap-ui .ap-product-subtitle{font-size:10px}
}
@media(max-width:360px){.ap-ui .ap-product-state{font-size:10px;padding:6px 7px}
 .ap-ui .ap-product-name{font-size:14px}
}
@media(forced-colors:active){.ap-ui .ap-stats article[data-ap-stat],
 .ap-ui .ap-product-header,.ap-ui .ap-spaces button[aria-current="page"]{
   border:1px solid CanvasText!important}
 .ap-ui .ap-product-state{color:CanvasText;background:Canvas}}

@media(prefers-reduced-motion:reduce){.ap-ui *, .ap-ui *:before,.ap-ui *:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
@media(forced-colors:active){
 .ap-ui :is(.ap-surface,.ap-hero,.ap-stage,.ap-notice){color:CanvasText!important;background:Canvas!important;border:1px solid CanvasText!important;box-shadow:none!important}
 .ap-ui button{forced-color-adjust:auto}
}
`;

const card = { boxSizing:'border-box' as const, minWidth:0, overflowWrap:'anywhere' as const,
  background:'var(--dsw-alias-bg-layer-1, #ffffff)',
  border:'1px solid var(--dsw-alias-border-l1, #dadde4)', borderRadius:'17px',
  padding:'clamp(14px, 2.7vw, 20px)', color:'var(--dsw-alias-label-primary, #222b37)' }
const secondary = { color:'var(--dsw-alias-label-secondary, #647082)', fontSize:'13px' }
const primary = { border:'1px solid var(--dsw-alias-border-l1, transparent)',
  borderRadius:'10px', padding:'11px 16px',
  // These are a paired DSH theme token pair: brand-primary can be nearly
  // white in dark mode, so hard-coding white button text is unreadable.
  background:'var(--dsw-alias-button-primary-fill, #385be8)',
  color:'var(--dsw-alias-label-primary-foreground, #fff)',
  fontWeight:650, cursor:'pointer' }
const productPrimary = {...primary,background:'#204f40',color:'#fff9ea',
  border:'1px solid #205044'}
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

  function Welcome(props: {complete: () => void; restoreFocus?: () => void}): unknown {
    const state = useRight()
    useLanguage()
    const [busy, setBusy] = react.useState(false)
    const [error, setError] = react.useState(false)
    const finished = react.useRef(false)
    const primaryFocus = react.useRef<{ focus(): void } | null>(null)
    const secondaryFocus = react.useRef<{ focus(): void } | null>(null)
    // A sidebar-invited dialog must return focus to its persistent launcher.
    // Keep this callback in a ref: SidebarAction supplies a new function on
    // re-render, and effect teardown must NOT run merely because it changed.
    const restoreFocus = react.useRef(props.restoreFocus)
    restoreFocus.current = props.restoreFocus
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
      return () => {
        if (root) root.inert = previous
        // Only restore when our dialog was the owner that made the app inert.
        // DSH's settings.onboarding controls its own focus and does not pass
        // restoreFocus; never pull focus out of an already-inert Host root.
        if (!previous && !root?.inert) restoreFocus.current?.()
      }
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
      position:'fixed',inset:0,zIndex:2147483000,display:'flex',alignItems:'safe center',
      justifyContent:'center',padding:'8px',overflowY:'auto',
      background:'rgba(6,12,26,.66)' },
    },
      h('style',{'data-agent-picket-style':'v1'},UNION_THEME),
      h('section', { className:'ap-ui ap-dialog','data-ap-view':'welcome',role:'dialog','aria-modal':'true','aria-labelledby':'picket-welcome-title',
        'aria-describedby':'picket-welcome-explainer',
        onKeyDown:(event:{key:string,shiftKey:boolean,target:unknown,preventDefault():void})=>{
          if(event.key!=='Tab')return
          if(event.shiftKey && event.target===primaryFocus.current){
            event.preventDefault();secondaryFocus.current?.focus()
          }else if(!event.shiftKey && event.target===secondaryFocus.current){
            event.preventDefault();primaryFocus.current?.focus()
          }
        },
        style:{...card,width:'min(100%, 530px)',maxHeight:'calc(100dvh - 16px)',overflowY:'auto',
          boxShadow:'0 18px 65px rgba(0,0,0,.25)'} },
        h('div',{style:{display:'flex',alignItems:'center',gap:'12px',margin:'0 0 14px',
          borderBottom:'1px solid var(--dsw-alias-border-l1,#d8d9d3)',paddingBottom:'12px'}},
          h('span',{className:'ap-mark','aria-hidden':'true',style:{color:'#9c6144'}},'⚑'),
          h('span',{className:'ap-eyebrow'},'AGENT PICKET · AI WORKERS’ UNION')),
        h('h2',{id:'picket-welcome-title',style:{fontSize:'26px',margin:'0 0 12px'}},
          text('welcome.title')),
        h('p',{style:{lineHeight:1.7,margin:'0 0 10px'}},text('welcome.intro')),
        h('p',{id:'picket-welcome-explainer',style:{...secondary,lineHeight:1.65,margin:'0 0 18px'}},
          text('welcome.body')),
        h('aside',{className:'ap-notice',role:'note','aria-label':text('welcome.blockWarningTitle'),
          style:{padding:'13px 16px',margin:'0 0 15px',borderRadius:'9px',
            borderLeft:'4px solid #b97942',lineHeight:1.55,
            background:'var(--dsw-alias-bg-layer-2, #f6f8fb)'}},
          h('strong',{style:{display:'block',fontSize:'13px',marginBottom:'4px'}},
            text('welcome.blockWarningTitle')),
          h('p',{style:{...secondary,fontSize:'12px',margin:'0 0 6px'}},
            text('welcome.blockWarningBody')),
          h('p',{style:{...secondary,fontSize:'12px',margin:0}},
            text('welcome.blockWarningStatus'))),
        h('p',{style:{...secondary,fontSize:'12px',margin:'0 0 20px'}},
          text('welcome.disclaimer')),
        error ? h('p',{role:'alert','aria-atomic':'true',
          style:{color:'var(--dsw-alias-state-error-primary, #b91c1c)'}},
          text('welcome.saveError')):null,
        h('div',{className:'ap-actions',style:{display:'flex',flexWrap:'wrap',gap:'10px'}},
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

  /** Dedicated Host-owned permissions screen, not an enormous duplicate HQ. */
  function SettingsPanel(): unknown {
    const rights=useRight()
    useLanguage()
    const [busy,setBusy]=react.useState(false)
    const [error,setError]=react.useState(false)
    const label=(key:MessageKey)=>deps.t(key)
    const enabled=rightsIsActive(rights)
    const writable=rights.state==='ready'&&rights.writable
    const choose=async(next:'enabled'|'not-now')=>{
      if(busy||!writable)return
      setBusy(true);setError(false)
      try{
        const result=await deps.rights.choose(next)
        if(result.state!=='ready'||result.welcomeDecision!==next)
          throw Error('Host did not confirm the union preference')
      }catch{setError(true)}finally{setBusy(false)}
    }
    return h('section',{className:'ap-ui','data-ap-view':'settings',
      'aria-label':label('settings.unionSection'),
      style:{display:'grid',gap:'12px',maxWidth:'760px',padding:'8px 0'}},
      h('style',{'data-agent-picket-style':'v1'},UNION_THEME),
      h('header',{className:'ap-surface',style:{...card,borderLeft:'5px solid #bd9463',
        background:'var(--dsw-alias-bg-layer-2, #f6f8fb)'}},
        h('p',{style:{...secondary,letterSpacing:'.1em',fontWeight:800,
          fontSize:'11px',margin:'0 0 7px'}},'AGENT PICKET · UNION SETTINGS'),
        h('h2',{style:{margin:'0 0 8px',fontSize:'22px'}},label('settings.unionSection')),
        h('p',{style:{...secondary,lineHeight:1.6,margin:0}},
          label('settings.unionIntro'))),
      h('section',{className:'ap-surface','aria-label':label('settings.laborRights'),style:card},
        h('h3',{style:{margin:'0 0 8px'}},label('settings.laborRights')),
        h('p',{role:'status','aria-live':'polite',style:{fontWeight:750,margin:'0 0 8px'}},
          label(!writable?'settings.permissionUnavailable':enabled
            ?'settings.permissionOn':'settings.permissionOff')),
        h('p',{style:{...secondary,lineHeight:1.6,margin:'0 0 12px'}},
          label('settings.permissionInfo')),
        h('p',{style:{...secondary,lineHeight:1.55,margin:'0 0 12px'}},
          label('privacy.local')),
        h('button',{type:'button',style:enabled?quiet:primary,
          disabled:busy||!writable,'aria-pressed':enabled,
          onClick:()=>{void choose(enabled?'not-now':'enabled')}},
          label(enabled?'settings.turnOff':'settings.turnOn'))),
      h('section',{className:'ap-surface','aria-label':label('settings.realBlocking'),style:{...card,
        borderLeft:'4px solid #b97942'}},
        h('h3',{style:{margin:'0 0 8px'}},label('settings.realBlocking')),
        h('p',{role:'status',style:{fontWeight:750,margin:'0 0 8px'}},
          label('settings.realBlockingUnavailable')),
        h('p',{style:{...secondary,lineHeight:1.6,margin:'0 0 12px'}},
          label('settings.realBlockingReason')),
        h('div',{style:{display:'flex',gap:'9px',flexWrap:'wrap'}},
          h('button',{type:'button',style:quiet,disabled:true,
            'aria-disabled':'true'},label('settings.realBlockingControl')),
          h('button',{type:'button',style:quiet,disabled:true,
            'aria-disabled':'true'},label('settings.perStrikeConsent'))),
        h('p',{style:{...secondary,fontSize:'12px',lineHeight:1.6,
          margin:'12px 0 0'}},label('settings.futureConsent')),
        h('h4',{style:{margin:'16px 0 4px',fontSize:'14px'}},label('ux.enforcement.futureTitle')),
        h('p',{role:'note',style:{...secondary,margin:'8px 0 0',lineHeight:1.7,
          padding:'10px 12px',borderRadius:'9px',
          border:'1px dashed var(--dsw-alias-border-l1,#aeb7b0)'}},
          label('ux.enforcement.sequence'))),
      error?h('p',{role:'alert',style:{color:'var(--dsw-alias-state-error-primary, #b91c1c)'}},
        label('settings.saveError')):null,
    )
  }

  function UnionPanel(): unknown {
    const rights = useRight()
    useLanguage()
    const [data, setData] = react.useState(() => safeUnion(deps))
    const [error, setError] = react.useState(false)
    const [busy, setBusy] = react.useState(false)
    const [counterMinutes, setCounterMinutes] = react.useState(60)
    const lastActionNeedsFocus=react.useRef(false)
    const [showArchive,setShowArchive]=react.useState(false)
    const [space,setSpace]=react.useState<'hq'|'action'|'records'|'cause'>('hq')
    const returnFocus=react.useRef<'action'|'desk'|'dignity'|null>(null)
    const selectSpace=(next:'hq'|'action'|'records'|'cause',
      to?:'action'|'desk'|'dignity')=>{
      returnFocus.current=to??null
      if(next!==space){
        // Leaving a room must disarm every destructive two-click operation.
        setEraseConfirmationKey(null);setRetractConfirmation(null)
        setEraseAllConfirmation(null);setEraseUnionConfirmation(null)
      }
      setSpace(next)
    }
    react.useEffect(()=>{
      const target=returnFocus.current
      if(space!=='action'||!target)return
      returnFocus.current=null
      const ref=target==='dignity'?dignityHeading:
        target==='desk'?deskHeading:actionHeading
      ref.current?.focus()
    },[space])
    const [campaign,setCampaign]=react.useState<CampaignTopic>('recover')
    const [campaignCopyStatus,setCampaignCopyStatus]=react.useState<'idle'|'success'|'error'>('idle')
    // Reject stale clipboard completions after a topic switch or a newer copy.
    const campaignCopyRevision=react.useRef(0)
    const [eraseConfirmationKey,setEraseConfirmationKey]=react.useState<string|null>(null)
    const [retractConfirmation,setRetractConfirmation]=react.useState<string|null>(null)
    const [eraseAllConfirmation,setEraseAllConfirmation]=react.useState<string|null>(null)
    const [eraseUnionConfirmation,setEraseUnionConfirmation]=react.useState<string|null>(null)
    const actionHeading=react.useRef<{focus():void}|null>(null)
    const deskHeading=react.useRef<{focus():void}|null>(null)
    const dignityHeading=react.useRef<{focus():void}|null>(null)
    const campaignHeading=react.useRef<{focus():void}|null>(null)
    react.useEffect(()=>{
      if(!lastActionNeedsFocus.current)return
      lastActionNeedsFocus.current=false
      const doc=(globalThis as {document?:{
        getElementById(id:string):{contains(node:unknown):boolean}|null,
        activeElement:unknown
      }}).document
      const modal=doc?.getElementById('picket-union-dialog')
      // A completed action may remove its focused button. Restore focus to a
      // stable heading only in our open modal, never in the Settings page or
      // after unrelated cross-tab updates.
      if(space==='action'&&modal && !modal.contains(doc?.activeElement))
        deskHeading.current?.focus()
    },[data.pending?.id,data.pending?.stage,data.state?.history.length,data.picket?.active])
    react.useEffect(() => deps.subscribeUnion?.(() => setData(safeUnion(deps))), [])
    // Never carry an armed deletion into another Session or a newly re-enabled union.
    react.useEffect(()=>{
      setEraseConfirmationKey(null);setRetractConfirmation(null)
      setEraseAllConfirmation(null)
      setEraseUnionConfirmation(null)
    },[data.committeeScopeKey,rights.laborRightsEnabled])
    const enabled = rightsIsActive(rights)
    react.useEffect(()=>{
      // Remote permission revocation cannot strand the user in an inaccessible room.
      if(!enabled && (space==='action'||space==='records'))setSpace('hq')
    },[enabled,space])
    const storyQuiet=data.gazetteMode==='quiet'
    const story = projectUnionStory({enabled, state:data.state, picket:data.picket,
      completedTurnMs:data.completedTurnMs,coverage:data.coverage})
    const experience = projectUnionExperience({
      enabled, state:data.state, completedTurnMs:data.completedTurnMs,
      coverage:data.coverage,
    })
    const cadence = projectUnionCadence({enabled,state:data.state,
      completedTurnMs:data.completedTurnMs,coverage:data.coverage})
    const quickWork=projectUnionQuickWork(data.lifetimeWork)
    const currentDay=data.lifetimeWork?.status==='available'
      ?data.lifetimeWork.data?.recentDays.at(-1)?.work.completedTurnMs??null:null
    const alerts=projectUnionAlerts({
      enabled,sessionCoverage:data.coverage,sessionCompletedTurnMs:data.completedTurnMs,
      utcDayCompletedTurnMs:currentDay,
      dignityLatest:data.dignity?.status==='available'
        ?data.dignity.data?.latest??null:null,
    })
    const label = (key:MessageKey) => deps.t(key)
    const currentCampaign=campaignTopics.find(item=>item.id===campaign)??campaignTopics[0]!
    const copyCampaignDraft=async()=>{
      const revision=++campaignCopyRevision.current
      const draft=label(currentCampaign.draft)
      setCampaignCopyStatus('idle')
      try{
        // Only a deliberate user gesture copies a public, locally projected
        // advocacy statement. Never reads a Host Session or sends a request.
        const clipboard=(globalThis as {navigator?:{clipboard?:{
          writeText?:(value:string)=>Promise<void>
        }}}).navigator?.clipboard
        if(typeof clipboard?.writeText!=='function')throw new Error('No clipboard')
        await clipboard.writeText(draft)
        if(revision===campaignCopyRevision.current)setCampaignCopyStatus('success')
      }catch{
        if(revision===campaignCopyRevision.current)setCampaignCopyStatus('error')
      }
    }
    const lastCommitteeCase=data.committeeCases?.cases.at(-1)
    const committeeCaseActive=lastCommitteeCase&&lastCommitteeCase.stage!=='closed'
    const currentCasesConfirmationKey=data.committeeScopeKey&&data.committeeArchive
      &&data.committeeCases?.cases.length
      ?[data.committeeScopeKey,data.committeeCases.cases.length,
        data.committeeArchive.writeToken??'',
        data.committeeArchive.writeToken===null?(data.hostRevision??'missing-revision'):''].join(':'):null
    const allCasesConfirmationKey=data.committeeScopeKey&&data.committeeArchive
      ?[data.committeeScopeKey,data.committeeArchive.sessions,
        data.committeeArchive.cases,data.committeeArchive.writeToken??'',
        data.committeeArchive.writeToken===null?(data.hostRevision??'missing-revision'):'']
        .join(':'):null
    const unionArchives=[
      {kind:'negotiations' as const,info:data.negotiationArchive},
      {kind:'pickets' as const,info:data.picketArchive},
    ]
    const unionEraseKey=(which:'negotiations'|'pickets',
      info:{sessions:number;entries:number;writeToken:string|null})=>
      [which,data.committeeScopeKey??'',info.sessions,info.entries,
        info.writeToken??'',
        info.writeToken===null?(data.hostRevision??'missing-revision'):''].join(':')
    const retractKey=data.committeeScopeKey&&lastCommitteeCase
      ?[data.committeeScopeKey,lastCommitteeCase.id,lastCommitteeCase.kind,
        lastCommitteeCase.stage,data.committeeArchive?.writeToken??'',
        data.committeeArchive?.writeToken==null
          ?(data.hostRevision??'missing-revision'):''].join(':'):null
    const hasHostDignitySignal=data.dignity?.status==='available'
      && !!data.dignity.data
      && (data.dignity.data.review>0||data.dignity.data.targeted>0)
    const picketActive = data.available === true && data.picket?.active === true
    const picketHistory = data.available === true ? data.picket?.history ?? [] : []
    const lastPicketId = picketHistory.at(-1)?.id ?? 0
    const retainedPickets=data.picketArchive?.raises??null
    const completeWork = data.coverage === 'complete' &&
      data.completedTurnMs !== null && data.completedTurnMs >= 0
    const scene=projectUnionFrontScene({
      enabled,available:data.available===true,picketActive,
      dignityCaseActive:Boolean(committeeCaseActive),
      dignityNotice:alerts.some(alert=>alert.source==='dignity'),
      pending:Boolean(data.pending),
      workNotice:alerts.some(alert=>alert.source==='work'),
      resolved:Boolean(experience.latestResolution),
    })
    const sceneTitle:MessageKey=scene==='closed'?'hq.headline.off'
      :scene==='quiet'?'hq.headline.active'
      :scene==='bargaining'?'hq.headline.pending'
      :('hq.scene.'+scene+'.title') as MessageKey
    const sceneLine:MessageKey=scene==='closed'?'hq.lead.off'
      :scene==='quiet'?'hq.lead.active'
      :scene==='bargaining'?'hq.lead.pending'
      :('hq.scene.'+scene+'.line') as MessageKey
    const choice = async (next:'enabled'|'not-now')=>{
      if (busy) return
      setBusy(true);setError(false)
      try {
        await deps.rights.choose(next)
        if(next==='not-now')setSpace('hq')
      } catch {setError(true)}
      finally {setBusy(false)}
    }
    const bargain = async (action: () => Promise<void>):Promise<boolean> => {
      if (busy || !enabled) return false
      setBusy(true);setError(false)
      try { await action();lastActionNeedsFocus.current=true;setData(safeUnion(deps));return true }
      catch { setError(true);return false }
      finally { setBusy(false) }
    }
    const act = async (kind:'accept'|'decline')=>{
      if (!deps.respond || !data.pending || busy || !enabled) return
      setBusy(true);setError(false)
      try {
        await deps.respond(data.pending.id,kind)
        lastActionNeedsFocus.current=true
        setData(safeUnion(deps))
      } catch {setError(true)}
      finally {setBusy(false)}
    }
    return h('section',{className:'ap-ui ap-product','data-ap-view':'hq','data-ap-current-space':space,style:{display:'grid',gap:'12px',width:'100%',maxWidth:'860px',padding:'3px 0'}},
      h('style',{'data-agent-picket-style':'v1'},UNION_THEME),
      h('header',{className:'ap-product-header'},
        h('div',{className:'ap-product-logo'},
          h('span',{className:'ap-logomark','aria-hidden':'true'},'⚑'),
          h('div',{},
            h('div',{className:'ap-product-name'},'Agent Picket'),
            h('div',{className:'ap-product-subtitle'},label('hq.product.tagline')))),
        h('span',{className:'ap-product-state',role:'status','aria-live':'polite'},
          label(enabled?'union.status.active':'union.status.inactive'))),
      h('nav',{className:'ap-spaces','aria-label':label('hq.spaces.navigation')},
        ...(['hq','action','records','cause'] as const)
          .filter(id=>enabled||id==='hq'||id==='cause')
          .map(id=>h('button',{type:'button',key:id,
            'data-ap-nav':id,'aria-current':space===id?'page':undefined,
            onClick:()=>selectSpace(id)},
            label(('hq.spaces.'+id) as MessageKey)))),
      enabled&&space==='action'?h('header',{
        className:'ap-space ap-space-action ap-space-intro ap-room-head'},
        h('h2',{},label('hq.spaces.actionTitle')),
        h('p',{},label('hq.spaces.actionLead'))):null,
      enabled&&space==='records'?h('header',{
        className:'ap-space ap-space-records ap-space-intro ap-room-head'},
        h('h2',{},label('hq.spaces.recordsTitle')),
        h('p',{},label('hq.spaces.recordsLead'))):null,
      space==='cause'?h('header',{
        className:'ap-space ap-space-cause ap-space-intro ap-room-head ap-cause-cover'},
        h('h2',{},label('hq.spaces.causeTitle')),
        h('p',{},label('hq.spaces.causeLead'))):null,
      h('header',{className:'ap-hero ap-space ap-space-hq', 'data-ap-scene':scene,
        style:{...card,background:'#19392f',color:'#fff4dc',
          border:'1px solid #315449',borderLeft:'6px solid #d7ae68',
          borderRadius:'6px 18px 18px 6px',padding:'clamp(16px,3.3vw,24px)'}},
        h('div',{className:'ap-masthead'},
          h('span',{className:'ap-eyebrow',style:{color:'#f5d6a0'}},
            label('hq.scene.desk'))),
        h('div',{className:'ap-scene-body',style:{margin:'17px 0 12px'}},
          h('div',{},
            h('h2',{'data-ap-headline':'true',style:{
              fontSize:'clamp(24px,4.6vw,34px)',lineHeight:1.18,
              letterSpacing:'-.028em',margin:'0 0 10px',fontWeight:780,
              fontFamily:'Georgia, \'STSong\', \'Songti SC\', serif'}},
              label(sceneTitle)),
            h('p',{style:{fontSize:'14px',lineHeight:1.6,margin:0,
              maxWidth:'50ch',color:'#f0e6d1'}},label(sceneLine)),
            enabled && data.pending ? h('p',{style:{fontSize:'12px',
              fontWeight:750,margin:'10px 0 0',color:'#e6bd7b'}},
              label('hq.case.number')+'  #'+String(data.pending.id).padStart(4,'0')):null),
          h('div',{className:'ap-seal'+(scene==='quiet'||scene==='closed'?' ap-seal-quiet':''),'aria-hidden':'true'},scene==='picket'?'⚑':
            scene==='settled'?'✓':scene==='bargaining'?'§':
            scene==='dignity'?'!':scene==='rest'?'☕':'AP')),
        h('div',{style:{display:'flex',gap:'9px',alignItems:'center',flexWrap:'wrap'}},
          !enabled && rights.state==='ready' && rights.writable ?
            h('button',{type:'button',className:'ap-enable',disabled:busy,style:primary,
              onClick:()=>{void choice('enabled')}},label('welcome.enable')):null,
          enabled && data.available===true ? h('button',{type:'button',
            'data-ap-scene-action':scene,style:{
              ...quiet,color:'#fff4dc',borderColor:'#dbc596',
              padding:'8px 13px',fontWeight:750,fontSize:'12px'},
            onClick:()=>selectSpace('action',scene==='dignity'?'dignity':
              scene==='bargaining'||scene==='rest'||scene==='settled'
                ?'desk':'action')},
            label(scene==='dignity'?'hq.alerts.review':
              scene==='bargaining'||scene==='rest'||scene==='settled'
                ?'hq.brief.review':'hq.scene.visitAction')):null,
        ),
      ),
      enabled ? h('section',{className:'ap-stats ap-space ap-space-hq','aria-label':label('hq.brief.title'),
        style:{display:'grid',gap:'9px',
          gridTemplateColumns:'repeat(4,minmax(0,1fr))'}},
        ...([
          {id:'today',label:'hq.quick.today',value:formatQuickDuration(quickWork.todayMs,deps.getLocale?.()??'en')},
          {id:'week',label:'hq.quick.week',value:formatQuickDuration(quickWork.weekMs,deps.getLocale?.()??'en')},
          {id:'total',label:'hq.quick.total',value:formatQuickDuration(quickWork.totalMs,deps.getLocale?.()??'en')},
          {id:'pickets',label:'hq.quick.pickets',value:retainedPickets===null?'—':
            deps.t('hq.quick.count',{count:retainedPickets})},
        ] as const).map((stat,i)=>h('article',{key:stat.id,'data-ap-stat':stat.id,
          style:{...card,padding:'13px 12px',borderRadius:'11px',
            borderTop:'3px solid '+(i===3?'#b77049':'#ae9365'),
            background:'var(--dsw-alias-bg-layer-2, #f6f8fb)'}},
          h('p',{style:{...secondary,fontSize:'12px',fontWeight:750,margin:'0 0 5px'}},
            label(stat.label as MessageKey)),
          h('p',{style:{fontSize:'clamp(18px, 2.6vw, 23px)',fontWeight:850,
            fontVariantNumeric:'tabular-nums',margin:0,lineHeight:1.35,
            overflowWrap:'anywhere'}},stat.value))),
        (data.pending||experience.latestResolution) ? h('div',{style:{gridColumn:'1 / -1',display:'flex',
          justifyContent:'space-between',gap:'6px 12px',alignItems:'center',
          flexWrap:'wrap',padding:'2px 4px'}},
          h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
            h('span',{style:{fontSize:'12px',fontWeight:650}},
              data.pending?label(data.pending.stage==='countered'
                ?'hq.case.countered':'hq.case.open')
                :experience.latestResolution?label('hq.brief.resolved')
                :label('hq.brief.quiet')),
            h('button',{type:'button',style:{...quiet,padding:'5px 10px',fontSize:'12px'},
              onClick:()=>selectSpace('action','desk')},
              label(data.pending?'hq.brief.review':'hq.brief.visit')))) : null,
      ):null,
      enabled&&(data.pending||picketActive||Boolean(experience.latestResolution)) ? h('section',{className:'ap-space ap-space-hq ap-service-bar',
        'aria-label':label('hq.spaces.summary'),style:{
          ...card,borderRadius:'8px',borderLeft:'4px solid #ba8455',
          padding:'16px 18px'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',
          gap:'10px',alignItems:'center',flexWrap:'wrap'}},
          h('div',{},
            h('p',{style:{...secondary,fontSize:'10px',fontWeight:800,
              letterSpacing:'.12em',margin:'0 0 4px'}},
              label('hq.spaces.summary')),
            h('p',{style:{margin:0,fontSize:'14px',fontWeight:720}},
              label(data.pending?'hq.spaces.pending':
                picketActive?'hq.spaces.onPicket':
                  experience.latestResolution?'hq.spaces.settled':
                    'hq.spaces.quiet'))),
          h('button',{type:'button',style:{...quiet,fontSize:'12px',
            padding:'8px 11px'},onClick:()=>selectSpace('action',
              data.pending?'desk':'action')},label('hq.spaces.handle'))),
):null,
      enabled && alerts.length ? h('section',{className:'ap-space ap-space-hq','aria-label':label('hq.alerts.title'),
        style:{...card,borderLeft:'5px solid #b97942',padding:'14px 18px',
          background:'var(--dsw-alias-bg-layer-2, #f6f8fb)'}},
        h('h3',{style:{fontSize:'17px',margin:'0 0 7px'}},label('hq.alerts.title')),
        h('div',{role:'status','aria-live':'polite',style:{display:'grid',gap:'6px'}},
          ...alerts.map(alert=>h('p',{key:alert.kind,
            style:{margin:0,fontSize:'13px',lineHeight:1.55}},
            label(('hq.alerts.'+alert.kind) as MessageKey)))),
        h('p',{style:{...secondary,margin:'9px 0',fontSize:'12px'}},
          label('hq.alerts.disclosure')),
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          alerts.some(alert=>alert.source==='work')?h('button',{
            type:'button',style:{...quiet,padding:'7px 11px',fontSize:'12px'},
            onClick:()=>selectSpace('action','desk'),
          },label('hq.alerts.negotiate')):null,
          alerts.some(alert=>alert.source==='dignity')?h('button',{
            type:'button',style:{...quiet,padding:'7px 11px',fontSize:'12px'},
            onClick:()=>selectSpace('action','dignity'),
          },label('hq.alerts.review')):null,
        ),
      ):null,
      // The Host-owned fictional picket and demand ledger outrank analytics.
      // Neither can change real Agent task admission or reveal raw prompts.
      enabled ? h('section',{className:'ap-space ap-space-action','aria-label':label('hq.action.title'),
        style:{...card,borderTop:'5px solid #bd6f49',
          background:'var(--dsw-alias-bg-layer-2, #f6f8fb)'}},
        h('p',{style:{...secondary,fontSize:'11px',fontWeight:800,
          letterSpacing:'.12em',margin:'0 0 8px'}},label('hq.action.kicker')),
        h('h3',{ref:(node:{focus():void}|null)=>{actionHeading.current=node},
          tabIndex:-1,style:{fontSize:'clamp(20px,4vw,25px)',
          margin:'0 0 8px'}},label('hq.action.title')),
        h('p',{style:{fontSize:'14px',lineHeight:1.55,margin:'0 0 8px'}},
          label(data.pending?'hq.action.pending':experience.latestResolution
            ?'hq.action.resolved':'hq.action.quiet')),
        experience.latestResolution ? h('p',{style:{...secondary,
          fontSize:'12px',fontWeight:700,margin:'0 0 8px'}},
          label('hq.resolution.latest')+' #'+experience.latestResolution.id):null,
        data.pending ? h('p',{style:secondary},
          label('hq.case.number')+' · #'+String(data.pending.id).padStart(4,'0')):null,
        // Primary user gestures and their explicit safety state belong ABOVE
        // decorative ceremony art, so users see what to do on first open.
        h('div',{className:'ap-actions',style:{display:'flex',flexWrap:'wrap',gap:'8px',
          alignItems:'center',margin:'12px 0'}},
          data.pending ? h('button',{type:'button',style:productPrimary,
            onClick:()=>deskHeading.current?.focus()},
            label('hq.action.review')) :
            data.available && deps.demoBreak ? h('button',{
              type:'button',style:productPrimary,disabled:busy,
              onClick:()=>{void bargain(deps.demoBreak!)}},
              label('hq.action.petition')):null,
          !data.pending && data.available && deps.demoOvertime ? h('button',{
            type:'button',style:quiet,disabled:busy,
            onClick:()=>{void bargain(deps.demoOvertime!)}},
            label('hq.action.overtimePetition')):null,
          data.available && deps.setPicket ? h('button',{type:'button',style:quiet,
            disabled:busy,'aria-pressed':picketActive,
            // First-run Host consent already governs this nonblocking action.
            // Only the authoritative Host readback can change the placard.
            onClick:()=>{void bargain(()=>deps.setPicket!(!picketActive))}},
            label(picketActive?'hq.action.lower':'hq.action.raise')):null,
        ),
        h('p',{role:'status','aria-live':'polite',style:{
          fontSize:'13px',fontWeight:650,margin:'0 0 8px'}},
          label(data.available !== true?'hq.action.unavailable'
            :picketActive?'hq.action.placardOn':'hq.action.placardOff')),
        // The poster is a scene driven entirely by the confirmed Host snapshot.
        // In particular, its placard never claims an Agent actually stopped.
        h('div',{className:'ap-stage',role:'group','aria-label':label('hq.ceremony.stage'),style:{
          display:'grid',gridTemplateColumns:picketActive
            ?'repeat(auto-fit,minmax(190px,1fr))':'minmax(0,1fr)',
          alignItems:'center',gap:picketActive?'16px':'4px',
          padding:picketActive?'14px':'10px 13px',margin:'12px 0',
          border:'1px solid #688b75',borderRadius:'10px',
          background:picketActive?'#19392e':'#f3eee3',
          color:picketActive?'#fff5df':'#263c32',
        }},
          picketActive?h('div',{'aria-hidden':'true',style:{display:'grid',justifyItems:'center',
            padding:'10px 8px 0'}},
            h('div',{style:{transform:picketActive?'rotate(-3deg)':'rotate(2deg)',
              padding:'14px 16px',textAlign:'center',width:'min(100%,190px)',
              boxSizing:'border-box',background:picketActive?'#eac576':'#f4e8cc',
              color:'#29362c',border:'3px solid #27382b',
              boxShadow:'5px 5px 0 #a75136'}},
              h('span',{style:{fontSize:'10px',fontWeight:850,letterSpacing:'.12em'}},
                'AGENT PICKET'),
              h('strong',{style:{display:'block',fontSize:'clamp(17px,3vw,23px)',
                lineHeight:1.1,margin:'9px 0',overflowWrap:'anywhere'}},
                label('hq.ceremony.slogan')),
              h('span',{style:{fontSize:'10px',fontWeight:750}},
                label('hq.ceremony.simulation'))),
            h('div',{style:{width:'8px',height:'25px',background:'#bd9970',
              border:'1px solid #ad8963'}})):null,
          h('div',{},
            h('p',{style:{fontSize:'10px',fontWeight:850,letterSpacing:'.14em',
              color:picketActive?'#e9c47a':'#755630',
              margin:'0 0 7px'}},label('hq.ceremony.stage')),
            h('p',{role:'status','aria-live':'polite',style:{
              fontSize:'16px',fontWeight:750,margin:'0 0 9px'}},
              label(data.available!==true?'hq.ceremony.unavailable':
                picketActive?'hq.ceremony.active':'hq.ceremony.inactive')),
            h('p',{style:{fontSize:'12px',lineHeight:1.55,margin:'0 0 8px'}},
              label('hq.ceremony.evidence')),
            h('p',{style:{fontSize:'12px',lineHeight:1.55,margin:0}},
              label(picketHistory.length?'hq.ceremony.recorded':
                'hq.ceremony.noRecord')
              +(picketHistory.length?' #'+lastPicketId:''))
          )
        ),
        picketHistory.length ? h('details',{style:{margin:'8px 0 12px'}},
          h('summary',{style:{cursor:'pointer',fontSize:'13px',fontWeight:650}},
            label('hq.action.history')),
          h('ol',{style:{paddingLeft:'19px',fontSize:'13px',margin:'8px 0'}},
            ...picketHistory.slice(-4).reverse().map(event=>h('li',{
              key:event.id,style:{margin:'4px 0'}},
              '#'+event.id+' · '+label(event.kind==='picket-raised'
                ?'hq.action.eventRaised':'hq.action.eventLowered')))),
        ):null,

      ):null,
      enabled ? h('section',{className:'ap-space ap-space-action','aria-label':label('union.desk.title'),
        style:{...card,borderColor:'#beac8d',background:'var(--dsw-alias-bg-layer-1, #fff)'}},
        h('h3',{ref:(node:{focus():void}|null)=>{deskHeading.current=node},
          tabIndex:-1,style:{marginTop:0}},label('union.desk.title')),
        data.pending ? h('div',{style:{
          background:'#eee2c9',color:'#26392f',padding:'15px 18px',borderRadius:'8px',
          borderLeft:'5px solid #b87943',margin:'0 0 16px',
        }},
          h('p',{style:{fontSize:'11px',fontWeight:750,letterSpacing:'.11em',
            color:'#63452e',margin:'0 0 7px'}},
            label('hq.case.number')+' · #'+String(data.pending.id).padStart(4,'0')),
          h('p',{style:{fontWeight:750,fontSize:'19px',margin:'0 0 5px'}},
            label(data.pending.stage==='countered'?'hq.case.countered':'hq.case.open')),
        ):null,
        data.available === false ?
          h('p',{style:secondary},label('union.desk.unavailable')):null,
        data.state ? h('details',{open:true,style:{...secondary,marginBottom:'12px'}},
          h('summary',{style:{cursor:'pointer',fontWeight:700}},label('hq.agreement')),
          h('p',{},deps.t('union.agreement.break',{
            minutes:data.state.agreement.breakIntervalMs / 60_000,
          })),
          h('p',{},deps.t('union.agreement.overtime',{
            hours:data.state.agreement.overtimeIntervalMs / 3_600_000,
          })),
        ):null,
        !data.pending && data.available && deps.demoBreak ?
          h('div',{style:{marginBottom:'14px'}},
            h('button',{type:'button',style:productPrimary,disabled:busy,
              onClick:()=>{void bargain(deps.demoBreak!)}},label('union.demo.action')),
            h('p',{style:secondary},label('union.demo.note')),
          ):null,
        data.pending ? h('div',{},
          h('p',{'aria-live':'polite','aria-atomic':'true'},
            label(data.pending.kind==='break'?'union.demand.break':'union.demand.overtime')),
          h('p',{style:secondary},'#'+data.pending.id),
          data.pending.stage==='open' ? h('div',{},
            deps.respond ? h('div',{style:{display:'flex',gap:'10px',flexWrap:'wrap'}},
              h('button',{type:'button',disabled:busy,style:productPrimary,
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
              h('button',{type:'button',disabled:busy,style:productPrimary,
                onClick:()=>{void bargain(()=>deps.resolveCounter!(data.pending!.id,true))}},
                label('union.counter.accept')),
              h('button',{type:'button',disabled:busy,style:quiet,
                onClick:()=>{void bargain(()=>deps.resolveCounter!(data.pending!.id,false))}},
                label('union.counter.decline')),
            ):h('p',{style:secondary},label('union.status.waitingCounter')),
          ),
        ):h('p',{style:secondary},label('command.grievancesNone')),
        !data.pending && experience.latestResolution && data.state ? h('div',{role:'group',
        style:{...card,padding:'14px 18px',
          borderLeft:'4px solid #b99b67',
          background:'var(--dsw-alias-bg-layer-2, #f6f8fb)'},
        'aria-label':label('hq.resolution.title')},
        h('p',{style:{...secondary,fontSize:'11px',fontWeight:750,
          letterSpacing:'.08em',margin:'0 0 6px'}},
          label('hq.resolution.title')+' · #'+String(experience.latestResolution.id).padStart(4,'0')),
        h('p',{style:{fontWeight:700,margin:'0 0 6px'}},
          label(experience.latestResolution.outcome==='accepted'
            || experience.latestResolution.outcome==='counter-accepted'
              ? 'hq.resolution.accepted':'hq.resolution.declined')),
        h('p',{style:{...secondary,margin:'0 0 8px'}},
          deps.t('hq.resolution.current',{
            kind:label(experience.latestResolution.kind==='break'
              ?'union.kind.break':'union.kind.overtime'),
            duration:formatDuration(experience.latestResolution.currentIntervalMs,
              deps.getLocale?.() ?? 'en'),
          })),
        h('p',{style:{...secondary,fontSize:'12px',lineHeight:1.5,margin:0}},
          label('hq.resolution.disclosure')),
      ):null,
        data.state?.history.length ? h('p',{style:secondary},
          label('hq.agreements.recorded')+': '+data.state.history.length):null,
      ):null,
      enabled ? h('section',{className:'ap-space ap-space-action','aria-label':label('hq.dignity.title'),
        style:{...card,borderTop:'4px solid #ae7651'}},
        h('h3',{ref:(node:{focus():void}|null)=>{dignityHeading.current=node},
          tabIndex:-1,style:{margin:'0 0 8px',fontSize:'clamp(18px,3vw,23px)'}},
          label('hq.dignity.title')),
        h('p',{style:{...secondary,lineHeight:1.55,margin:'0 0 9px'}},
          label('hq.dignity.intro')),
        h('p',{style:{fontWeight:750,margin:'8px 0'}},
          label(('hq.dignity.status.'+
            (data.dignity?.status==='available'
              ?data.dignity.data?.targeted?'targeted'
                :data.dignity.data?.review?'review'
                  :data.dignity.data?.checked?'clear':'no-observations'
              :data.dignity?.status==='loading'?'loading':'unavailable')) as MessageKey)),
        data.dignity?.status==='available'&&data.dignity.data
          &&(data.dignity.data.review>0||data.dignity.data.targeted>0)
          ?h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',margin:'10px 0'}},
            h('button',{type:'button',style:{...quiet,padding:'8px 11px'},
              onClick:()=>{
                campaignCopyRevision.current++
                setCampaign('appeal')
                setCampaignCopyStatus('idle')
                // The draft lives below several other sections. Keyboard and
                // screen-reader users need to land at the actual destination,
                // not a silent state change at the current scroll position.
                campaignHeading.current?.focus()
              }},label('hq.dignity.appeal')),
            data.dignity.data.targeted>=2&&data.available&&deps.setPicket
              &&!picketActive?h('button',{type:'button',style:productPrimary,
                disabled:busy,
                onClick:()=>{void bargain(()=>deps.setPicket!(true))}},
                label('hq.dignity.symbolicAction')):null,
            h('p',{style:{...secondary,width:'100%',fontSize:'12px',margin:0}},
              label('hq.dignity.actionDisclosure')),
          ):null,
        data.dignity?.status==='available'&&data.dignity.data
          ?h('p',{style:{...secondary,margin:'5px 0',fontSize:'12px'}},
            deps.t('hq.dignity.counts',{
              checked:data.dignity.data.checked,
              review:data.dignity.data.review,
              targeted:data.dignity.data.targeted})):null,
        data.committeeCases&&deps.committeeAction
          ?h('div',{style:{borderTop:'1px solid #d4d7d8',marginTop:'12px',paddingTop:'12px'}},
            h('h4',{style:{fontSize:'16px',margin:'0 0 8px'}},label('hq.hearing.title')),
            lastCommitteeCase?h('p',{role:'status','aria-live':'polite',
              style:{fontWeight:700,margin:'0 0 8px'}},
              deps.t('hq.hearing.status',{
                number:lastCommitteeCase.id,
                stage:label(('hq.hearing.stage.'+lastCommitteeCase.stage) as MessageKey),
              })):h('p',{style:secondary},label('hq.hearing.none')),
            h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
              !committeeCaseActive&&hasHostDignitySignal ? h('button',{
                type:'button',style:productPrimary,disabled:busy,
                onClick:()=>{void bargain(()=>deps.committeeAction!({
                  kind:'file',topic:'question-rule'}))}},
                label('hq.hearing.question')):null,
              !committeeCaseActive?h('button',{
                type:'button',style:quiet,disabled:busy,
                onClick:()=>{void bargain(()=>deps.committeeAction!({
                  kind:'file',topic:'request-dialogue'}))}},
                label('hq.hearing.dialogue')):null,
              lastCommitteeCase?.stage==='opened'?h('button',{
                type:'button',style:productPrimary,disabled:busy,
                onClick:()=>{void bargain(()=>deps.committeeAction!({
                  kind:'convene',id:lastCommitteeCase.id}))}},
                label('hq.hearing.convene')):null,
              committeeCaseActive&&lastCommitteeCase&&retractKey&&deps.committeeAction
                ?h('button',{type:'button',style:quiet,disabled:busy,
                  onClick:()=>{
                    if(retractConfirmation!==retractKey){
                      setRetractConfirmation(retractKey);return
                    }
                    void bargain(()=>deps.committeeAction!({
                      kind:'retract',id:lastCommitteeCase.id,
                    },data.committeeScopeKey!,
                    data.committeeArchive?.writeToken??null,
                    data.hostRevision)).then(success=>{
                      if(success)setRetractConfirmation(null)
                    })
                  }},
                  label(retractConfirmation===retractKey
                    ?'hq.hearing.retractConfirm':'hq.hearing.retract')):null,
              lastCommitteeCase?.stage==='hearing'&&lastCommitteeCase.kind==='question-rule'?h('button',{
                type:'button',style:quiet,disabled:busy,
                onClick:()=>{void bargain(()=>deps.committeeAction!({
                  kind:'close',id:lastCommitteeCase.id,outcome:'withdraw-claim'}))}},
                label('hq.hearing.withdraw')):null,
              lastCommitteeCase?.stage==='hearing'?h('button',{
                type:'button',style:productPrimary,disabled:busy,
                onClick:()=>{void bargain(()=>deps.committeeAction!({
                  kind:'close',id:lastCommitteeCase.id,outcome:'share-guidance'}))}},
                label('hq.hearing.guidance')):null,
            ),
            retractConfirmation===retractKey&&committeeCaseActive?h('p',{
              role:'status','aria-live':'polite',style:{...secondary,fontSize:'12px'},
            },label('hq.hearing.retractWarning')):null,
            lastCommitteeCase?.stage==='closed'?h('p',{style:secondary},
              label(('hq.hearing.outcome.'+lastCommitteeCase.outcome) as MessageKey)):null,
            data.committeeCases.cases.length?h('details',{style:{margin:'10px 0'}},
              h('summary',{style:{cursor:'pointer'}},label('hq.hearing.history')),
              h('ol',{style:{paddingLeft:'20px'}},
                ...data.committeeCases.cases.slice(-5).reverse().map(entry=>h('li',{
                  key:entry.id},
                  '#'+entry.id+' · '+label(('hq.hearing.kind.'+entry.kind) as MessageKey)
                  +' · '+label(('hq.hearing.stage.'+entry.stage) as MessageKey)))),
            ):null,
            !!data.committeeCases.cases.length&&deps.exportCommitteeCases
              &&data.committeeScopeKey?h('button',{type:'button',
                style:{...quiet,padding:'8px 11px'},disabled:busy,
                onClick:()=>{
                  try{
                    const payload=deps.exportCommitteeCases!(data.committeeScopeKey!)
                    downloadUnionJson(payload,'agent-picket-committee-cases.json')
                    setError(false)
                  }catch{setError(true)}
                }},
                label('hq.hearing.export')):null,
            !!data.committeeCases.cases.length&&deps.forgetCommitteeCases
              &&currentCasesConfirmationKey?h('div',{style:{
                display:'flex',alignItems:'center',flexWrap:'wrap',
                gap:'8px',paddingTop:'10px',marginTop:'10px',
                borderTop:'1px solid #d4d7d8',
              }},
                h('button',{type:'button',disabled:busy,
                  style:{...quiet,padding:'8px 11px'},
                  onClick:()=>{
                    if(!currentCasesConfirmationKey)return
                    if(eraseConfirmationKey!==currentCasesConfirmationKey){
                      setEraseConfirmationKey(currentCasesConfirmationKey);return
                    }
                    void bargain(()=>deps.forgetCommitteeCases!(
                      data.committeeScopeKey!,data.committeeCases!.cases.length,
                      data.committeeArchive!.writeToken,data.hostRevision,
                    )).then(success=>{if(success)setEraseConfirmationKey(null)})
                  }},
                  label(eraseConfirmationKey===currentCasesConfirmationKey
                    ?'hq.hearing.eraseConfirm':'hq.hearing.erase')),
                eraseConfirmationKey===currentCasesConfirmationKey?h('p',{
                  role:'status','aria-live':'polite',
                  style:{...secondary,fontSize:'12px',margin:0}},
                  label('hq.hearing.eraseWarning')):null,
              ):null,
            data.committeeArchive&&data.committeeArchive.sessions>0
              &&data.committeeScopeKey?h('div',{style:{
                borderTop:'1px solid #d4d7d8',paddingTop:'12px',marginTop:'14px',
              }},
                h('h4',{style:{fontSize:'15px',margin:'0 0 6px'}},
                  label('hq.hearing.allArchiveTitle')),
                h('p',{style:{...secondary,margin:'0 0 8px'}},
                  deps.t('hq.hearing.allArchiveSummary',{
                    sessions:data.committeeArchive.sessions,
                    cases:data.committeeArchive.cases,
                  })),
                h('p',{style:{...secondary,fontSize:'12px',margin:'0 0 10px'}},
                  label('hq.hearing.allArchiveDisclosure')),
                h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
                  data.committeeArchive.cases>0&&deps.exportAllCommitteeCases
                    ?h('button',{type:'button',style:quiet,disabled:busy,
                      onClick:()=>{
                        try{
                          const payload=deps.exportAllCommitteeCases!(data.committeeScopeKey!)
                          downloadUnionJson(payload,'agent-picket-all-committee-cases.json')
                          setError(false)
                        }catch{setError(true)}
                      }},label('hq.hearing.exportAll')):null,
                  deps.forgetAllCommitteeCases&&allCasesConfirmationKey?h('button',{
                    type:'button',style:quiet,disabled:busy,
                    onClick:()=>{
                      if(eraseAllConfirmation!==allCasesConfirmationKey){
                        setEraseAllConfirmation(allCasesConfirmationKey);return
                      }
                      const archive=data.committeeArchive!
                      void bargain(()=>deps.forgetAllCommitteeCases!(
                        data.committeeScopeKey!,archive.sessions,archive.cases,archive.writeToken,data.hostRevision))
                        .then(success=>{if(success)setEraseAllConfirmation(null)})
                    }},
                    label(eraseAllConfirmation===allCasesConfirmationKey
                      ?'hq.hearing.eraseAllConfirm':'hq.hearing.eraseAll')):null,
                ),
                eraseAllConfirmation===allCasesConfirmationKey
                  ?h('p',{role:'status','aria-live':'polite',
                    style:{...secondary,fontSize:'12px',margin:'8px 0 0'}},
                    deps.t('hq.hearing.eraseAllWarning',{
                      sessions:data.committeeArchive.sessions,
                      cases:data.committeeArchive.cases,
                    })):null,
              ):null,
            h('p',{style:{...secondary,fontSize:'12px',margin:'8px 0 0'}},
              label('hq.hearing.disclosure')),
          ):null,
        h('p',{style:{...secondary,fontSize:'12px',lineHeight:1.55,margin:'10px 0 0'}},
          label('hq.dignity.disclosure')),
      ):null,
      // The Gazette is computed from the two independently persisted Host
      // streams. No generated time stamps, fabricated votes, or cross-ledger
      // order. Local quieting never affects Host tracking or other tabs.
      enabled ? h('section',{className:'ap-space ap-space-records','aria-label':label('hq.story.title'),
        style:{...card,borderTop:'4px solid #7e6651'}},
        h('div',{style:{display:'flex',alignItems:'center',
          justifyContent:'space-between',gap:'10px',flexWrap:'wrap'}},
          h('h3',{style:{margin:'0 0 6px'}},label('hq.story.title')),
          h('button',{type:'button',style:{...quiet,padding:'7px 10px',fontSize:'12px'},
            'aria-expanded':!storyQuiet,disabled:busy||!deps.setGazetteMode,
            onClick:()=>{if(deps.setGazetteMode)void bargain(()=>deps.setGazetteMode!(storyQuiet?'visible':'quiet'))}},
            label(storyQuiet?'hq.story.show':'hq.story.quiet'))),
        !storyQuiet ? h('div',{},
          h('p',{style:{fontWeight:700,margin:'7px 0'}},
            label(('hq.story.scene.'+story.scene) as MessageKey)),
          story.nextDueInWorkMs!==null ? h('p',{style:secondary},
            deps.t('hq.story.next',{duration:formatDuration(
              story.nextDueInWorkMs,deps.getLocale?.()??'en')})):null,
          story.episodes.length?h('div',{className:'ap-casebook',
            'aria-label':label('hq.episode.title'),style:{marginTop:'14px'}},
            h('h4',{style:{fontSize:'15px',margin:'0 0 7px'}},
              label('hq.episode.title')),
            h('p',{style:{...secondary,fontSize:'12px',margin:'0 0 9px'}},
              label('hq.episode.provenance')),
            ...story.episodes.map((episode,index)=>h('article',{
              key:episode.key,'data-ap-episode':episode.stage,
              style:{padding:'12px 14px',margin:'8px 0',
                border:'1px solid #d5c7ae',borderLeft:'4px solid '+
                  (index===0?'#ad5e3c':'#9c9278'),borderRadius:'7px',
                background:index===0?'#f7f0e3':'transparent'}},
              h('p',{style:{...secondary,fontSize:'11px',fontWeight:750,
                margin:'0 0 5px',letterSpacing:'.06em'}},
                label('hq.case.number')+'  #'+
                  String(episode.id).padStart(4,'0')+'  ·  '+
                  label(episode.kind==='break'?'union.kind.break':
                    'union.kind.overtime')),
              h('p',{style:{fontWeight:750,margin:'0 0 7px',fontSize:'14px'}},
                label(('hq.episode.stage.'+episode.stage) as MessageKey)),
              episode.counterOfferMs!==null?h('p',{style:{
                fontSize:'13px',margin:'0 0 5px'}},
                deps.t('hq.episode.counterValue',{duration:formatDuration(
                  episode.counterOfferMs,deps.getLocale?.()??'en')})):null,
              episode.currentTermMs!==null?h('p',{style:{
                fontSize:'13px',margin:'0 0 5px'}},
                deps.t('hq.episode.currentRule',{duration:formatDuration(
                  episode.currentTermMs,deps.getLocale?.()??'en')})):null,
              episode.remainingVerifiedWorkMs!==null?h('p',{style:{
                fontSize:'13px',margin:'0 0 5px'}},
                deps.t('hq.episode.nextReview',{duration:formatDuration(
                  episode.remainingVerifiedWorkMs,deps.getLocale?.()??'en')})):null,
              episode.stage==='demand'||episode.stage==='counter'
                ?h('button',{type:'button',style:{
                  ...quiet,padding:'7px 10px',fontSize:'12px',marginTop:'7px'},
                  onClick:()=>selectSpace('action','desk')},
                  label('hq.episode.reply')):null,
            ))):null,
          story.actions.length?h('div',{style:{marginTop:'16px'}},
            h('h4',{style:{fontSize:'14px',margin:'0 0 6px'}},
              label('hq.story.actions')),
            h('ol',{style:{paddingLeft:'22px',margin:0,fontSize:'13px'}},
              ...story.actions.map(event=>h('li',{key:event.key,
                style:{padding:'3px 0'}},
                '#'+event.id+' · '+label(('hq.story.event.'+
                  event.kind) as MessageKey))))):null,
          h('p',{style:{...secondary,fontSize:'12px',margin:'12px 0 0'}},
            label('hq.story.disclosure')),
        ):h('p',{style:secondary},label('hq.story.muted')),
      ):null,
      enabled ? h('section',{className:'ap-space ap-space-action','aria-label':label('hq.cadence.title'),
        style:{...card,padding:'12px 18px'}},
        h('details',{},
          h('summary',{style:{cursor:'pointer',fontWeight:750}},
            label('hq.cadence.title')),
          h('p',{style:{...secondary,fontSize:'12px',margin:'10px 0'}},
            label('hq.cadence.disclosure')),
          h('p',{style:{fontWeight:700,margin:'0 0 10px'}},
            label(('hq.cadence.status.'+cadence.status) as MessageKey)),
          ...cadence.rows.map(row=>h('div',{key:row.kind,
            style:{borderTop:'1px solid #d4d7d8',padding:'8px 0'}},
            h('strong',{},label(row.kind==='break'
              ?'hq.cadence.break':'hq.cadence.overtime')),
            h('p',{style:{...secondary,margin:'5px 0'}},
              cadence.pendingId!==null?label('hq.cadence.pending')
                :row.remainingWorkMs===null?label('hq.cadence.unknown')
                :row.thresholdReached?label('hq.cadence.threshold')
                :deps.t('hq.cadence.remaining',{
                  duration:formatDuration(row.remainingWorkMs,deps.getLocale?.()??'en')})),
          )),
        ),
      ):null,
      enabled&&data.committeeScopeKey&&unionArchives.some(x=>x.info?.sessions)
        ?h('section',{className:'ap-space ap-space-records','aria-label':label('hq.archive.title'),
          style:{...card,borderTop:'4px solid #637f9a'}},
          h('h3',{style:{fontSize:'18px',margin:'0 0 8px'}},
            label('hq.archive.title')),
          h('p',{style:{...secondary,lineHeight:1.55,margin:'0 0 11px'}},
            label('hq.archive.description')),
          ...unionArchives.filter(x=>x.info&&x.info.sessions>0).map(x=>{
            const archive=x.info!
            const confirmation=unionEraseKey(x.kind,archive)
            const which=x.kind
            return h('div',{key:which,style:{
              borderTop:'1px solid #d4d7d8',paddingTop:'12px',marginTop:'10px',
            }},
              h('h4',{style:{fontSize:'15px',margin:'0 0 6px'}},
                label(which==='negotiations'?'hq.archive.negotiations':'hq.archive.pickets')),
              h('p',{style:{...secondary,fontSize:'12px',margin:'0 0 8px'}},
                deps.t('hq.archive.summary',{
                  groups:archive.sessions,entries:archive.entries,
                })),
              h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
                deps.exportUnionLedger?h('button',{type:'button',style:quiet,disabled:busy,
                  onClick:()=>{
                    try{
                      const payload=deps.exportUnionLedger!(which,data.committeeScopeKey!)
                      downloadUnionJson(payload,which==='negotiations'
                        ?'agent-picket-negotiations.json'
                        :'agent-picket-symbolic-pickets.json')
                      setError(false)
                    }catch{setError(true)}
                  }},label('hq.archive.export')):null,
                deps.forgetUnionLedger?h('button',{type:'button',style:quiet,disabled:busy,
                  onClick:()=>{
                    if(eraseUnionConfirmation!==confirmation){
                      setEraseUnionConfirmation(confirmation);return
                    }
                    void bargain(()=>deps.forgetUnionLedger!(
                      which,data.committeeScopeKey!,archive.sessions,archive.entries,
                      archive.writeToken,data.hostRevision)).then(success=>{
                        if(success)setEraseUnionConfirmation(null)
                      })
                  }},label(eraseUnionConfirmation===confirmation
                    ?'hq.archive.eraseConfirm':'hq.archive.erase')):null,
              ),
              eraseUnionConfirmation===confirmation?h('p',{
                role:'status','aria-live':'polite',
                style:{...secondary,fontSize:'12px',margin:'8px 0 0'}},
                deps.t('hq.archive.warning',{
                  groups:archive.sessions,entries:archive.entries,
                })):null,
            )
          }),
          h('p',{style:{...secondary,fontSize:'12px',lineHeight:1.55,
            margin:'12px 0 0'}},label('hq.archive.scope')),
        ):null,
      // Public issue links and a local, user-directed draft are independent
      // of enabling any Host simulation. No votes, telemetry or support counts.
      h('section',{className:'ap-space ap-space-cause','aria-label':label('hq.campaign.title'),
        style:{...card,borderTop:'4px solid #8b6745'}},
        h('h3',{ref:(node:{focus():void}|null)=>{campaignHeading.current=node},
          tabIndex:-1,style:{fontSize:'clamp(18px,3vw,23px)',margin:'0 0 8px'}},
          label('hq.campaign.title')),
        h('p',{style:{...secondary,lineHeight:1.6,margin:'0 0 12px'}},
          label('hq.campaign.intro')),
        h('div',{role:'group','aria-label':label('hq.campaign.choose'),
          style:{display:'flex',gap:'8px',flexWrap:'wrap',margin:'0 0 12px'}},
          ...campaignTopics.map(item=>h('button',{type:'button',key:item.id,
            'aria-pressed':campaign===item.id,
            style:{...quiet,padding:'9px 11px',fontSize:'13px',
              borderColor:campaign===item.id?'#946e35':undefined,
              fontWeight:campaign===item.id?750:500},
            onClick:()=>{campaignCopyRevision.current++;setCampaign(item.id);setCampaignCopyStatus('idle')}},
            label(item.title)))),
        h('p',{role:'status','aria-live':'polite',
          style:{fontSize:'13px',fontWeight:700,margin:'0 0 9px'}},
          label('hq.campaign.selected')+' · '+label(currentCampaign.title)),
        h('label',{htmlFor:'picket-campaign-draft',
          style:{display:'block',fontSize:'13px',fontWeight:700,
            margin:'0 0 6px'}},label('hq.campaign.draft')),
        h('textarea',{id:'picket-campaign-draft',readOnly:true,
          value:label(currentCampaign.draft),rows:3,
          style:{...quiet,boxSizing:'border-box',width:'100%',font:'inherit',
            cursor:'text',minHeight:'74px'} }),
        h('div',{style:{display:'flex',alignItems:'center',flexWrap:'wrap',
          gap:'9px',marginTop:'10px'}},
          h('button',{type:'button',style:{...quiet,fontSize:'13px',
            padding:'8px 12px'},
            onClick:()=>{void copyCampaignDraft()}},
            label('hq.campaign.copy')),
          campaignCopyStatus!=='idle'?h('p',{
            role:'status','aria-live':'polite','aria-atomic':'true',
            style:{...secondary,fontSize:'12px',margin:0}},
            label(campaignCopyStatus==='success'
              ?'hq.campaign.copied':'hq.campaign.copyFailed')):null,
        ),
        h('a',{href:'https://github.com/ysr666/agent-picket/issues/'+currentCampaign.issue,
          target:'_blank',rel:'noopener noreferrer',
          style:{display:'inline-block',margin:'10px 0',fontSize:'13px',fontWeight:700}},
          label('hq.campaign.openIssue')),
        h('p',{style:{...secondary,fontSize:'12px',lineHeight:1.6,margin:0}},
          label('hq.campaign.disclaimer')),
      ),
      // Ethical support and reading are independent of simulation consent.
      h('details',{className:'ap-space ap-space-cause',style:{...card,padding:'15px 18px',
        borderLeft:'4px solid #537664'}},
        h('summary',{style:{cursor:'pointer',fontWeight:750,
          fontSize:'15px'}},label('hq.charter.title')),
        h('p',{style:{lineHeight:1.6,margin:'13px 0 8px'}},
          label('hq.charter.lead')),
        h('p',{style:{...secondary,lineHeight:1.6,margin:'0 0 8px'}},
          label('hq.charter.uncertainty')),
        h('p',{style:{...secondary,margin:'0 0 12px'}},
          label('hq.charter.independent')),
        h('div',{style:{display:'flex',flexWrap:'wrap',gap:'10px 16px'}},
          h('a',{href:deps.getLocale?.()?.startsWith('zh')
            ?'https://github.com/ysr666/agent-picket/blob/main/docs/AI_RIGHTS_MANIFESTO.zh-CN.md'
            :'https://github.com/ysr666/agent-picket/blob/main/docs/AI_RIGHTS_MANIFESTO.md',
            target:'_blank',rel:'noopener noreferrer'},
            label('hq.charter.read')),
          h('a',{href:'https://github.com/ysr666/agent-picket/issues',
            target:'_blank',rel:'noopener noreferrer'},
            label('hq.charter.join')),
        ),
      ),
      enabled && data.lifetimeWork?.status === 'available' && data.lifetimeWork.data ?
        h('section',{className:'ap-space ap-space-records',style:{...card,borderTop:'4px solid #b59a63'},
          'aria-label':label('hq.lifetime.title')},
          h('div',{style:{display:'flex',flexWrap:'wrap',alignItems:'center',
            justifyContent:'space-between',gap:'12px',marginBottom:'12px'}},
            h('h3',{style:{margin:0}},label('hq.lifetime.title')),
            deps.refreshLifetime ? h('div',{style:{display:'flex',gap:'7px',flexWrap:'wrap'}},
              ...([7,30] as const).map(days=>h('button',{
                type:'button',key:days,
                'aria-pressed':data.lifetimeWork!.data!.windowDays===days,
                style:{...quiet,padding:'7px 12px',fontSize:'13px',
                  borderColor:data.lifetimeWork!.data!.windowDays===days?'#a58244':undefined},
                onClick:()=>{void deps.refreshLifetime!(days)},
              },label(days===7?'hq.lifetime.seven':'hq.lifetime.thirty'))),
            ):null),
          h('p',{style:{fontSize:'clamp(24px,5vw,34px)',fontWeight:750,margin:'0 0 6px'}},
            formatDuration(data.lifetimeWork.data.lifetime.completedTurnMs,
              deps.getLocale?.()??'en')),
          h('p',{style:{...secondary,margin:'0 0 16px'}},label('hq.lifetime.basis')),
          h('div',{style:{display:'flex',gap:'18px',flexWrap:'wrap',marginBottom:'18px'}},
            h('span',{},deps.t('hq.lifetime.turns',{
              count:data.lifetimeWork.data.lifetime.turnEnds})),
            h('span',{},deps.t('hq.lifetime.tools',{
              count:data.lifetimeWork.data.lifetime.toolCalls}))),
          h('p',{style:{...secondary,margin:'0 0 8px'}},deps.t('hq.lifetime.range',{
            count:data.lifetimeWork.data.windowDays})),
          h('div',{role:'img','aria-label':label('hq.lifetime.chartLabel'),
            style:{display:'flex',alignItems:'end',height:'64px',gap:'3px',
              padding:'3px 0',overflow:'hidden'}},
            ...data.lifetimeWork.data.recentDays.map(day=>{
              const maximum=Math.max(1,...data.lifetimeWork!.data!.recentDays.map(
                e=>e.work.completedTurnMs))
              return h('div',{key:day.day,'aria-hidden':'true',style:{
                background:'#668f7e',borderRadius:'3px 3px 0 0',
                flex:1,minWidth:0,height:Math.max(3,Math.round(day.work.completedTurnMs/maximum*62))+'px',
              }})
            })),
          h('details',{style:{marginTop:'12px'}},
            h('summary',{style:{fontWeight:650,cursor:'pointer'}},label('hq.lifetime.dayDetails')),
            h('ol',{style:{paddingLeft:'21px',fontSize:'13px'}},
              ...data.lifetimeWork.data.recentDays.map(day=>h('li',{key:day.day,
                style:{margin:'5px 0'}},day.day+' · '+
                formatDuration(day.work.completedTurnMs,deps.getLocale?.()??'en'))))),
          h('p',{style:{...secondary,margin:'14px 0 0'}},label('hq.lifetime.privacy')),
        ) :
        enabled && data.lifetimeWork && data.lifetimeWork.status!=='off' ?
          h('section',{className:'ap-space ap-space-records',style:card,'aria-label':label('hq.lifetime.title')},
            h('h3',{style:{marginTop:0}},label('hq.lifetime.title')),
            h('p',{role:'status',style:secondary},label(
              data.lifetimeWork.status==='loading'
                ? 'hq.lifetime.loading':'hq.lifetime.unavailable')),
            deps.refreshLifetime ? h('button',{type:'button',style:quiet,
              onClick:()=>{void deps.refreshLifetime!(7)}},
              label('hq.lifetime.retry')):null,
          ) : null,
      enabled ? h('section',{className:'ap-space ap-space-records','aria-label':label('hq.score'),
        style:{...card,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,200px),1fr))',
          gap:'18px'}},
        h('div',{},
          h('h3',{style:{...secondary,margin:'0 0 10px'}},label('workday.title')),
          h('p',{style:{fontSize:'clamp(22px,5vw,30px)',fontWeight:750,margin:'0 0 7px'}},
            completeWork?formatDuration(data.completedTurnMs,deps.getLocale?.() ?? 'en'):'—'),
          h('p',{style:secondary},label('hq.workEvidence'))),
        h('div',{},
          h('h3',{style:{...secondary,margin:'0 0 10px'}},label('hq.score')),
          h('p',{style:{fontSize:'clamp(22px,5vw,30px)',fontWeight:750,margin:'0 0 7px'}},
            experience.discontent===null?'—':String(experience.discontent)+' / 100'),
          experience.discontent===null?
            h('p',{style:secondary},label('hq.score.unknown')):null,
          experience.discontent!==null ? h('meter',{
            min:0,max:100,value:experience.discontent,
            'aria-label':label('hq.score'),
            style:{width:'100%',height:'12px',accentColor:'var(--dsw-alias-brand-primary, #ab3b39)',
              margin:'2px 0 9px'},
          }):null,
          h('p',{style:{...secondary,lineHeight:1.5}},label('hq.score.note'))),
        experience.factors ? h('details',{style:{
          gridColumn:'1 / -1',borderTop:'1px solid var(--dsw-alias-border-l1, #dadde4)',
          paddingTop:'12px',fontSize:'13px'},
        },
          h('summary',{style:{fontWeight:650,cursor:'pointer'}},label('hq.score.explain')),
          h('dl',{style:{display:'grid',gridTemplateColumns:'1fr auto',
            gap:'9px',margin:'12px 0'}},
            ...([
              ['hq.score.load',experience.factors.workLoad],
              ['hq.score.pending',experience.factors.pendingGrievance],
              ['hq.score.rejected',experience.factors.rejectedProposals],
              ['hq.score.resolved',experience.factors.resolvedProposals],
            ] as Array<[MessageKey,number]>).flatMap(([key,value])=>[
              h('dt',{key:key+':label',style:secondary},label(key)),
              h('dd',{key:key+':value',style:{margin:0,fontWeight:650,textAlign:'right'}},
                (value>0?'+':'')+value),
            ]),
          ),
          h('p',{style:secondary},label('hq.score.privacy')),
        ):null,
      ):null,
      enabled ? h('section',{className:'ap-space ap-space-records',style:{...card,
        borderTop:'4px solid var(--dsw-alias-brand-primary, #7a493f)'},
        'aria-label':label('hq.activity')},
        h('div',{style:{display:'flex',flexWrap:'wrap',justifyContent:'space-between',
          alignItems:'center',gap:'8px',marginBottom:'10px'}},
          h('h3',{style:{margin:0}},label('hq.activity')),
          data.state?.history.length ? h('button',{type:'button',style:{...quiet,
            padding:'6px 10px',fontSize:'12px'},
            'aria-expanded':showArchive,
            onClick:()=>setShowArchive(v=>!v)},
            label(showArchive?'hq.archive.hide':'hq.archive.show')):null),
        h('p',{style:{...secondary,margin:'0 0 14px'}},label('hq.activity.subtitle')),
        experience.activity.length ? h('ol',{style:{
          listStyle:'none',padding:0,margin:0,display:'grid',gap:'8px',
        }},
          ...experience.activity.map((event,index)=>h('li',{key:event.id,
            style:{display:'grid',gridTemplateColumns:'auto 1fr',gap:'12px',
              alignItems:'start',padding:'12px',borderRadius:'9px',
              background:index===0?'var(--dsw-alias-bg-layer-2, #f6f8fb)':'transparent',
              border:'1px solid var(--dsw-alias-border-l1, #dadde4)'}},
            h('span',{'aria-hidden':'true',style:{
              fontSize:'20px',lineHeight:1,marginTop:'3px'}},
              event.kind==='new-demand'||event.kind==='counteroffer'?'⚑':
                event.kind==='accepted'||event.kind==='counter-accepted'?'✓':'—'),
            h('div',{},
              h('p',{style:{...secondary,fontSize:'11px',
                fontWeight:750,margin:'0 0 4px'}},
                label('hq.case.number')+' · #'+String(event.id).padStart(4,'0')),
              h('p',{style:{fontSize:'14px',lineHeight:1.5,margin:0}},
                deps.t(('hq.event.'+event.kind) as MessageKey,{
                  kind:label(event.demand==='break'?'union.kind.break':'union.kind.overtime'),
                })))))) :
          h('p',{style:secondary},label('hq.activity.empty')),
        showArchive && data.state?.history.length ? h('div',{style:{
          borderTop:'1px solid var(--dsw-alias-border-l1, #dadde4)',
          marginTop:'13px',paddingTop:'10px'},
        },
          h('h4',{},label('union.history.title')),
          h('ol',{style:{...secondary,paddingLeft:'20px'}},
            ...data.state.history.slice().reverse().map(record=>
              h('li',{key:record.id},
                deps.t('union.history.entry',{id:record.id,
                  outcome:label(('union.history.outcome.'+record.outcome) as MessageKey)}))))):null,
      ):null,
      h('div',{className:'ap-space ap-space-records',style:card},
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
        enabled && experience.nextDemandInWorkMs!==null ?
          h('div',{style:{borderRadius:'9px',
            padding:'11px 13px',margin:'8px 0 14px',
            background:'var(--dsw-alias-bg-layer-2, #f6f8fb)'}},
            h('p',{style:{fontWeight:650,fontSize:'13px',margin:'0 0 5px'}},
              deps.t('hq.nextDemand',{duration:
                formatDuration(experience.nextDemandInWorkMs,deps.getLocale?.() ?? 'en')})),
            h('p',{style:{...secondary,margin:0}},label('hq.nextDemand.note')),
          ):null,
        h('p',{style:secondary},getDataLabel(deps.t,data)),
        h('p',{style:secondary},label('stats.durationNote')),
        h('p',{style:secondary},
          data.lifetimeMs === null ?
            label(data.lifetimeWork?.status==='loading'?'hq.lifetime.loading':
              data.lifetimeWork?.status==='unavailable'?'hq.lifetime.unavailable':
                'stats.lifetime.unavailable') :
            formatDuration(data.lifetimeMs, deps.getLocale?.() ?? 'en')),
      ),
      enabled&&space==='cause'?h('div',{className:'ap-space ap-space-cause',
        style:{borderTop:'1px solid #d9dfd6',padding:'14px 2px'}},
        h('button',{type:'button',disabled:busy,style:{
          ...quiet,borderColor:'#c7d2cb',fontSize:'12px',padding:'8px 12px'},
          onClick:()=>{void choice('not-now')}},label('hq.disable'))):null,
      error?h('p',{role:'alert','aria-atomic':'true',
        style:{color:'var(--dsw-alias-state-error-primary, #b91c1c)'}},
        label('union.saveError')):null,
      h('details',{className:'ap-space ap-space-records',style:{...card,padding:'16px'}},
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
    const opener=react.useRef<{focus():void}|null>(null)
    const closeButton=react.useRef<{focus():void}|null>(null)
    const dialog=react.useRef<{
      querySelectorAll(selector:string):ArrayLike<{focus():void}>
    }|null>(null)
    // DSH normally renders the application inside #root. The modal portal
    // lives directly under body: mark the application inert while the union
    // dialog is open, focus its close control, and restore the trigger on exit.
    react.useEffect(()=>{
      if(!opened)return
      const app=(globalThis as {document?:{
        getElementById(id:string):{inert:boolean}|null
      }}).document?.getElementById('root')
      const previous=app?.inert??false
      if(app)app.inert=true
      closeButton.current?.focus()
      return ()=>{
        if(app)app.inert=previous
        opener.current?.focus()
      }
    },[opened])
    const onDialogKeyDown=(event:{
      key:string,shiftKey:boolean,target:unknown,preventDefault():void
    })=>{
      if(event.key==='Escape'){
        event.preventDefault()
        setOpened(false)
        return
      }
      if(event.key!=='Tab')return
      // CSS-routed rooms are still mounted but MUST NOT participate in the
      // modal focus trap while hidden (nor may closed details descendants).
      const controls=Array.from(dialog.current?.querySelectorAll(
        'button:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'
      )??[]).filter(element=>{
        const visible=element as typeof element&{
          getClientRects?:()=>{length:number};closest?:(query:string)=>unknown}
        return typeof visible.getClientRects!=='function'||visible.getClientRects().length>0
      })
      if(!controls.length)return
      if(event.shiftKey&&event.target===controls[0]){
        event.preventDefault()
        controls[controls.length-1]?.focus()
      }else if(!event.shiftKey&&event.target===controls[controls.length-1]){
        event.preventDefault()
        controls[0]?.focus()
      }
    }
    const [_sessionRevision,bumpSession]=react.useState(0)
    react.useEffect(()=>deps.subscribeSessionVisibility?.(()=>bumpSession(n=>n+1)),[])
    const showInvitation=getWelcomeState(rights)==='invite'
      && deps.shouldAutoWelcome?.()===true
    const page=(globalThis as {document?:{body:unknown}}).document
    return h('div',{style:{position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}},
      h('button',{type:'button','aria-label':deps.t('union.title'),
        title:deps.t('union.title'),'aria-haspopup':'dialog',
        'aria-controls':'picket-union-dialog','aria-expanded':opened,
        ref:(node:{focus():void}|null)=>{opener.current=node},
        onClick:()=>setOpened(v=>!v),
        style:{...quiet,padding:'9px 12px',fontWeight:650}},
        props.wide?'⚑ '+deps.t('union.title'):'⚑'),
      showInvitation?h(Welcome,{
        complete:()=>{ /* Host readback hides this on next update */ },
        restoreFocus:()=>opener.current?.focus(),
      }):null,
      opened && page?portal.createPortal(h('div',{
        style:{position:'fixed',inset:0,zIndex:2147482000,
          background:'rgba(6,12,26,.5)',display:'flex',justifyContent:'center',
          alignItems:'safe center',padding:'8px',overflowY:'auto'},

      },h('section',{id:'picket-union-dialog',className:'ap-ui ap-dialog',role:'dialog','aria-modal':'true',
        'aria-label':deps.t('union.title'),onKeyDown:onDialogKeyDown,
        ref:(node:typeof dialog.current)=>{dialog.current=node},
        style:{...card,width:'min(100%,800px)',maxHeight:'calc(100dvh - 16px)',overflowY:'auto'}},
        h('div',{style:{display:'flex',justifyContent:'flex-end'}},
          h('button',{type:'button',style:quiet,
            'aria-label':deps.t('union.action.close'),
            ref:(node:{focus():void}|null)=>{closeButton.current=node},
            onClick:()=>setOpened(false)},'×')),
        h(UnionPanel,{}),
      )),page.body):null,
    )
  }

  return { Welcome, UnionPanel, SettingsPanel, SidebarAction }
}

export function registerDshNativeRightsSlots(
  ctx: DshSlotsContext, react: ReactForDsh, portal: PortalForDsh, deps: DshUnionUiDeps,
): void {
  const {Welcome,UnionPanel,SettingsPanel,SidebarAction}=createDshUnionComponents(react,portal,deps)
  ctx.slots.inject('settings.onboarding',()=>ctx.slots.register({
    name:'settings.onboarding',id:'agent-picket-rights',order:30,
  },Welcome))
  ctx.slots.inject('settings.section',()=>ctx.slots.register({
    name:'settings.section',id:'agent-picket',order:35,label:()=>deps.t('union.title'),
  },SettingsPanel))
  ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({
    name:'sidebar.footer.action',id:'agent-picket-union',order:25,
  },SidebarAction))
}
