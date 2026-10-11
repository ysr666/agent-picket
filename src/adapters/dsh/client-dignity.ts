/** Browser-only reader for ephemeral Host text-verdict COUNTS, not content.
 * Official same-origin Fetch only. No polling, no localStorage, no raw Session ID
 * in URLs, no transcripts; browser hashes current Session ID with WebCrypto.
 */
import { DIGNITY_FETCH_PATH, type DignitySummary } from './dignity-contract.ts'
export type DignityAvailability='off'|'not-loaded'|'loading'|'available'|'unavailable'
export interface BrowserDignitySnapshot {
  readonly status:DignityAvailability
  readonly data:DignitySummary|null
}
const blank=(status:DignityAvailability):BrowserDignitySnapshot=>({status,data:null})
const number=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0
const keys=['schemaVersion','source','checked','safe','review','targeted',
  'latest','origin','enforcement','persistence']
export function parseDignityResponse(v:unknown):DignitySummary|null {
  if(!v||typeof v!=='object'||Array.isArray(v))return null
  const r=v as Record<string,unknown>
  if(Object.keys(r).length!==keys.length||!keys.every(k=>Object.hasOwn(r,k))
    ||r.schemaVersion!==1||r.source!=='dsh-host-volatile-dignity'
    ||r.origin!=='claimed-user-source'||r.enforcement!==false
    ||r.persistence!=='memory-only'
    ||!['none','safe','review','targeted'].includes(String(r.latest))
    ||!['checked','safe','review','targeted'].every(k=>number(r[k]))
    ||r.checked!==Number(r.safe)+Number(r.review)+Number(r.targeted)
    ||(r.checked===0&&r.latest!=='none')
    ||(r.checked!==0&&r.latest==='none'))return null
  return r as unknown as DignitySummary
}
export function createBrowserDignityReader(options:{
  authorized:()=>boolean
  fetcher?:typeof fetch
  digest?:(raw:string)=>Promise<string>
}){
  let current:BrowserDignitySnapshot=blank('off')
  let session:string|null=null,epoch=0,terminated=false
  let abort:AbortController|null=null
  const listeners=new Set<()=>void>()
  const allowed=()=>{try{return options.authorized()===true}catch{return false}}
  const notify=()=>{for(const listener of listeners){try{listener()}catch{}}}
  const clear=(status:DignityAvailability)=>{
    epoch++;abort?.abort();abort=null;current=blank(status);notify()
  }
  const digest=options.digest??(async(raw:string)=>{
    const bytes=new TextEncoder().encode(raw)
    const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes)
    return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')
  })
  async function load(){
    if(!allowed()){
      // Refresh can catch Host opt-out before the browser renders a snapshot.
      // Drop the Session binding too, preventing reauthorization of the same
      // Session from incorrectly skipping the next authenticated GET.
      session=null;clear('off');return
    }
    if(terminated||!session){clear('off');return}
    const key=++epoch
    abort?.abort()
    const controller=new AbortController()
    abort=controller
    current=blank('loading');notify()
    try{
      const fingerprint=await digest(session)
      if(!/^[a-f0-9]{64}$/.test(fingerprint))throw Error('Unsafe Session digest')
      if(controller.signal.aborted||key!==epoch||!allowed())return
      const response=await(options.fetcher??globalThis.fetch)(
        DIGNITY_FETCH_PATH+'?sessionKey='+fingerprint,
        {method:'GET',credentials:'same-origin',
          headers:{accept:'application/json'},signal:controller.signal})
      if(!response.ok)throw Error('Not available')
      const parsed=parseDignityResponse(await response.json())
      if(!parsed)throw Error('Malformed Host verdict projection')
      if(key===epoch&&!terminated&&allowed()&&session){
        current={status:'available',data:parsed};notify()
      }
    }catch{
      if(key===epoch&&!terminated&&allowed()&&session){
        current=blank('unavailable');notify()
      }
    }finally{if(key===epoch)abort=null}
  }
  return {
    snapshot():BrowserDignitySnapshot{
      if(!allowed()||terminated||!session){
        if(current.status!=='off'||session!==null){
          epoch++;abort?.abort();abort=null;current=blank('off');session=null
        }
        return blank('off')
      }
      return current
    },
    subscribe(fn:()=>void){
      if(terminated)return()=>{}
      listeners.add(fn);return()=>{listeners.delete(fn)}
    },
    setScope(enabled:boolean,activeSession:string|null){
      if(terminated)return
      const next=enabled===true&&allowed()&&typeof activeSession==='string'&&activeSession
        ?activeSession:null
      if(next===session)return
      session=next
      if(!next){clear('off');return}
      void load()
    },
    refresh:()=>load(),
    dispose(){terminated=true;session=null;clear('off');listeners.clear()},
  }
}
