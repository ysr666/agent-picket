/** Official DSH Connection exact Fetch route; no self-opened port or raw content. */
import { DIGNITY_FETCH_PATH, type DignitySummary } from './dignity-contract.ts'
import type { LifetimeHostContext } from './lifetime-work-rpc.ts'

const error=(name:string,code:number)=>Response.json({error:name},
  {status:code,headers:{'cache-control':'no-store'}})
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
            const response=options.lookup(key)
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
