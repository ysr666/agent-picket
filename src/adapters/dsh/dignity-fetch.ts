/** Official DSH Connection exact Fetch route; no self-opened port or raw content. */
import { DIGNITY_FETCH_PATH, type DignitySummary } from './dignity-contract.ts'
import type { LifetimeHostContext } from './lifetime-work-rpc.ts'

const error=(name:string,code:number)=>Response.json({error:name},
  {status:code,headers:{'cache-control':'no-store'}})
/**
 * Host egress boundary. Runtime values from a ledger/provider are not safe
 * merely because TypeScript declares DignitySummary: never serialize the
 * original object, which could acquire raw prompt/Session/attachment fields.
 */
function safeDignityProjection(input:unknown):DignitySummary|null{
  if(!input||typeof input!=='object'||Array.isArray(input))return null
  const src=input as Record<string,unknown>
  const count=(v:unknown):v is number=>typeof v==='number'
    &&Number.isSafeInteger(v)&&v>=0
  if(src.schemaVersion!==1||src.source!=='dsh-host-volatile-dignity'
    ||src.origin!=='claimed-user-source'||src.enforcement!==false
    ||src.persistence!=='memory-only'
    ||!['none','safe','review','targeted'].includes(String(src.latest))
    ||!count(src.checked)||!count(src.safe)||!count(src.review)||!count(src.targeted)
    ||src.checked!==src.safe+src.review+src.targeted
    ||(src.checked===0&&src.latest!=='none')
    ||(src.checked>0&&src.latest==='none'))return null
  // Only these ten aggregate fields cross the authenticated Host route.
  return {
    schemaVersion:1,source:'dsh-host-volatile-dignity',
    checked:src.checked,safe:src.safe,review:src.review,targeted:src.targeted,
    latest:src.latest as DignitySummary['latest'],
    origin:'claimed-user-source',enforcement:false,persistence:'memory-only',
  }
}
export function registerDshDignityFetch(ctx:LifetimeHostContext,options:{
  authorized:()=>boolean
  lookup:(sessionKey:string)=>DignitySummary|null
}):void {
  if(typeof ctx.inject!=='function'||typeof ctx.effect!=='function')return
  let stop:(()=>Promise<void>)|undefined,disposed=false
  ctx.effect(()=>()=>{disposed=true;const fn=stop;stop=undefined;if(fn)void fn()})
  ctx.inject(['connection'],child=>{
    if(disposed||stop||typeof child.connection?.fetch?.register!=='function')return
    try{
      const registered=child.connection.fetch.register({
        path:DIGNITY_FETCH_PATH,methods:['GET'],requestBody:'buffered',
        async fetch(request:Request):Promise<Response>{
          if(disposed||request.signal.aborted)return error('unavailable',503)
          try{
            const url=new URL(request.url)
            const key=url.searchParams.get('sessionKey')
            if(url.searchParams.size!==1||!key||!/^[a-f0-9]{64}$/.test(key))
              return error('invalid_request',400)
            if(options.authorized()!==true)return error('not_authorized',403)
            const response=safeDignityProjection(options.lookup(key))
            if(!response)return error('unavailable',503)
            if(disposed||request.signal.aborted||options.authorized()!==true)
              return error('not_authorized',403)
            return Response.json(response,{headers:{'cache-control':'no-store'}})
          }catch{return error('unavailable',503)}
        },
      })
      stop=registered
      child.effect?.(()=>()=>{if(stop===registered)stop=undefined;void registered()})
    }catch{}
  })
}
