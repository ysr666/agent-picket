/** DSH browser-side, consent-scoped work-only lifetime reader.
 * Never opens a custom network channel, stores data on disk, or reads prompts.
 * No background polling: a fresh view/Session change or an explicit refresh
 * requests the authenticated Host's no-store exact Fetch endpoint.
 */
import { LIFETIME_WORK_FETCH_PATH } from './lifetime-work-contract.ts'

export interface WorkOnlyCounts {
  readonly turnStarts:number
  readonly turnEnds:number
  readonly toolCalls:number
  readonly toolResults:number
  readonly completedTurnMs:number
}
export interface LifetimeWorkResponse {
  readonly schemaVersion:1
  readonly source:'dsh-host-durable-work'
  readonly generatedAtMs:number
  readonly windowDays:7|30
  readonly durationBasis:'completed-turn-wall-clock-including-waits'
  readonly lifetime:WorkOnlyCounts
  readonly recentDays:readonly {day:string;work:WorkOnlyCounts}[]
}
export type LifetimeVisibility = 'off' | 'not-loaded' | 'loading' | 'available' | 'unavailable'
export interface LifetimeClientSnapshot {
  readonly status: LifetimeVisibility
  readonly data: LifetimeWorkResponse | null
}
const empty = (status: LifetimeVisibility): LifetimeClientSnapshot => ({status,data:null})
const metricKeys=['turnStarts','turnEnds','toolCalls','toolResults','completedTurnMs'] as const
function exactKeys(value: unknown, keys: readonly string[]): value is Record<string,unknown> {
  return !!value && typeof value==='object' && !Array.isArray(value)
    && Object.keys(value).length===keys.length
    && keys.every(key=>Object.hasOwn(value,key))
}
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0
const counts=(v:unknown):v is WorkOnlyCounts=>
  exactKeys(v,metricKeys)&&metricKeys.every(key=>integer(v[key]))
function workOnlyResponse(value: unknown, windowDays:7|30): value is LifetimeWorkResponse {
  if (!exactKeys(value,[
    'schemaVersion','source','windowDays','generatedAtMs','durationBasis','lifetime','recentDays',
  ]))return false
  if(value.schemaVersion!==1||value.source!=='dsh-host-durable-work'
    ||value.windowDays!==windowDays||!integer(value.generatedAtMs)
    ||value.generatedAtMs>8_640_000_000_000_000
    ||value.durationBasis!=='completed-turn-wall-clock-including-waits'
    ||!counts(value.lifetime)||!Array.isArray(value.recentDays)
    ||value.recentDays.length!==windowDays)return false
  const date=new Date(value.generatedAtMs)
  const utcDay=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())
  for(const [i,row] of value.recentDays.entries()){
    if(!exactKeys(row,['day','work'])||typeof row.day!=='string'
      ||!/^\d{4}-\d{2}-\d{2}$/.test(row.day)||!counts(row.work))return false
    const expected=new Date(utcDay-(windowDays-1-i)*86_400_000)
      .toISOString().slice(0,10)
    if(row.day!==expected)return false
  }
  return true
}
export function createBrowserLifetimeWorkReader(options:{
  /** Re-read official Host authorization on EVERY snapshot and response. */
  readonly authorized:()=>boolean
  /** Browser host fetch from the same authenticated Origin; may be stubbed in tests. */
  readonly fetcher?: typeof fetch
}) {
  const listeners=new Set<()=>void>()
  const allowed=()=>{try{return options.authorized()===true}catch{return false}}
  let value:LifetimeClientSnapshot=empty('off')
  let epoch=0
  let previousSession:string|null=null
  let permission=false
  let terminated=false
  let abort:AbortController|null=null
  const notify=()=>{for(const callback of listeners)callback()}
  const invalidate=(status:LifetimeVisibility)=>{
    ++epoch
    abort?.abort()
    abort=null
    value=empty(status)
    notify()
  }
  const snapshot=():LifetimeClientSnapshot=>{
    if(!permission||terminated)return empty('off')
    if(!allowed()){
      // A revocation observed during render must discard the prior result,
      // not merely conceal it until consent toggles back on. Avoid notifying
      // listeners synchronously from a React snapshot/read callback.
      ++epoch
      abort?.abort()
      abort=null
      value=empty('off')
      permission=false
      previousSession=null
      return value
    }
    return value
  }
  async function load(horizon:7|30=7):Promise<void>{
    if(terminated||!permission||!previousSession||!allowed()) {
      invalidate('off'); return
    }
    const id=++epoch
    abort?.abort()
    const controller=new AbortController()
    abort=controller
    value=empty('loading');notify()
    try {
      const fetcher=options.fetcher??globalThis.fetch
      const response=await fetcher(
        LIFETIME_WORK_FETCH_PATH+'?windowDays='+horizon,
        {method:'GET',credentials:'same-origin',
          headers:{accept:'application/json'},signal:controller.signal})
      if(!response.ok)throw new Error('Host did not provide work data')
      const body:unknown=await response.json()
      if(!workOnlyResponse(body,horizon))throw new Error('Invalid Host work aggregate')
      if(id===epoch&&!terminated&&allowed()&&permission&&previousSession){
        value={status:'available',data:body};notify()
      }
    } catch {
      if(id===epoch&&!terminated&&allowed()&&permission&&previousSession){
        value=empty('unavailable');notify()
      }
    } finally {
      if(id===epoch)abort=null
    }
  }
  return {
    snapshot,
    subscribe(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener)}},
    setScope(enabled:boolean,session:string|null){
      const consent=enabled===true&&allowed()
      const key=consent&&typeof session==='string'&&session?session:null
      if(!consent||!key){
        if(value.status!=='off'||permission||previousSession!==null){
          permission=false;previousSession=null;invalidate('off')
        }
        return
      }
      if(terminated)return
      if(permission&&previousSession===key)return
      permission=true;previousSession=key
      void load(7)
    },
    refresh(days:7|30=7){return load(days)},
    dispose(){
      terminated=true;permission=false;previousSession=null
      invalidate('off');listeners.clear()
    },
  }
}
