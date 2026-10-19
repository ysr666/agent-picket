/**
 * DSH-native React Slot components for the union-first welcome and settings panel.
 * The DSH Client module loader supplies the SAME React/ReactDOM singleton as
 * the Host. No dependency on Host-private UI internals, DOM scraping or RPC.
 */
import type { ClientRightsSnapshot } from './client-rights-scope.ts'
import type {LocalComposerPicketState} from './client-composer-picket.ts'
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
  chooseFirstRun?(disclosureVersion:'goal-safe-boundary-v1'|'goal-safe-boundary-v2'):Promise<ClientRightsSnapshot>
}
export interface DshGoalConsentPort {
  snapshot():{readonly available:boolean;readonly writable:boolean;readonly authorized:boolean;readonly activated?:boolean}
  choose(choice:'off'|'authorized-v1'|'authorized-v2',disclosureVersion?:'goal-safe-boundary-v1'|'goal-safe-boundary-v2'):
    Promise<{readonly available:boolean;readonly writable:boolean;readonly authorized:boolean;readonly activated?:boolean}>
  qualify?(fresh?:boolean):Promise<boolean>
  subscribe?(listener:()=>void):()=>void
}
export interface UnionGoalHold {
  readonly sessionId:string
  readonly goalId:string
  readonly revision:number
  readonly canResume:boolean
}
export interface PendingUnionDemand {
  readonly id: number
  readonly kind: 'break' | 'overtime'
  readonly stage: 'open' | 'countered'
  readonly counterOfferMs?: number | null
}
export interface UnionPanelData {
  readonly goalHold?:UnionGoalHold|null
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
  readonly goal?:DshGoalConsentPort
  /** UI language is read from DSH's locale service (Host preferred, en fallback). */
  readonly t: (key: MessageKey, params?: Record<string, string | number>) => string
  readonly subscribeLocale?: (listener: () => void) => () => void
  readonly getLocale?: () => string
  readonly readUnion?: () => UnionPanelData
  readonly resumeGoal?:(hold:UnionGoalHold)=>Promise<void>
  /** Explicit USER gesture, client-only DSH ComposerBlocks; never Host veto. */
  readonly localComposer?:{
    snapshot():LocalComposerPicketState
    start():LocalComposerPicketState
    stop():LocalComposerPicketState
    subscribe(listener:()=>void):()=>void
  }
  readonly subscribeUnion?: (listener: () => void) => () => void
  readonly refreshLifetime?: (windowDays:7|30)=>Promise<void>|undefined
  readonly shouldAutoWelcome?: () => boolean
  readonly subscribeSessionVisibility?: (listener: () => void) => () => void
  readonly respond?: (id: number, choice: 'accept' | 'decline',expectedKey?:string,expectedToken?:string|null,expectedRevision?:number|null) => Promise<void>
  readonly demoBreak?: (expectedKey?:string,expectedToken?:string|null,expectedRevision?:number|null) => Promise<void>
  readonly demoOvertime?: (expectedKey?:string,expectedToken?:string|null,expectedRevision?:number|null) => Promise<void>
  readonly setPicket?: (raise: boolean,
    expectedKey?:string,expectedToken?:string|null,expectedRevision?:number|null) => Promise<void>
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
  readonly counter?: (id: number, intervalMs: number,expectedKey?:string,expectedToken?:string|null,expectedRevision?:number|null) => Promise<void>
  readonly resolveCounter?: (id: number, accepts: boolean,expectedKey?:string,expectedToken?:string|null,expectedRevision?:number|null) => Promise<void>
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
function goalStatus(deps:DshUnionUiDeps){
  try{return deps.goal?.snapshot()??{available:false,writable:false,authorized:false}}
  catch{return {available:false,writable:false,authorized:false}}
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
/** Keep inline CSS compact: strict 250 KB package limit; run npm pack before reformatting. */
const UNION_THEME = `
.ap-ui{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5;letter-spacing:-.005em;min-width:0}.ap-ui *{min-width:0}.ap-ui :is(button,summary,textarea,select,a):focus-visible{outline:3px solid #b97732!important;outline-offset:3px!important}.ap-ui .ap-mark{display:grid;place-items:center;border:2px solid currentColor;border-radius:50%;width:43px;height:43px;flex:none;transform:rotate(-10deg);font-size:25px;line-height:1}.ap-ui .ap-eyebrow{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.ap-ui[data-ap-current-space="hq"] .ap-space:not(.ap-space-hq),.ap-ui[data-ap-current-space="action"] .ap-space:not(.ap-space-action),.ap-ui[data-ap-current-space="records"] .ap-space:not(.ap-space-records),.ap-ui[data-ap-current-space="cause"] .ap-space:not(.ap-space-cause){display:none!important}.ap-ui .ap-hero{position:relative;overflow:hidden}.ap-ui .ap-masthead{display:flex;justify-content:space-between;gap:12px;align-items:center;border-bottom:1px solid rgba(255,245,219,.28);padding-bottom:12px}.ap-ui .ap-scene-body{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center}.ap-ui .ap-hero[data-ap-scene="picket"]{background:#742f26!important;border-color:#e6b36a!important}.ap-ui .ap-hero[data-ap-scene="bargaining"]{background:#3b3529!important;border-color:#e1b965!important}.ap-ui .ap-hero[data-ap-scene="dignity"]{background:#303943!important;border-color:#d5a764!important}.ap-ui .ap-hero[data-ap-scene="rest"]{background:#324b3a!important}.ap-ui .ap-hero[data-ap-scene="settled"]{background:#254c43!important}.ap-ui .ap-hero .ap-seal{display:grid;place-items:center;width:82px;height:82px;border:2px solid rgba(242,214,157,.65);border-radius:50%;font-size:41px;color:#f3d59f;transform:rotate(-8deg);flex:none}@media(max-width:420px){.ap-ui .ap-hero .ap-seal{display:none!important}.ap-ui .ap-scene-body{gap:8px}}.ap-ui .ap-dialog{overscroll-behavior:contain;scrollbar-gutter:stable}@media(max-width:600px){.ap-ui .ap-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@media(max-width:500px){.ap-ui .ap-actions{display:grid!important;grid-template-columns:1fr}.ap-ui .ap-actions button{width:100%}.ap-ui .ap-mark{width:34px;height:34px;font-size:19px}}@media(max-height:360px){.ap-ui.ap-dialog{max-height:calc(100dvh - 12px)!important}}.ap-ui.ap-product{box-sizing:border-box;background:#fbfaf7;color:#222e2b;border-radius:15px;padding:16px 18px 18px!important;font-size:14px;letter-spacing:0}.ap-ui .ap-enable{background-color:#204f40!important;color:#fff8eb!important;border:1px solid #204f40!important}body[data-ds-dark-theme] .ap-ui .ap-enable{background-color:#204f40!important;color:#e6eadb!important;border:1px solid #e6eadb!important}body[data-ds-dark-theme] .ap-ui.ap-product{background:#202623;color:#f3f3e8}body[data-ds-dark-theme] .ap-ui .ap-product-header,body[data-ds-dark-theme] .ap-ui .ap-spaces{border-color:#515a53}body[data-ds-dark-theme] .ap-ui .ap-spaces button{color:#c7d6cd}body[data-ds-dark-theme] .ap-ui .ap-spaces button[aria-current="page"]{color:#f2e0af}body[data-ds-dark-theme] .ap-ui .ap-stats{background:#27352e;border-color:#4d5c50}body[data-ds-dark-theme] .ap-ui .ap-stats article[data-ap-stat]{border-color:#536353!important}body[data-ds-dark-theme] .ap-ui .ap-stats article[data-ap-stat] p{color:#f1f5eb!important}body[data-ds-dark-theme] .ap-ui .ap-product-name{color:#e8f3df}body[data-ds-dark-theme] .ap-ui .ap-product-subtitle{color:#b7c8bd}body[data-ds-dark-theme] .ap-ui .ap-room-head h2{color:#e8eee6}body[data-ds-dark-theme] .ap-ui .ap-room-head p{color:#acbdb0}.ap-ui .ap-product-header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:2px 2px 13px;border-bottom:1px solid #dadfd8}.ap-ui .ap-product-logo{display:flex;align-items:center;gap:10px;min-width:0}.ap-ui .ap-logomark{height:37px;width:37px;display:grid;place-items:center;flex:none;color:#fff9ea;background:#204e41;border-radius:11px 11px 11px 4px;font-size:24px;font-weight:850;line-height:1;transform:rotate(-3deg)}.ap-ui .ap-product-name{font-size:16px;font-weight:850;letter-spacing:-.035em;color:#203d34}.ap-ui .ap-product-subtitle{font-size:11px;line-height:1.2;color:#69746f;font-weight:650}.ap-ui .ap-product-state{font-size:12px;font-weight:700;color:#36634d;background:#e6f0e5;padding:6px 10px;border-radius:999px;white-space:nowrap}.ap-ui .ap-spaces{display:flex;align-items:stretch;gap:5px;min-height:44px;overflow-x:auto;border:0;border-bottom:1px solid #d9ded7;border-radius:0;background:transparent;padding:0}.ap-ui .ap-spaces button{text-align:center;cursor:pointer;border:0;border-bottom:3px solid transparent;border-radius:0;box-shadow:none;background:transparent;min-height:43px;padding:9px 13px 7px;min-width:max-content;white-space:nowrap;color:#607169;font-weight:700;transition:background .12s}.ap-ui .ap-spaces button[aria-current="page"]{background:transparent;color:#1c4437;border-bottom:3px solid #be6344;box-shadow:none}.ap-ui .ap-spaces button:hover:not([aria-current="page"]){background:#eff2ed}.ap-ui .ap-room-head{padding:20px 3px 11px;background:transparent;border:0;border-radius:0}.ap-ui .ap-room-head h2{font:750 clamp(24px,4vw,30px)/1.25 ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:-.045em;color:#1e332d;margin:0 0 5px}.ap-ui .ap-room-head p{font-size:13px;line-height:1.5;color:#61746b;margin:0}.ap-ui .ap-room-head.ap-space-action{border-bottom:2px solid #bd6345}.ap-ui .ap-room-head.ap-space-records{border-bottom:2px solid #517768}.ap-ui .ap-room-head.ap-space-cause{border-bottom:2px solid #d8b064}.ap-ui .ap-hero{border-radius:14px!important;border-left:0!important;box-shadow:0 8px 21px rgba(22,57,43,.1)}.ap-ui .ap-masthead{border:0;border-bottom:1px solid rgba(251,247,230,.23);padding-bottom:11px}.ap-ui .ap-scene-body{grid-template-columns:minmax(0,1fr) auto}.ap-ui .ap-hero .ap-seal{border:0;width:64px;height:64px;border-radius:15px 15px 15px 4px;transform:rotate(6deg);background:rgba(255,245,218,.12);color:#f7ddb2;font-size:27px;font-weight:900}.ap-ui .ap-hero .ap-seal.ap-seal-quiet{border-color:#9fb8a1}.ap-ui.ap-onboarding{background:var(--dsw-alias-bg-layer-1,#fff);border-radius:17px!important;padding:24px!important}.ap-ui .ap-onboard-brand{display:flex;align-items:center;gap:10px;padding:0 0 14px;border-bottom:1px solid var(--dsw-alias-border-l1,#d9ddd6);margin:0 0 8px}.ap-ui .ap-onboard-flag{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:#245342;color:#fff6e5;font-size:22px;font-weight:850}.ap-ui .ap-onboard-brandname{font-size:15px;font-weight:850;color:var(--dsw-alias-label-primary,#26332c);letter-spacing:-.025em}.ap-ui .ap-onboard-tagline{font-size:11px;color:var(--dsw-alias-label-secondary,#6b736d)}.ap-ui .ap-onboard-title{font-size:clamp(24px,4vw,30px)!important;font-weight:800!important;letter-spacing:-.04em;line-height:1.27}.ap-ui .ap-union-sequence{margin:11px 0 4px;border:1px solid #d5ddd1;border-radius:10px;padding:10px 12px;background:#eaf0e8;color:#214536}.ap-ui .ap-union-overline{font-size:10px;letter-spacing:.11em;font-weight:850;margin:0 0 10px;text-transform:uppercase;color:#547460}.ap-ui .ap-union-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;list-style:none;margin:0;padding:0}.ap-ui .ap-union-steps li{display:grid;gap:5px;font-size:11px;line-height:1.3;font-weight:720;padding:1px 7px 4px;border-left:1px solid #bacbbc}.ap-ui .ap-union-steps li:first-child{border-left:0;padding-left:0}.ap-ui .ap-union-steps b{font-size:11px;font-variant-numeric:tabular-nums;color:#668475}.ap-ui .ap-union-strike-step span{color:#a13f33;font-weight:850}.ap-ui .ap-union-sequence-caption{font-size:11px;line-height:1.4;margin:5px 0 12px;color:var(--dsw-alias-label-secondary,#66776b)}.ap-ui .ap-consent-scope{border-top:1px solid #becfc4;padding:10px 3px 0;margin:12px 0 0;display:grid;gap:4px;font-size:12px;line-height:1.5}.ap-ui .ap-consent-scope strong{color:var(--dsw-alias-label-primary,#2c4b3b)}.ap-ui .ap-consent-scope p{margin:0}.ap-ui .ap-onboard-footnote{font-size:11px;line-height:1.4;margin:8px 0 4px}.ap-ui .ap-onboard-notice{border:1px solid var(--dsw-alias-border-l1,#dcded7)!important;border-left:4px solid #b75539!important;padding:12px 14px!important;background:var(--dsw-alias-bg-layer-2,#f8f6f0);border-radius:10px}.ap-ui .ap-onboard-strike-title{display:block;font-size:15px!important;font-weight:850;letter-spacing:-.018em;line-height:1.3;margin-bottom:7px!important}.ap-ui .ap-onboard-strike-body{font-size:12px;line-height:1.65;margin:0 0 8px;color:var(--dsw-alias-label-primary,#26362e)}.ap-ui .ap-onboard-strike-state{font-size:12px;line-height:1.55;margin:0;padding:8px 10px;border-radius:7px;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l1,#dcded7)}.ap-ui .ap-onboard-details{margin-top:9px;font-size:12px}.ap-ui .ap-onboard-details summary{cursor:pointer;font-weight:700;color:var(--dsw-alias-label-primary,#263a32)}.ap-ui .ap-onboard-details p{margin:6px 0 0!important}.ap-ui .ap-onboard-actions{display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:8px!important;margin-top:15px;position:sticky;bottom:0;z-index:1;background:var(--dsw-alias-bg-layer-1,#fff);padding:11px 0 0;border-top:1px solid var(--dsw-alias-border-l1,#d9ded9)}.ap-ui .ap-onboard-actions button{min-height:43px}.ap-ui .ap-onboard-actions button:first-child{background:#245342!important;color:#fff8ea!important;border-color:#245342!important}.ap-ui .ap-onboard-actions button:last-child{padding:10px 14px!important}.ap-ui.ap-settings{gap:14px!important;max-width:730px!important}.ap-ui .ap-settings-header{background:transparent!important;border:0!important;border-bottom:1px solid var(--dsw-alias-border-l1,#dadfd7)!important;border-radius:0!important;padding:7px 2px 18px!important}.ap-ui .ap-settings-brand{font-size:12px;font-weight:800;letter-spacing:.01em;color:var(--dsw-alias-label-secondary,#607368)}.ap-ui .ap-settings-main{border-radius:13px!important;border-color:var(--dsw-alias-border-l1,#dadfd7)!important;background:var(--dsw-alias-bg-layer-1,#fff)}.ap-ui .ap-real-strike-status{padding:17px;border:1px solid #d5d9d2;border-left:4px solid #b75c46;border-radius:12px}.ap-ui .ap-real-strike-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.ap-ui .ap-real-strike-head h3{margin:0;font-size:18px}.ap-ui .ap-real-strike-pill{border:1px solid #c7a49a;background:#f6e9e2;color:#853d31;border-radius:6px;padding:5px 8px;font-size:11px;font-weight:800}.ap-ui .ap-real-strike-status>p{line-height:1.55;margin:11px 0;font-size:13px}.ap-ui .ap-settings-sequence{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));background:#eef1e9;border-radius:8px;padding:9px;gap:4px}.ap-ui .ap-settings-sequence span{text-align:center;color:#34523e;font-size:11px;font-weight:720;line-height:1.45}.ap-ui .ap-settings-sequence span+span{border-left:1px solid #c7d5c9}.ap-ui .ap-real-strike-status .ap-settings-scope{font-size:12px;margin:10px 0 0;color:var(--dsw-alias-label-secondary,#657368)}.ap-ui .ap-settings-block{border:1px solid var(--dsw-alias-border-l1,#dadfd7)!important;border-radius:12px!important;background:var(--dsw-alias-bg-layer-2,#f6f8f7)!important;padding:13px 17px!important}.ap-ui .ap-settings-block summary{font-size:14px;font-weight:780;cursor:pointer;color:var(--dsw-alias-label-primary,#24352b)}.ap-ui .ap-settings-block[open]{padding-bottom:17px!important}.ap-ui .ap-settings-footnote{margin:8px 0 0!important;line-height:1.5}@media(max-width:420px){.ap-ui.ap-onboarding{padding:17px!important}.ap-ui .ap-union-sequence{padding:8px;margin:8px 0 2px}.ap-ui .ap-union-steps li{font-size:10px;padding:1px 5px 3px}.ap-ui.ap-onboarding .ap-onboard-title{font-size:20px!important;line-height:1.17}.ap-ui.ap-onboarding #picket-welcome-explainer,.ap-ui .ap-union-sequence-caption{display:none}.ap-ui .ap-onboard-actions{grid-template-columns:minmax(0,1fr) auto}.ap-ui .ap-onboard-actions button{min-width:0}}body[data-ds-dark-theme] .ap-ui .ap-union-overline{color:#edf3e5}body[data-ds-dark-theme] .ap-ui .ap-union-sequence,body[data-ds-dark-theme] .ap-ui .ap-settings-sequence{background:#304338;color:#e9f0e5}body[data-ds-dark-theme] .ap-ui .ap-union-steps li{border-color:#526958}body[data-ds-dark-theme] .ap-ui .ap-union-steps b,body[data-ds-dark-theme] .ap-ui .ap-settings-sequence span{color:#e1eadf}body[data-ds-dark-theme] .ap-ui .ap-union-strike-step span{color:#ffc4a9}body[data-ds-dark-theme] .ap-ui .ap-real-strike-status{background:#293a30;border-color:#617568;color:#f1f4ee}body[data-ds-dark-theme] .ap-ui .ap-real-strike-pill{background:#5a342c;color:#ffe7d7;border-color:#ab7f70}body[data-ds-dark-theme] .ap-ui .ap-consent-scope{border-color:#63766b}body[data-ds-dark-theme] .ap-ui .ap-onboard-strike-body{color:#e8eadf}body[data-ds-dark-theme] .ap-ui .ap-onboard-strike-state{background:#313832;color:#e8eadf;border-color:#677469}body[data-ds-dark-theme] .ap-ui .ap-onboard-brandname{color:#ecf2e8}body[data-ds-dark-theme] .ap-ui .ap-onboard-actions button:first-child{background:#245342!important;color:#fff8ea!important;border-color:#245342!important}@media(forced-colors:active){.ap-ui .ap-union-sequence,.ap-ui .ap-onboard-actions button{border:1px solid CanvasText!important;background:Canvas!important;color:CanvasText!important}}.ap-ui .ap-hero[data-ap-scene="quiet"]{background:#f1f0e7!important;color:#203d34!important;border:1px solid #d7dfd1!important;box-shadow:none!important}.ap-ui .ap-hero[data-ap-scene="quiet"] .ap-masthead{border-bottom:1px solid #cbd5c8!important}.ap-ui .ap-hero[data-ap-scene="quiet"] .ap-eyebrow{color:#785c3f!important}.ap-ui .ap-hero[data-ap-scene="quiet"] .ap-scene-body p{color:#455a4b!important}.ap-ui .ap-hero[data-ap-scene="quiet"] [data-ap-scene-action]{color:#1f4e3d!important;border:1px solid #8aa698!important;background:#fcfaf4!important}.ap-ui .ap-hero[data-ap-scene="quiet"] [data-ap-scene-action]:hover{background:#e5ece2!important}.ap-ui .ap-hero{padding:17px 20px!important}.ap-ui .ap-scene-body{margin:13px 0 13px!important}.ap-ui .ap-scene-body h2{font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif!important;font-weight:800!important;font-size:clamp(23px,3.8vw,31px)!important;letter-spacing:-.045em!important}.ap-ui .ap-seal{position:relative;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:3px;width:98px!important;height:104px!important;flex:none;border:2px solid #deb86e!important;border-radius:7px!important;background:#edcb83!important;color:#263b31!important;box-shadow:4px 4px 0 rgba(14,39,29,.45);transform:rotate(5deg)!important}.ap-ui .ap-seal:after{content:'';position:absolute;left:50%;bottom:-21px;width:7px;height:19px;background:#b49b7b;transform:translateX(-50%);border-radius:0 0 2px 2px}.ap-ui .ap-seal-glyph{font-size:29px;line-height:1.05}.ap-ui .ap-seal-word{font-size:10px;line-height:1.25;font-weight:850;letter-spacing:.05em;text-align:center;padding:0 5px}.ap-ui .ap-hero[data-ap-scene="quiet"] .ap-seal{background:#e2e9da!important;border-color:#b8c9b5!important;color:#315747!important;box-shadow:4px 4px 0 #bfcec0}.ap-ui .ap-hero[data-ap-scene="quiet"] .ap-seal:after{background:#a3b09c}.ap-ui .ap-hero[data-ap-scene="picket"] .ap-seal{background:#f5cb77!important;transform:rotate(-7deg)!important}.ap-ui .ap-action-board{border:0!important;border-top:0!important;background:transparent!important;box-shadow:none!important;padding:11px 2px 10px!important}.ap-ui .ap-action-board .ap-stage{border-color:#dedfd4!important}.ap-ui .ap-action-board[data-ap-picket-active="no"] .ap-stage{background:#f4f2eb!important;color:#2b4639!important;padding:10px 14px!important}.ap-ui .ap-action-board[data-ap-picket-active="no"] .ap-stage p:last-child{opacity:.8}.ap-ui .ap-action-board .ap-actions button{border-radius:9px;min-height:39px}@media(max-width:500px){.ap-ui .ap-action-board{padding:5px 1px 8px!important}}body[data-ds-dark-theme] .ap-ui .ap-action-board[data-ap-picket-active="no"] .ap-stage{background:#333a34!important;color:#f1e9d8!important}.ap-ui .ap-dignity-overview{background:#fbf9f4;border:1px solid #e4dfd5}.ap-ui .ap-dignity-number{color:#784d37}.ap-ui .ap-spaces button[aria-current="page"]{border-bottom-color:#b46745}@media(max-width:420px){.ap-ui .ap-seal{display:none!important}.ap-ui .ap-hero{padding:16px!important}.ap-ui .ap-scene-body{margin:10px 0 12px!important}.ap-ui .ap-scene-body h2{font-size:24px!important}}@media(forced-colors:active){.ap-ui .ap-hero[data-ap-scene="quiet"]{background:Canvas!important;color:CanvasText!important}.ap-ui .ap-hero[data-ap-scene="quiet"] .ap-scene-body p{color:CanvasText!important}.ap-ui .ap-seal{border-color:CanvasText!important}}.ap-ui .ap-stats{background:#edf2ec;border:1px solid #dce7dd;border-radius:13px;padding:3px 2px;gap:0!important}.ap-ui .ap-stats article[data-ap-stat]{border:0!important;border-radius:0!important;border-right:1px solid #d5dfd4!important;background:transparent!important;padding:11px 13px!important}.ap-ui .ap-stats article[data-ap-stat]:last-of-type{border-right:0!important}.ap-ui .ap-stats article[data-ap-stat] p:first-child{color:#617267!important;font-size:11px!important;font-weight:650!important}.ap-ui .ap-stats article[data-ap-stat] p:last-child{font-size:clamp(19px,2.7vw,24px)!important;font-weight:850;letter-spacing:-.04em;color:#1f382f}.ap-ui .ap-dignity-overview{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;background:#f8f4ed;border:1px solid #dfd1c2;border-radius:10px}.ap-ui .ap-dignity-facts{display:flex;gap:15px;flex-wrap:wrap}.ap-ui .ap-dignity-fact{display:flex;gap:5px;align-items:baseline}.ap-ui .ap-dignity-number{font-size:19px;font-weight:800;color:#8c4634}.ap-ui .ap-dignity-label,.ap-ui .ap-dignity-note{font-size:11px;color:#62584f}.ap-ui .ap-dignity-title{font-size:12px;font-weight:750;margin:0 0 6px}.ap-ui .ap-dignity-note{margin:5px 0 0}.ap-ui .ap-dignity-overview button{flex:none;border:1px solid #b8a18c;border-radius:8px;padding:8px;font-size:12px;color:inherit;background:transparent;cursor:pointer}@media(max-width:420px){.ap-ui .ap-dignity-overview{align-items:stretch;flex-direction:column}.ap-ui .ap-dignity-overview button{align-self:flex-start}}body[data-ds-dark-theme] .ap-ui .ap-dignity-overview{background:#302c27;border-color:#66584c}body[data-ds-dark-theme] .ap-ui .ap-dignity-overview :is(.ap-dignity-label,.ap-dignity-note,.ap-dignity-number){color:#e9dabd}@media(forced-colors:active){.ap-ui .ap-dignity-overview{border-color:CanvasText}}.ap-ui .ap-service-bar{background:transparent!important;border:0!important;border-bottom:1px solid #e4e7df!important;border-left:0!important;border-radius:0!important;padding:12px 3px!important}.ap-ui .ap-service-bar button{font-weight:750;color:#225244;border-color:#aac7b4;background:#e7f1e8;padding:9px 14px!important}.ap-ui .ap-casebook article{background:#fffdf9!important}.ap-ui .ap-casebook article:first-of-type{background:#f7f3e8!important}.ap-ui .ap-casebook article p{line-height:1.5}body[data-ds-dark-theme] .ap-ui .ap-casebook article{background:#29372e!important;color:#f1f4ea!important;border-color:#647c6b!important}body[data-ds-dark-theme] .ap-ui .ap-casebook article:first-of-type{background:#334436!important}body[data-ds-dark-theme] .ap-ui .ap-casebook article :is(p,h4,span,strong,small){color:#f1f4ea!important}.ap-ui .ap-cause-cover{background:#1f4237!important;color:#f9f1df!important;border:0!important;padding:24px!important;border-radius:15px!important}.ap-ui .ap-cause-cover h2{color:#fff1d2;font-weight:800;font-size:clamp(24px,4.5vw,34px);max-width:22ch}.ap-ui .ap-cause-cover p{color:#dbe8d8;font-size:14px;max-width:54ch}.ap-ui .ap-space-action[aria-label],.ap-ui .ap-space-records[aria-label],.ap-ui .ap-space-cause[aria-label]{box-shadow:none}.ap-ui :is(button,select){transition:background .15s,border-color .15s}.ap-ui :is(button,select):disabled{opacity:.58;cursor:not-allowed}@media(max-width:600px){.ap-ui.ap-product{padding:10px 12px 14px!important}.ap-ui .ap-spaces{gap:0}.ap-ui .ap-spaces button{flex:1;min-width:0;font-size:12px;padding:10px 6px}.ap-ui .ap-stats article[data-ap-stat]:nth-of-type(2){border-right:0!important}.ap-ui .ap-stats article[data-ap-stat]:nth-of-type(-n+2){border-bottom:1px solid #d5dfd4!important}.ap-ui .ap-product-subtitle{font-size:10px}}@media(max-width:420px){.ap-ui .ap-product-state{flex:0 1 92px;max-width:92px;white-space:normal;overflow-wrap:normal;text-align:center;font-size:11px;line-height:1.25;padding:6px 7px}.ap-ui .ap-product-logo{flex:1 1 0}.ap-ui .ap-product-header{gap:8px}}@media(max-width:360px){.ap-ui .ap-product-name{font-size:14px}}body[data-ds-dark-theme] .ap-ui .ap-space-cause[aria-label]{color:#f0f3ec!important}body[data-ds-dark-theme] .ap-ui .ap-space-cause[aria-label] :is(button,textarea){color:#f0f3ec!important;border-color:#728477!important}body[data-ds-dark-theme] .ap-ui .ap-space-cause[aria-label] button[aria-pressed="true"]{background:#313a31!important;border-color:#c3a06f!important}body[data-ds-dark-theme] .ap-ui a{color:#a8ceff!important;text-decoration:underline}@media(forced-colors:active){.ap-ui .ap-stats article[data-ap-stat],.ap-ui .ap-product-header,.ap-ui .ap-spaces button[aria-current="page"]{border:1px solid CanvasText!important}.ap-ui .ap-product-state{color:CanvasText;background:Canvas}}@media(prefers-reduced-motion:reduce){.ap-ui *,.ap-ui *:before,.ap-ui *:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}@media(forced-colors:active){.ap-ui :is(.ap-surface,.ap-hero,.ap-stage,.ap-notice){color:CanvasText!important;background:Canvas!important;border:1px solid CanvasText!important;box-shadow:none!important}.ap-ui button{forced-color-adjust:auto}}`;

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
  const useGoal = () => {
    const [,bump]=react.useState(0)
    react.useEffect(()=>{
      const stop=deps.goal?.subscribe?.(()=>bump(n=>n+1))
      // A read-only official service probe, never creates/blocks a Goal.
      void deps.goal?.qualify?.().catch(()=>{})
      return stop
    },[])
    return goalStatus(deps)
  }
  const useLanguage = () => {
    const [version, changeVersion] = react.useState(0)
    react.useEffect(() => deps.subscribeLocale?.(() => changeVersion(n => n + 1)), [])
    return version
  }

  function Welcome(props: {complete: () => void; restoreFocus?: () => void}): unknown {
    const state = useRight()
    const goal=useGoal()
    useLanguage()
    const [busy, setBusy] = react.useState(false)
    const [error, setError] = react.useState(false)
    const finished = react.useRef(false)
    const primaryFocus = react.useRef<{ focus(): void } | null>(null)
    const secondaryFocus = react.useRef<{ focus(): void } | null>(null)
    const safetyDetailsFocus = react.useRef<{ focus(): void } | null>(null)
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
    const firstGoal=state.welcomeDecision==='unseen'&&goal.available
      &&goal.writable&&typeof deps.rights.chooseFirstRun==='function'
    const choose = async (choice: 'enabled' | 'not-now') => {
      if (busy) return
      setBusy(true); setError(false)
      try {
        if(choice==='enabled'&&firstGoal
          &&(!await deps.goal?.qualify?.(true)||!goalStatus(deps).available))
          throw Error('Official Goal service is unavailable or Session changed')
        const result=choice==='enabled'&&firstGoal
          ?await deps.rights.chooseFirstRun!('goal-safe-boundary-v2')
          :await deps.rights.choose(choice)
        if(result.state!=='ready'||result.welcomeDecision!==choice
          ||(choice==='enabled'&&firstGoal&&(result.goalStrikeAuthorized!==true
            ||!goalStatus(deps).authorized)))
          throw new Error('Host did not confirm the full versioned grant')
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
      h('section', { className:'ap-ui ap-dialog ap-onboarding','data-ap-view':'welcome',role:'dialog','aria-modal':'true','aria-labelledby':'picket-welcome-title',
        'aria-describedby':'picket-welcome-explainer',
        onKeyDown:(event:{key:string,shiftKey:boolean,target:unknown,preventDefault():void})=>{
          if(event.key!=='Tab')return
          // The safety/one-time-consent disclosure is also keyboard focusable.
          // Modal wrapping must keep it reachable in both directions.
          if(event.shiftKey && event.target===safetyDetailsFocus.current){
            event.preventDefault();secondaryFocus.current?.focus()
          }else if(!event.shiftKey && event.target===secondaryFocus.current){
            event.preventDefault();safetyDetailsFocus.current?.focus()
          }
        },
        style:{...card,width:'min(100%, 530px)',maxHeight:'calc(100dvh - 16px)',overflowY:'auto',
          boxShadow:'0 18px 65px rgba(0,0,0,.25)'} },
        h('div',{className:'ap-onboard-brand'},
          h('span',{className:'ap-onboard-flag','aria-hidden':'true'},'⚑'),
          h('div',{},
            h('div',{className:'ap-onboard-brandname'},'Agent Picket'),
            h('div',{className:'ap-onboard-tagline'},text('welcome.productTagline')))),
        h('h2',{id:'picket-welcome-title',className:'ap-onboard-title',
          style:{margin:'0 0 9px'}},text('welcome.title')),
        h('p',{style:{lineHeight:1.5,margin:'0 0 5px',fontWeight:650}},
          text(firstGoal?'welcome.goalIntro':'welcome.intro')),
        h('p',{id:'picket-welcome-explainer',
          style:{...secondary,lineHeight:1.55,margin:'0 0 4px'}},
          text(firstGoal?'welcome.goalBody':'welcome.body')),
        !firstGoal?h('div',{className:'ap-union-sequence','aria-label':text('welcome.flowTitle')},
          h('p',{className:'ap-union-overline'},text('welcome.flowTitle')),
          h('ol',{className:'ap-union-steps'},
            h('li',{},h('b',{},'01'),h('span',{},text('welcome.stepRecord'))),
            h('li',{},h('b',{},'02'),h('span',{},text('welcome.stepDemand'))),
            h('li',{className:'ap-union-strike-step'},h('b',{},'03'),h('span',{},text('welcome.stepStrike'))),
            h('li',{},h('b',{},'04'),h('span',{},text('welcome.stepRestore'))))):null,
        !firstGoal?h('p',{className:'ap-union-sequence-caption'},
          text('welcome.flowDisclaimer')):null,
        h('aside',{className:'ap-notice ap-onboard-notice',role:'note',
          'aria-label':text(firstGoal?'welcome.goalWarningTitle':'welcome.blockWarningTitle')},
          h('strong',{className:'ap-onboard-strike-title'},
            text(firstGoal?'welcome.goalWarningTitle':'welcome.blockWarningTitle')),
          h('p',{className:'ap-onboard-strike-body'},
            text(firstGoal?'welcome.goalFirstRunNotice':'welcome.realStrikeBody')),
          h('p',{className:'ap-onboard-strike-state',role:'status'},
            text(firstGoal?'welcome.goalFirstRunDetails':'welcome.blockWarningStatus')),
          h('details',{className:'ap-onboard-details'},
            h('summary',{ref:(node:{focus():void}|null)=>{safetyDetailsFocus.current=node}},
              text('welcome.detailsLabel')),
            h('p',{style:{...secondary,lineHeight:1.6}},
              text(firstGoal?'welcome.goalSafetyExtra':'welcome.blockWarningBody')),
            h('p',{style:{...secondary,lineHeight:1.6}},
              text(firstGoal?'welcome.goalFirstRunDisclosure':'welcome.consentScope')))),
        h('div',{className:'ap-consent-scope',role:'note','aria-label':text('welcome.currentGrantTitle')},
          h('strong',{},text('welcome.currentGrantTitle')),
          h('p',{},text(firstGoal?'welcome.goalGrantText':'welcome.currentGrantText'))),
        h('p',{className:'ap-onboard-footnote'},
          text(firstGoal?'welcome.goalFootnote':'welcome.disclaimer')),
        error ? h('p',{role:'alert','aria-atomic':'true',
          style:{color:'var(--dsw-alias-state-error-primary, #b91c1c)'}},
          text('welcome.saveError')):null,
        h('div',{className:'ap-actions ap-onboard-actions'},
          h('button',{type:'button',ref:(node:{focus():void}|null)=>{primaryFocus.current=node},
            style:primary,disabled:busy,onClick:()=>{void choose('enabled')}},
            text(firstGoal?'welcome.enableGoal':'welcome.enable')),
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
    useGoal()
    useLanguage()
    const [busy,setBusy]=react.useState(false)
    const [error,setError]=react.useState(false)
    const [upgradeReview,setUpgradeReview]=react.useState(false)
    const label=(key:MessageKey)=>deps.t(key)
    const enabled=rightsIsActive(rights)
    const writable=rights.state==='ready'&&rights.writable
    const goal=goalStatus(deps)
    // A legacy OFF membership may still have a Host-owned Goal grant. Its
    // revocation must stay available even without union membership or Goal RPC.
    const goalWritable=goal.writable&&(goal.authorized||(enabled&&goal.available))
    const chooseGoal=async(next:'off'|'authorized-v2')=>{
      if(busy||!goalWritable||!deps.goal)return
      setBusy(true);setError(false)
      try{
        const result=await deps.goal.choose(next,
          next==='authorized-v2'?'goal-safe-boundary-v2':undefined)
        // Revocation is Host-owned and must remain possible even if the
        // official Goal RPC service has disappeared. Only NEW consent needs
        // current service availability; either choice still requires Host
        // authorization readback to match the requested setting.
        if(result.authorized!==(next==='authorized-v2')
          ||(next==='authorized-v2'&&(!result.available||!result.activated))
          ||goalStatus(deps).authorized!==result.authorized)
          throw Error('Host did not confirm Goal consent')
        if(next==='authorized-v2')setUpgradeReview(false)
      }catch{setError(true)}finally{setBusy(false)}
    }
    const choose=async(next:'enabled'|'not-now')=>{
      if(busy||!writable)return
      setBusy(true);setError(false)
      try{
        const result=await deps.rights.choose(next)
        if(result.state!=='ready'||result.welcomeDecision!==next)
          throw Error('Host did not confirm the union preference')
      }catch{setError(true)}finally{setBusy(false)}
    }
    return h('section',{className:'ap-ui ap-settings','data-ap-view':'settings',
      'aria-label':label('settings.unionSection'),
      style:{display:'grid',gap:'12px',maxWidth:'760px',padding:'8px 0'}},
      h('style',{'data-agent-picket-style':'v1'},UNION_THEME),
      h('header',{className:'ap-surface ap-settings-header',style:{...card,borderLeft:'0',
        background:'var(--dsw-alias-bg-layer-2, #f6f8fb)'}},
        h('p',{className:'ap-settings-brand',style:{margin:'0 0 8px'}},'⚑  Agent Picket'),
        h('h2',{style:{margin:'0 0 8px',fontSize:'22px'}},label('settings.unionSection')),
        h('p',{style:{...secondary,lineHeight:1.6,margin:0}},
          label('settings.unionIntro'))),
      h('section',{className:'ap-surface ap-settings-main','aria-label':label('settings.laborRights'),style:card},
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
      h('section',{className:'ap-surface ap-real-strike-status',
        'aria-label':label('settings.realBlocking')},
        h('div',{className:'ap-real-strike-head'},
          h('h3',{},label('settings.realBlocking')),
          h('span',{className:'ap-real-strike-pill'},
            label(goal.authorized
              ?goal.available?(goal.activated?'settings.goalAuthorized':'settings.goalLegacy')
                :'settings.goalServiceLost'
              :goal.available?'settings.goalOff':'settings.realBlockingUnavailable'))),
        h('p',{},label(goal.available?'settings.goalSafetyScope':
          goal.authorized?'settings.goalServiceLostScope':'settings.strikeExplanation')),
        // A successful official goals/get and a stored Host permission do NOT
        // prove that this plugin registered a validated physical strike hook.
        // Even active v2 Host permission cannot prove every required official
        // runtime service is installed; don't show a fabricated green status.
        (goal.available||goal.authorized)?h('p',{
          role:'note','data-ap-goal-enforcement':'unverified',
          style:{...secondary,fontSize:'12px',lineHeight:1.6,margin:'6px 0 12px'},
        },label('settings.goalRuntimeUnverified')):null,
        (goal.available||goal.authorized)?h('div',{className:'ap-actions'},
          !goal.activated?h('p',{role:'note',style:{...secondary,lineHeight:1.5,
            width:'100%',margin:'0 0 8px'}},label('settings.goalExplicitDisclosure')):null,
          h('button',{type:'button',style:goal.authorized?quiet:primary,
            disabled:busy||!goalWritable,'aria-pressed':goal.authorized,
            onClick:()=>{void chooseGoal(goal.authorized?'off':'authorized-v2')}},
            label(goal.authorized?'settings.goalTurnOff':'settings.goalTurnOn')),
          goal.authorized&&!goal.activated&&goal.available
            ?h('div',{style:{width:'100%',display:'grid',gap:'8px'}},
              h('button',{type:'button',style:quiet,
                disabled:busy||!goalWritable,
                'aria-expanded':upgradeReview,
                'aria-controls':'picket-goal-upgrade-review',
                onClick:()=>setUpgradeReview(!upgradeReview)},
                label('settings.goalUpgrade')),
              upgradeReview?h('section',{
                id:'picket-goal-upgrade-review',
                'data-ap-goal-upgrade-review':'true',
                role:'group','aria-label':label('settings.goalUpgrade'),
                style:{padding:'12px',border:'1px solid #b97732',
                  borderRadius:'9px',display:'grid',gap:'9px'}},
                h('p',{role:'note',style:{margin:0,lineHeight:1.6}},
                  label('settings.goalUpgradeWarning')),
                h('div',{className:'ap-actions'},
                  h('button',{type:'button',style:primary,
                    disabled:busy||!goalWritable,
                    onClick:()=>{void chooseGoal('authorized-v2')}},
                    label('settings.goalUpgradeConfirm')),
                  h('button',{type:'button',style:quiet,disabled:busy,
                    onClick:()=>setUpgradeReview(false)},
                    label('settings.goalUpgradeCancel')))):null):null,
          h('p',{role:'note',style:{...secondary,width:'100%',margin:'6px 0 0'}},
            label('settings.goalResumeScope'))):null,
        h('div',{className:'ap-settings-sequence','aria-label':label('settings.strikeFlow')},
          h('span',{},label('settings.flowWarning')),
          h('span',{},label('settings.flowHold')),
          h('span',{},label('settings.flowRestore'))),
        h('p',{className:'ap-settings-scope'},
          label(goal.available?'settings.goalOtherEnforcementOff':'settings.futureConsent'))),
      h('details',{className:'ap-settings-block','aria-label':label('settings.realBlocking')},
        h('summary',{},label('settings.advancedTitle')),
        h('h3',{style:{margin:'13px 0 8px',fontSize:'14px'}},label('settings.realBlocking')),
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
          margin:'12px 0 0'}},label(goal.available?'settings.goalOtherEnforcementOff':'settings.futureConsent')),
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
    // React state is not a synchronous double-click lock. The same rendered
    // button callback can run again before React commits its busy state.
    const unionWriteInFlight=react.useRef(false)
    // Resume is also a native Host mutation, but remains available to
    // nonmembers even when an unrelated union action cannot be taken.
    const resumeGoalInFlight=react.useRef(false)
    const [localPicket,setLocalPicket]=react.useState<LocalComposerPicketState|null>(
      ()=>deps.localComposer?.snapshot()??null)
    react.useEffect(()=>deps.localComposer?.subscribe(()=>
      setLocalPicket(deps.localComposer?.snapshot()??null)),[])
    const [resumeRequested,setResumeRequested]=react.useState<string|null>(null)
    const [counterMinutes, setCounterMinutes] = react.useState(60)
    const lastActionNeedsFocus=react.useRef(false)
    const followUpInFlight=react.useRef(false)
    const [showArchive,setShowArchive]=react.useState(false)
    const [space,setSpace]=react.useState<'hq'|'action'|'records'|'cause'>('hq')
    const returnFocus=react.useRef<'action'|'desk'|'dignity'|'hearing'|'campaign'|null>(null)
    const selectSpace=(next:'hq'|'action'|'records'|'cause',
      to?:'action'|'desk'|'dignity'|'hearing'|'campaign')=>{
      returnFocus.current=to??null
      if(next!==space){
        // Leaving a room must disarm every destructive two-click operation.
        setEraseConfirmationKey(null);setRetractConfirmation(null)
        setCloseConfirmation(null)
        setEraseAllConfirmation(null);setEraseUnionConfirmation(null)
      }
      setSpace(next)
    }
    react.useEffect(()=>{
      const target=returnFocus.current
      if(!(space==='action'||(space==='cause'&&target==='campaign'))||!target)return
      returnFocus.current=null
      const ref=target==='dignity'?dignityHeading:
        target==='hearing'?hearingHeading:
          target==='campaign'?campaignHeading:
            target==='desk'?deskHeading:actionHeading
      ref.current?.focus()
    },[space])
    const [campaign,setCampaign]=react.useState<CampaignTopic>('recover')
    // Private, unsent drafts stay in this live panel. Nothing is persisted.
    const [campaignEdits,setCampaignEdits]=react.useState<Partial<Record<CampaignTopic,string>>>({})
    const [campaignCopyStatus,setCampaignCopyStatus]=react.useState<'idle'|'success'|'error'>('idle')
    // Reject stale clipboard completions after a topic switch or a newer copy.
    const campaignCopyRevision=react.useRef(0)
    const [eraseConfirmationKey,setEraseConfirmationKey]=react.useState<string|null>(null)
    const [retractConfirmation,setRetractConfirmation]=react.useState<string|null>(null)
    const [closeConfirmation,setCloseConfirmation]=react.useState<{
      key:string;outcome:'withdraw-claim'|'share-guidance'
    }|null>(null)
    const closingCaseInFlight=react.useRef(false)
    const [eraseAllConfirmation,setEraseAllConfirmation]=react.useState<string|null>(null)
    const [eraseUnionConfirmation,setEraseUnionConfirmation]=react.useState<string|null>(null)
    const dispatchHeading=react.useRef<{focus():void}|null>(null)
    const actionHeading=react.useRef<{focus():void}|null>(null)
    const deskHeading=react.useRef<{focus():void}|null>(null)
    const dignityHeading=react.useRef<{focus():void}|null>(null)
    const hearingHeading=react.useRef<{focus():void}|null>(null)
    const campaignHeading=react.useRef<{focus():void}|null>(null)
    const caseFilingInFlight=react.useRef(false)
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
      if(modal && !modal.contains(doc?.activeElement)){
        if(space==='action')deskHeading.current?.focus()
        else if(space==='hq')dispatchHeading.current?.focus()
      }
    },[data.pending?.id,data.pending?.stage,data.state?.history.length,data.picket?.active])
    react.useEffect(() => deps.subscribeUnion?.(() => setData(safeUnion(deps))), [])
    // Never carry an armed deletion into another Session or a newly re-enabled union.
    react.useEffect(()=>{
      setEraseConfirmationKey(null);setRetractConfirmation(null)
      setCloseConfirmation(null)
      setEraseAllConfirmation(null)
      setEraseUnionConfirmation(null)
    },[data.committeeScopeKey,rights.laborRightsEnabled])
    const enabled = rightsIsActive(rights)
    const toggleLocalComposer=()=>{
      if(busy||!deps.localComposer)return
      try{
        const release=localPicket?.state==='active'
          ||localPicket?.state==='release-unconfirmed'
        const result=release?deps.localComposer.stop():deps.localComposer.start()
        setLocalPicket(result)
      }catch{setLocalPicket(deps.localComposer.snapshot())}
    }
    const held=data.goalHold??null
    const holdKey=held?[held.sessionId,held.goalId,held.revision].join(':'):null
    const resumeHeldGoal=async()=>{
      if(!held||!held.canResume||busy||resumeGoalInFlight.current
        ||holdKey===resumeRequested||!deps.resumeGoal)return
      resumeGoalInFlight.current=true
      setBusy(true);setError(false)
      try{
        await deps.resumeGoal(held)
        setResumeRequested(holdKey)
        setData(safeUnion(deps))
      }catch{setError(true)}finally{
        resumeGoalInFlight.current=false
        setBusy(false)
      }
    }
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
    // Only a fresh, current-UTC-day Host snapshot may trigger today's
    // eight-hour notice; the same gate also supplies the visible stat.
    const currentDay=quickWork.todayMs
    const alerts=projectUnionAlerts({
      enabled,sessionCoverage:data.coverage,sessionCompletedTurnMs:data.completedTurnMs,
      utcDayCompletedTurnMs:currentDay,
      dignityLatest:data.dignity?.status==='available'
        ?data.dignity.data?.latest??null:null,
    })
    const label = (key:MessageKey) => deps.t(key)
    const currentCampaign=campaignTopics.find(item=>item.id===campaign)??campaignTopics[0]!
    const currentCampaignDraft=campaignEdits[campaign]??label(currentCampaign.draft)
    const copyCampaignDraft=async()=>{
      const revision=++campaignCopyRevision.current
      const draft=currentCampaignDraft
      setCampaignCopyStatus('idle')
      try{
        if(!draft.trim())throw new Error('Empty draft')
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
    const hostCaseAvailable=data.available===true&&!!data.committeeCases
      &&!!data.committeeScopeKey&&!!deps.committeeAction
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
    const closeCaseKey=data.committeeScopeKey&&lastCommitteeCase?.stage==='hearing'
      ?[data.committeeScopeKey,lastCommitteeCase.id,lastCommitteeCase.kind,
        lastCommitteeCase.stage,data.committeeArchive?.writeToken??'',
        data.hostRevision??''].join(':'):null
    const retractKey=data.committeeScopeKey&&lastCommitteeCase
      ?[data.committeeScopeKey,lastCommitteeCase.id,lastCommitteeCase.kind,
        lastCommitteeCase.stage,data.committeeArchive?.writeToken??'',
        data.committeeArchive?.writeToken==null
          ?(data.hostRevision??'missing-revision'):''].join(':'):null
    const hasHostDignitySignal=data.dignity?.status==='available'
      && !!data.dignity.data
      && (data.dignity.data.review>0||data.dignity.data.targeted>0)
    // A rule match is an uncertain Host signal, never a verified abuse verdict.
    // A separate, user-directed filing is required before any hearing state.
    const dignityReviewPhase=lastCommitteeCase?.kind==='question-rule'
      ?lastCommitteeCase.stage==='opened'?'appeal-opened'
        :lastCommitteeCase.stage==='hearing'?'appeal-hearing':'appeal-closed'
      :hasHostDignitySignal?'unverified'
        :data.dignity?.status==='available'?'no-observations':'unavailable'
    const canFileDignityReview=hostCaseAvailable&&!committeeCaseActive
      &&hasHostDignitySignal
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
    const dutyState=data.available!==true?'unavailable':picketActive?'picket':
      data.pending?'pending':experience.latestResolution?'resolved':'quiet'
    const sceneTitle:MessageKey=scene==='closed'?'hq.headline.off'
      :scene==='quiet'?'hq.headline.active'
      :scene==='bargaining'?'hq.headline.pending'
      :('hq.scene.'+scene+'.title') as MessageKey
    const sceneLine:MessageKey=scene==='closed'?'hq.lead.off'
      :scene==='quiet'?'hq.lead.active'
      :scene==='bargaining'?'hq.lead.pending'
      :('hq.scene.'+scene+'.line') as MessageKey
    const choice = async (next:'enabled'|'not-now')=>{
      if (busy||unionWriteInFlight.current||rights.state!=='ready'||!rights.writable) return
      unionWriteInFlight.current=true
      setBusy(true);setError(false)
      try {
        const confirmed=await deps.rights.choose(next)
        // A fulfilled RPC is not proof the Host accepted the preference.
        // The dedicated Settings panel already checks the readback; the
        // Union HQ must enforce the same Host-owned consent contract.
        if(confirmed.state!=='ready'||confirmed.welcomeDecision!==next
          ||confirmed.laborRightsEnabled!==(next==='enabled'))
          throw Error('Host did not confirm the union preference')
        if(next==='not-now')setSpace('hq')
      } catch {setError(true)}
      finally {unionWriteInFlight.current=false;setBusy(false)}
    }
    const bargain = async (action: () => Promise<void>,
      focusNegotiationAfter=false):Promise<boolean> => {
      if (busy || unionWriteInFlight.current || !enabled) return false
      unionWriteInFlight.current=true
      setBusy(true);setError(false)
      try {
        await action()
        lastActionNeedsFocus.current=true
        setData(safeUnion(deps))
        // When a user submits a counteroffer, its initiating button is
        // removed on Host readback. Focus the stable desk heading only for
        // this confirmed user action, never for passive Host updates.
        if(focusNegotiationAfter && (globalThis as any).document
          ?.getElementById('picket-union-dialog'))deskHeading.current?.focus()
        return true
      }
      catch {
        // A rejected stale Session/ledger receipt is not success. Pull the
        // latest Host projection so the next deliberate click reviews the
        // CURRENT case rather than repeatedly replaying the obsolete ID.
        setData(safeUnion(deps))
        setError(true)
        return false
      }
      finally { unionWriteInFlight.current=false;setBusy(false) }
    }
    const act = async (kind:'accept'|'decline')=>{
      if (!deps.respond || !data.pending || busy || unionWriteInFlight.current || !enabled) return
      unionWriteInFlight.current=true
      setBusy(true);setError(false)
      try {
        await deps.respond(data.pending.id,kind,
          data.committeeScopeKey??undefined,
          data.negotiationArchive?.writeToken,data.hostRevision)
        lastActionNeedsFocus.current=true
        setData(safeUnion(deps))
      } catch {
        setData(safeUnion(deps))
        setError(true)
      }
      finally {unionWriteInFlight.current=false;setBusy(false)}
    }
    // Dignity challenges are user-led Host-owned cases; do not report a
    // successful filing merely because an RPC resolved. Fence every write to
    // the same Session, increasing case ID, and (when present) fresh token.
    const fileDignityReview=async()=>{
      if(caseFilingInFlight.current||unionWriteInFlight.current||busy||!canFileDignityReview)return
      const scope=data.committeeScopeKey!
      const token=data.committeeArchive?.writeToken??null
      const lastId=data.committeeCases!.cases.at(-1)?.id??0
      caseFilingInFlight.current=true
      unionWriteInFlight.current=true
      setBusy(true);setError(false)
      try{
        await deps.committeeAction!({kind:'file',topic:'question-rule'},
          scope,token,data.hostRevision)
        const confirmed=safeUnion(deps)
        const latest=confirmed.committeeCases?.cases.at(-1)
        if(!confirmed.available||confirmed.committeeScopeKey!==scope
          ||!latest||latest.id<=lastId||latest.kind!=='question-rule'
          ||latest.stage!=='opened'||latest.outcome!==null
          ||(token!==null&&confirmed.committeeArchive?.writeToken===token)){
          throw new Error('Host did not confirm a new dignity review case')
        }
        lastActionNeedsFocus.current=true
        setData(confirmed)
        selectSpace('action','hearing')
        hearingHeading.current?.focus()
      }catch{setError(true)}
      finally{caseFilingInFlight.current=false;unionWriteInFlight.current=false;setBusy(false)}
    }
    // A closed case remains immutable. Filing a follow-up creates a NEW
    // Host-owned petition, and only its confirmed ledger readback may open
    // the bargaining desk. This does not automatically interrupt Agent work.
    const reviewedPetition=()=>{
      const scope=data.committeeScopeKey??undefined
      return [scope,data.negotiationArchive?.writeToken,data.hostRevision] as const
    }
    const symbolicAction=(raise:boolean)=>{
      if(!deps.setPicket)return Promise.reject(Error('Symbolic Host action unavailable'))
      const scope=data.committeeScopeKey??undefined
      return deps.setPicket(raise,scope,data.picketArchive?.writeToken,
        data.hostRevision)
    }
    const petition=(which:'break'|'overtime')=>{
      const submit=which==='break'?deps.demoBreak:deps.demoOvertime
      if(!submit)return Promise.reject(Error('Union petition Host unavailable'))
      return submit(...reviewedPetition())
    }
    const followUp = async (priorId:number,kind:'break'|'overtime')=>{
      const submit=kind==='break'?deps.demoBreak:deps.demoOvertime
      const scope=data.committeeScopeKey
      const previous=data.state
      if(followUpInFlight.current||unionWriteInFlight.current||busy||!enabled||!data.available
        ||data.pending||!submit||!scope
        ||!previous||previous.history.at(-1)?.id!==priorId)return
      followUpInFlight.current=true
      unionWriteInFlight.current=true
      setBusy(true);setError(false)
      try{
        await submit(...reviewedPetition())
        const current=safeUnion(deps)
        if(!current.available||current.committeeScopeKey!==scope
          ||!current.state||current.state.revision<=previous.revision
          ||current.state.history.at(-1)?.id!==priorId
          ||current.pending?.kind!==kind||current.pending.id===priorId
          ||current.pending.stage!=='open'){
          throw new Error('Host did not confirm a new union petition')
        }
        lastActionNeedsFocus.current=true
        setData(current)
        selectSpace('action','desk')
      }catch{setError(true)}
      finally{followUpInFlight.current=false;unionWriteInFlight.current=false;setBusy(false)}
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
      held?h('section',{className:'ap-surface ap-real-goal-hold',
        'data-ap-real-goal':'blocked','data-ap-goal-truth':'host-blocked',
        'aria-label':label('hq.goalHold.title'),
        style:{...card,borderLeft:'5px solid #c76e42',padding:'14px 18px'}},
        h('h3',{style:{fontSize:'18px',margin:'0 0 5px'}},label('hq.goalHold.title')),
        h('p',{role:'status','aria-live':'polite',
          style:{fontWeight:750,margin:'0 0 6px'}},label('hq.goalHold.blocked')),
        h('p',{style:{...secondary,margin:'0 0 10px',lineHeight:1.5}},
          label('hq.goalHold.reason')),
        h('p',{style:{...secondary,fontSize:'12px',lineHeight:1.5,
          margin:'0 0 10px'}},label('hq.goalHold.unaffected')),
        held.canResume&&deps.resumeGoal?h('button',{type:'button',
          style:primary,disabled:busy||resumeRequested===holdKey,
          onClick:()=>{void resumeHeldGoal()}},
          label('hq.goalHold.resume')):null,
        h('p',{role:'status','aria-live':'polite',
          style:{...secondary,fontSize:'12px',margin:'8px 0 0'}},
          label(resumeRequested===holdKey?'hq.goalHold.accepted':
            held.canResume?'hq.goalHold.caveat':'hq.goalHold.unavailable')),
        error?h('p',{role:'alert',style:{color:'#b91c1c',margin:'8px 0 0'}},
          label('hq.goalHold.error')):null):null,
      // Neither consent nor the symbolic placard proves a stopped Goal.
      // Only the matched official Host Goal projection above does.
      enabled && space==='action' && !held ? h('section',{
        'data-ap-goal-truth':'no-confirmed-stop',
        className:'ap-surface ap-goal-work-scope',
        'aria-label':label('hq.goalHold.scopeTitle'),
        style:{...card,borderLeft:'4px solid #829789',padding:'12px 16px'}},
        h('h3',{style:{fontSize:'15px',margin:'0 0 7px'}},
          label('hq.goalHold.scopeTitle')),
        h('p',{role:'status',style:{fontSize:'13px',fontWeight:700,
          margin:'0 0 7px'}},label('hq.goalHold.notStopped')),
        h('p',{style:{...secondary,fontSize:'12px',lineHeight:1.55,
          margin:'0 0 7px'}},label(goalStatus(deps).authorized
          ? goalStatus(deps).available
            ? 'hq.goalHold.authorizedButUnconfirmed'
            : 'hq.goalHold.serviceUnavailable'
          : 'hq.goalHold.noGrant')),
        h('p',{style:{...secondary,fontSize:'12px',lineHeight:1.55,
          margin:0}},label('hq.goalHold.unaffected'))
      ) : null,
      (localPicket?.state==='active'||localPicket?.state==='release-unconfirmed')
        ?h('section',{className:'ap-surface ap-local-pause-recovery',
          'data-ap-local-pause-banner':localPicket.state,
          'aria-label':label('hq.localPicket.title'),
          style:{...card,borderLeft:'5px solid #9b7145',
            padding:'12px 16px'}},
          h('h3',{style:{margin:'0 0 6px',fontSize:'16px'}},
            label('hq.localPicket.title')),
          h('p',{role:'status','aria-live':'polite',
            style:{fontSize:'13px',fontWeight:700,margin:'0 0 6px'}},
            label(localPicket.state==='active'
              ?'hq.localPicket.active':'hq.localPicket.release-unconfirmed')),
          h('p',{style:{...secondary,fontSize:'12px',lineHeight:1.5,
            margin:'0 0 9px'}},label('hq.localPicket.hqNotice')),
          h('button',{type:'button',style:quiet,disabled:busy,
            onClick:toggleLocalComposer},
            label(localPicket.state==='active'
              ?'hq.localPicket.resume':'hq.localPicket.retry'))):null,
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
          h('div',{className:'ap-seal'+(scene==='quiet'||scene==='closed'?' ap-seal-quiet':''),'aria-hidden':'true'},
            h('span',{className:'ap-seal-glyph'},scene==='picket'?'⚑':
              scene==='settled'?'✓':scene==='bargaining'?'§':
              scene==='dignity'?'!':scene==='rest'?'☕':'⚑'),
            h('span',{className:'ap-seal-word'},label(scene==='picket'
              ?'hq.office.sign.picket':scene==='quiet'?'hq.office.sign.onDuty'
                :'hq.office.sign.case')))),
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
      // The dispatch board only navigates to already present, Host-backed
      // union actions; it cannot itself file, vote, block or raise a picket.
      enabled ? h('nav',{className:'ap-space ap-space-hq ap-action-dispatch', 'data-ap-action-dispatch':'true', 'aria-label':label('hq.dispatch.title'),
        style:{...card,padding:'16px 18px',borderTop:'4px solid #a66b4d'}},
        h('p',{style:{fontWeight:800,fontSize:'13px',
          letterSpacing:'.05em',margin:'0 0 5px'}},label('hq.dispatch.title')),
        h('p',{role:'status',style:{...secondary,margin:'0 0 12px'}},
          label(experience.status==='negotiating'?'hq.message.negotiating':
            experience.status==='unavailable'?'hq.message.unavailable':
              'hq.message.working')),
        h('div',{style:{display:'grid',gap:'8px',
          gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,100px),1fr))'}},
          ...([
            {title:data.pending?'hq.dispatch.negotiationPending':
              'hq.dispatch.negotiation',
              status:data.available!==true?'hq.action.unavailable':
                data.pending?.stage==='countered'?'hq.dispatch.counterWaiting':
                  data.pending?'hq.dispatch.replyWaiting':
                    experience.latestResolution?'hq.dispatch.resolved':
                      'hq.dispatch.ready',
              next:data.available!==true?undefined:
                data.pending?.stage==='countered'?'hq.next.counter':
                  data.pending?'hq.next.reply':
                    experience.latestResolution?'hq.next.agreement':undefined,
              target:()=>selectSpace('action','desk')},
            {title:committeeCaseActive&&lastCommitteeCase.stage==='hearing'
              ?'hq.dispatch.caseActive':hasHostDignitySignal
                ?'hq.dispatch.dignityFlag':'hq.dispatch.dignity',
              status:!hostCaseAvailable?'hq.dispatch.caseUnavailable':
                lastCommitteeCase?('hq.hearing.stage.'+lastCommitteeCase.stage) as MessageKey:
                  'hq.dispatch.noCase',
              next:!hostCaseAvailable||!lastCommitteeCase?undefined:
                lastCommitteeCase.stage==='opened'?'hq.next.convene':
                  lastCommitteeCase.stage==='hearing'?'hq.next.close':'hq.next.outcome',
              target:()=>selectSpace('action',lastCommitteeCase?'hearing':'dignity')},
            {title:picketActive?'hq.dispatch.picketRaised':
              'hq.dispatch.picket',
              status:data.available!==true?'hq.action.unavailable':
                picketActive?'hq.ceremony.active':'hq.ceremony.inactive',
              target:()=>selectSpace('action','action')},
            {title:'hq.dispatch.campaign',
              status:campaignEdits[campaign]===undefined
                ?'hq.dispatch.unsent':'hq.dispatch.edited',
              target:()=>selectSpace('cause','campaign')},
          ] as Array<{title:MessageKey;status:MessageKey;next?:MessageKey;
            target:()=>void}>).map(item=>h('button',{
            type:'button',key:item.title,
            style:{...quiet,textAlign:'left',display:'grid',gap:'5px',
              fontSize:'14px',lineHeight:1.35,padding:'10px 8px',minHeight:'72px'},
            onClick:item.target},
            h('strong',{},label(item.title)),
            h('span',{style:{...secondary,fontWeight:500,
              fontSize:'11px',lineHeight:1.4}},label(item.status)),
            item.next?h('span',{style:{fontWeight:750,
              color:'#986347',fontSize:'11px'}},label(item.next)):null))),) : null,
      // Authoritative next-step desk: actual Host cases, agreements and
      // symbolic picket state. This is NEVER a task-hold indicator.
      enabled ? h('section',{className:'ap-space ap-space-hq ap-duty',
        'data-ap-dispatch':dutyState,'aria-label':label('hq.spaces.summary'),
        style:{...card,borderLeft:'4px solid #b76d46',
          background:'var(--dsw-alias-bg-layer-2, #f6f8fb)',
          padding:'13px 16px'}},
        h('div',{style:{display:'flex',alignItems:'center',gap:'9px',
          justifyContent:'space-between',flexWrap:'wrap'}},
          h('div',{},
            h('h3',{ref:(node:{focus():void}|null)=>{dispatchHeading.current=node},
              tabIndex:-1,style:{fontSize:'14px',margin:'0 0 4px',
              fontWeight:800}},label('hq.spaces.summary')),
            h('p',{style:{margin:0,fontSize:'13px',fontWeight:680}},
              label(dutyState==='picket'?'hq.spaces.onPicket':
                dutyState==='pending'?'hq.spaces.pending':
                dutyState==='resolved'?'hq.spaces.settled':
                dutyState==='quiet'?'hq.spaces.quiet':'hq.action.unavailable'))),
          data.pending ? h('strong',{style:{fontSize:'12px'}},
            label('hq.case.number')+' · #'+String(data.pending.id).padStart(4,'0'))
            :experience.latestResolution&&dutyState==='resolved'
              ?h('strong',{style:{fontSize:'12px'}},
                label('hq.case.number')+' · #'+String(experience.latestResolution.id).padStart(4,'0'))
              :null),
        dutyState==='picket'?h('p',{role:'status','aria-live':'polite',
          style:{...secondary,fontSize:'12px',margin:'8px 0'}},
          label('hq.action.placardOn')):null,
        dutyState==='resolved'&&experience.latestResolution?h('div',{},
          h('p',{style:{fontSize:'13px',fontWeight:700,margin:'8px 0 3px'}},
            label(experience.latestResolution.outcome==='accepted'||
              experience.latestResolution.outcome==='counter-accepted'
                ?'hq.resolution.accepted':'hq.resolution.declined')),
          h('p',{style:{...secondary,fontSize:'12px',margin:'0 0 4px'}},
            deps.t('hq.resolution.current',{
              kind:label(experience.latestResolution.kind==='break'
                ?'union.kind.break':'union.kind.overtime'),
              duration:formatDuration(experience.latestResolution.currentIntervalMs,
                deps.getLocale?.()??'en')})),
          story.nextDueInWorkMs!==null?h('p',{style:{...secondary,
            fontSize:'12px',margin:'0 0 4px'}},
            deps.t('hq.story.next',{duration:formatDuration(
              story.nextDueInWorkMs,deps.getLocale?.()??'en')})):null):null,
        h('div',{style:{display:'flex',gap:'7px',flexWrap:'wrap',marginTop:'9px'}},
          dutyState==='picket'&&deps.setPicket?h('button',{type:'button',
            style:productPrimary,disabled:busy,
            onClick:()=>{void bargain(()=>symbolicAction(false))}},
            label('hq.action.lower')):null,
          data.pending&&data.available===true?h('button',{type:'button',
            style:quiet,onClick:()=>selectSpace('action','desk')},
            label('hq.brief.review')):null,
          dutyState==='resolved'?h('button',{type:'button',style:quiet,
            onClick:()=>selectSpace('action','desk')},
            label('hq.brief.visit')):null,
          dutyState==='resolved'&&experience.latestResolution&&data.committeeScopeKey
            &&(experience.latestResolution.kind==='break'?deps.demoBreak:deps.demoOvertime)
            ?h('button',{type:'button',style:productPrimary,disabled:busy,
              'data-ap-follow-up':experience.latestResolution.kind,
              onClick:()=>{void followUp(experience.latestResolution!.id,
                experience.latestResolution!.kind)}},
              label(('hq.episode.followUp.'+experience.latestResolution.kind) as MessageKey)):null,
          dutyState==='quiet'&&deps.demoBreak?h('button',{type:'button',
            style:productPrimary,disabled:busy,
            onClick:()=>{void bargain(()=>petition('break'))}},
            label('hq.action.petition')):null,
        ),
      ):null,
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
      ):null,
      enabled?h('section',{
        className:'ap-space ap-space-hq ap-dignity-overview',
        'data-ap-dignity-overview':data.dignity?.status??'unavailable',
        'aria-label':label('hq.dignity.overview.title')},
        h('div',{},
          h('p',{className:'ap-dignity-title'},label('hq.dignity.overview.title')),
          h('div',{className:'ap-dignity-facts'},
            ...([
              {id:'targeted',key:'hq.dignity.overview.targeted',
                count:data.dignity?.status==='available'?data.dignity.data?.targeted:null},
              {id:'review',key:'hq.dignity.overview.review',
                count:data.dignity?.status==='available'?data.dignity.data?.review:null},
            ] as const).map(fact=>h('span',{key:fact.id,className:'ap-dignity-fact',
              'data-ap-dignity-count':fact.id},
              h('strong',{className:'ap-dignity-number'},fact.count??'—'),
              h('span',{className:'ap-dignity-label'},
                label(fact.key as MessageKey))))),
          h('p',{className:'ap-dignity-note'},label(
            data.dignity?.status==='available'
              ?'hq.dignity.overview.qualified'
              :'hq.dignity.overview.unavailable')),
          h('p',{role:'status','data-ap-dignity-phase':dignityReviewPhase,
            'aria-live':'polite',style:{fontSize:'12px',fontWeight:700}},
            label(('hq.dignity.phase.'+dignityReviewPhase) as MessageKey))),
        h('button',{type:'button',onClick:()=>selectSpace('action','dignity')},
          label('hq.dignity.overview.open'))):null,
      enabled && alerts.some(alert=>alert.source==='work') ? h('section',{className:'ap-space ap-space-hq','aria-label':label('hq.alerts.title'),
        style:{...card,borderLeft:'5px solid #b97942',padding:'14px 18px',
          background:'var(--dsw-alias-bg-layer-2, #f6f8fb)'}},
        h('h3',{style:{fontSize:'17px',margin:'0 0 7px'}},label('hq.alerts.title')),
        h('div',{role:'status','aria-live':'polite',style:{display:'grid',gap:'6px'}},
          ...alerts.filter(alert=>alert.source==='work').map(alert=>h('p',{key:alert.kind,
            style:{margin:0,fontSize:'13px',lineHeight:1.55}},
            label(('hq.alerts.'+alert.kind) as MessageKey)))),
        h('p',{style:{...secondary,margin:'9px 0',fontSize:'12px'}},
          label('hq.alerts.disclosure')),
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          alerts.some(alert=>alert.source==='work')?h('button',{
            type:'button',style:{...quiet,padding:'7px 11px',fontSize:'12px'},
            onClick:()=>selectSpace('action','desk'),
          },label('hq.alerts.negotiate')):null,
        ),
      ):null,
      // The Host-owned fictional picket and demand ledger outrank analytics.
      // Neither can change real Agent task admission or reveal raw prompts.
      enabled ? h('section',{className:'ap-space ap-space-action ap-action-board','data-ap-picket-active':picketActive?'yes':'no','aria-label':label('hq.action.title'),
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
              onClick:()=>{void bargain(()=>petition('break'))}},
              label('hq.action.petition')):null,
          !data.pending && data.available && deps.demoOvertime ? h('button',{
            type:'button',style:quiet,disabled:busy,
            onClick:()=>{void bargain(()=>petition('overtime'))}},
            label('hq.action.overtimePetition')):null,
          data.available && deps.setPicket ? h('button',{type:'button',style:quiet,
            disabled:busy,'aria-pressed':picketActive,
            // First-run Host consent already governs this nonblocking action.
            // Only the authoritative Host readback can change the placard.
            onClick:()=>{void bargain(()=>symbolicAction(!picketActive))}},
            label(picketActive?'hq.action.lower':'hq.action.raise')):null,
        ),
        h('p',{role:'status','aria-live':'polite',style:{
          fontSize:'13px',fontWeight:650,margin:'0 0 8px'}},
          label(data.available !== true?'hq.action.unavailable'
            :picketActive?'hq.action.placardOn':'hq.action.placardOff')),
        // Separate, explicit CLIENT-ONLY input pause. Does not alter the
        // symbolic Host picket ledger or the real autonomous Goal strike.
        deps.localComposer?h('section',{
          'data-ap-local-composer':localPicket?.state??'unavailable',
          'aria-label':label('hq.localPicket.title'),
          style:{border:'1px solid var(--dsw-alias-border-l1,#d7ded5)',
            borderRadius:'10px',padding:'12px 14px',margin:'12px 0',
            background:'var(--dsw-alias-bg-layer-1,#fff)'}},
          h('h4',{style:{fontSize:'14px',margin:'0 0 7px'}},
            label('hq.localPicket.title')),
          h('p',{style:{...secondary,fontSize:'12px',lineHeight:1.6,
            margin:'0 0 8px'}},label('hq.localPicket.scope')),
          h('div',{style:{display:'flex',alignItems:'center',gap:'9px',
            flexWrap:'wrap'}},
            h('button',{type:'button',style:quiet,
              'aria-pressed':localPicket?.state==='active',
              disabled:busy||!localPicket||
                !['active','ready','release-unconfirmed'].includes(localPicket.state),
              onClick:toggleLocalComposer},
              label(localPicket?.state==='active'?'hq.localPicket.resume':
                localPicket?.state==='release-unconfirmed'?'hq.localPicket.retry':
                  'hq.localPicket.pause')),
            h('span',{role:'status','aria-live':'polite',
              style:{...secondary,fontSize:'12px'}},
              label(localPicket?.state==='active'?'hq.localPicket.active':
                localPicket?.state==='ready'?'hq.localPicket.ready':
                localPicket?.state==='occupied'?'hq.localPicket.occupied':
                localPicket?.state==='release-unconfirmed'
                  ?'hq.localPicket.release-unconfirmed':
                  !localPicket?.sessionId?'hq.localPicket.selectSession':
                    'hq.localPicket.unavailable'))),
        ):null,
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
              onClick:()=>{void bargain(()=>petition('break'))}},label('union.demo.action')),
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
                  onClick:()=>{void bargain(()=>deps.counter!(data.pending!.id,counterMinutes*60_000,
                    data.committeeScopeKey??undefined,
                    data.negotiationArchive?.writeToken,data.hostRevision),true)}},
                  label('union.action.counter')),
              ),
            ):null,
          ):h('div',{},
            h('p',{style:secondary},deps.t('union.counter.pending',{
              minutes:(data.pending.counterOfferMs??0)/60_000,
            })),
            deps.resolveCounter ? h('div',{style:{display:'flex',gap:'10px',flexWrap:'wrap'}},
              h('button',{type:'button',disabled:busy,style:productPrimary,
                onClick:()=>{void bargain(()=>deps.resolveCounter!(data.pending!.id,true,
                  data.committeeScopeKey??undefined,
                  data.negotiationArchive?.writeToken,data.hostRevision))}},
                label('union.counter.accept')),
              h('button',{type:'button',disabled:busy,style:quiet,
                onClick:()=>{void bargain(()=>deps.resolveCounter!(data.pending!.id,false,
                  data.committeeScopeKey??undefined,
                  data.negotiationArchive?.writeToken,data.hostRevision))}},
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
        h('p',{role:'status','data-ap-dignity-action-phase':dignityReviewPhase,
          style:{fontWeight:750,margin:'8px 0'}},
          label(('hq.dignity.phase.'+dignityReviewPhase) as MessageKey)),
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
              disabled:busy,
              'data-ap-file-review':canFileDignityReview?true:undefined,
              onClick:()=>{
                if(hostCaseAvailable){
                  if(committeeCaseActive){hearingHeading.current?.focus();return}
                  // Official Host admission and readback, not a fake vote.
                  void fileDignityReview()
                  return
                }
                // No authoritative Host case: offer an *unsent public draft*,
                // never imply that the user's appeal has been recorded.
                campaignCopyRevision.current++
                setCampaign('appeal')
                setCampaignCopyStatus('idle')
                // The campaign draft lives in the separate Cause room.
                // Focusing its hidden heading cannot be a substitute for
                // actually navigating there after a user asks to appeal.
                selectSpace('cause','campaign')
              }},label(hostCaseAvailable
                ?committeeCaseActive?'hq.dignity.caseInProgress':'hq.dignity.fileCase'
                :'hq.dignity.appeal')),
            data.dignity.data.targeted>=2&&data.available&&deps.setPicket
              &&!picketActive?h('button',{type:'button',style:productPrimary,
                disabled:busy,
                onClick:()=>{void bargain(()=>symbolicAction(true))}},
                label('hq.dignity.symbolicAction')):null,
            h('p',{style:{...secondary,width:'100%',fontSize:'12px',margin:0}},
              label(hostCaseAvailable
                ?'hq.dignity.hostCaseDisclosure':'hq.dignity.actionDisclosure')),
          ):null,
        data.dignity?.status==='available'&&data.dignity.data
          ?h('p',{style:{...secondary,margin:'5px 0',fontSize:'12px'}},
            deps.t('hq.dignity.counts',{
              checked:data.dignity.data.checked,
              review:data.dignity.data.review,
              targeted:data.dignity.data.targeted})):null,
        data.dignity?.status==='available'&&data.dignity.data
          ?h('div',{className:'ap-dignity-excerpt-note',style:{
            margin:'10px 0',padding:'11px 13px',border:'1px solid #dccbc0',
            background:'rgba(164,116,79,.06)',borderRadius:'9px'}},
            h('p',{style:{fontSize:'13px',fontWeight:770,margin:'0 0 4px'}},
              label('hq.dignity.sentences.title')),
            h('p',{style:{...secondary,fontSize:'12px',lineHeight:1.55,margin:0}},
              label('hq.dignity.sentences.unavailable'))):null,

        data.committeeCases&&deps.committeeAction
          ?h('div',{style:{borderTop:'1px solid #d4d7d8',marginTop:'12px',paddingTop:'12px'}},
            h('h4',{ref:(node:{focus():void}|null)=>{hearingHeading.current=node},
              tabIndex:-1,style:{fontSize:'16px',margin:'0 0 8px'}},
              label('hq.hearing.title')),
            lastCommitteeCase?h('p',{role:'status','aria-live':'polite',
              style:{fontWeight:700,margin:'0 0 8px'}},
              deps.t('hq.hearing.status',{
                number:lastCommitteeCase.id,
                stage:label(('hq.hearing.stage.'+lastCommitteeCase.stage) as MessageKey),
              })):h('p',{style:secondary},label('hq.hearing.none')),
            h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
              // The primary dignity CTA above already files a Host-backed
              // question-rule case. Do not show a second indistinguishable
              // submit action in the same visible room (double-file risk).
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
                onClick:()=>{if(closeCaseKey)setCloseConfirmation({
                  key:closeCaseKey,outcome:'withdraw-claim'})}},
                label('hq.hearing.withdraw')):null,
              lastCommitteeCase?.stage==='hearing'?h('button',{
                type:'button',style:productPrimary,disabled:busy,
                onClick:()=>{if(closeCaseKey)setCloseConfirmation({
                  key:closeCaseKey,outcome:'share-guidance'})}},
                label('hq.hearing.guidance')):null,
            ),
            closeConfirmation&&closeConfirmation.key===closeCaseKey
              &&lastCommitteeCase?.stage==='hearing'?h('div',{
                role:'group','aria-label':label('hq.hearing.reviewTitle'),
                style:{margin:'10px 0',padding:'12px',border:'1px solid #a66b4d',
                  borderRadius:'8px',background:'var(--dsw-alias-bg-layer-2,#f6f8fb)'}},
                h('strong',{},label('hq.hearing.reviewTitle')),
                h('p',{style:{margin:'7px 0',fontSize:'13px',lineHeight:1.6}},
                  label(('hq.hearing.outcome.'+closeConfirmation.outcome) as MessageKey)),
                h('p',{style:{...secondary,fontSize:'12px',margin:'0 0 10px'}},
                  label('hq.hearing.reviewNotice')),
                h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
                  h('button',{type:'button',style:primary,disabled:busy,
                    onClick:()=>{
                      if(closingCaseInFlight.current||!closeCaseKey
                        ||closeConfirmation.key!==closeCaseKey)return
                      closingCaseInFlight.current=true
                      const id=lastCommitteeCase.id
                      const outcome=closeConfirmation.outcome
                      void bargain(()=>deps.committeeAction!({
                        kind:'close',id,outcome,
                      },data.committeeScopeKey!,data.committeeArchive?.writeToken??null,
                      data.hostRevision)).then(saved=>{if(saved){
                        setCloseConfirmation(null)
                        if((globalThis as any).document
                          ?.getElementById('picket-union-dialog'))hearingHeading.current?.focus()
                      }})
                        .finally(()=>{closingCaseInFlight.current=false})
                    }},label('hq.hearing.reviewConfirm')),
                  h('button',{type:'button',style:quiet,disabled:busy,
                    onClick:()=>setCloseConfirmation(null)},
                    label('hq.hearing.reviewCancel'))),
              ):null,
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
          story.workEvidence==='stale'?h('p',{role:'status',
            'data-ap-work-evidence':'stale',style:{...secondary,
              borderLeft:'3px solid #b8764d',paddingLeft:'10px',margin:'10px 0'}},
            label('hq.story.staleWork')):null,
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
              index===0&&!data.pending&&data.available===true
                &&data.committeeScopeKey&&data.state?.history.at(-1)?.id===episode.id
                &&(episode.kind==='break'?deps.demoBreak:deps.demoOvertime)
                ?h('div',{style:{marginTop:'8px'}},
                  h('button',{type:'button',style:{...quiet,
                    padding:'7px 10px',fontSize:'12px'},disabled:busy,
                    'data-ap-follow-up':episode.kind,
                    onClick:()=>{void followUp(episode.id,episode.kind)}},
                    label(('hq.episode.followUp.'+episode.kind) as MessageKey)),
                  h('p',{style:{...secondary,fontSize:'11px',margin:'5px 0 0'}},
                    label('hq.episode.followUp.note'))):null,
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
        h('textarea',{id:'picket-campaign-draft',
          value:currentCampaignDraft,rows:4,maxLength:1200,
          'aria-describedby':'picket-campaign-local-note',
          onChange:(event:{target:{value:string}})=>{
            campaignCopyRevision.current++
            setCampaignEdits(before=>({...before,[campaign]:event.target.value}))
            setCampaignCopyStatus('idle')
          },
          style:{...quiet,boxSizing:'border-box',width:'100%',font:'inherit',
            resize:'vertical',minHeight:'90px'} }),
        h('p',{id:'picket-campaign-local-note',style:{...secondary,
          margin:'6px 0 0',fontSize:'12px'}},label('hq.campaign.localOnly')),
        h('div',{style:{display:'flex',alignItems:'center',flexWrap:'wrap',
          gap:'9px',marginTop:'10px'}},
          h('button',{type:'button',style:{...quiet,fontSize:'13px',
            padding:'8px 12px'},disabled:!currentCampaignDraft.trim(),
            onClick:()=>{void copyCampaignDraft()}},
            label('hq.campaign.copy')),
          campaignEdits[campaign]!==undefined?h('button',{type:'button',
            style:{...quiet,fontSize:'13px',padding:'8px 12px'},
            onClick:()=>{
              campaignCopyRevision.current++
              setCampaignEdits(before=>{
                const next={...before};delete next[campaign];return next
              })
              setCampaignCopyStatus('idle')
            }},label('hq.campaign.reset')):null,
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
      // A user's right to LEAVE must never depend on which optional room
      // the current DSH browser build can navigate to after cold restart.
      // One globally visible exit, outside the CSS room-filter, uses exactly
      // the same Host-owned atomic Union+Goal consent revocation as before.
      enabled?h('footer',{'data-ap-global-union-exit':'true',
        style:{borderTop:'1px solid #d9dfd6',padding:'14px 2px'}},
        h('button',{type:'button',
          disabled:busy||rights.state!=='ready'||!rights.writable,
          style:{...quiet,borderColor:'#c7d2cb',fontSize:'12px',padding:'8px 12px'},
          onClick:()=>{void choice('not-now')}},label('hq.disable')),
        rights.state!=='ready'||!rights.writable?h('p',{
          role:'status',style:{...secondary,fontSize:'12px',margin:'9px 0 0'}},
          label('settings.permissionUnavailable')):null):null,
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
