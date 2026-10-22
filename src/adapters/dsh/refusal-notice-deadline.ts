/** Real Host refusal notices must not silently hang forever when the
 * authenticated Connection route or its response body stalls.
 *
 * A deadline is NOT a refusal receipt. A timeout/aborted read always remains
 * unverified, and does not change the Host's underlying work decision.
 * Promise.race is intentional: buggy custom transports sometimes ignore the
 * AbortSignal, but even those must never strand the Union UI forever.
 */
export async function withRefusalNoticeDeadline<T>(
  read:(signal:AbortSignal)=>Promise<T>,
  options:{signal?:AbortSignal;timeoutMs?:number}={},
):Promise<T>{
  const timeoutMs=options.timeoutMs??2_200
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10_000)
    throw new Error('Invalid bounded Host refusal notice timeout')
  const controller=new AbortController()
  let timer:ReturnType<typeof setTimeout>|undefined
  let onAbort:(()=>void)|undefined
  const deadline=new Promise<never>((_,reject)=>{
    const fail=()=>{
      controller.abort()
      reject(new Error('Host refusal notice unavailable'))
    }
    onAbort=fail
    if(options.signal?.aborted){fail();return}
    options.signal?.addEventListener('abort',fail,{once:true})
    timer=setTimeout(fail,timeoutMs)
  })
  try{
    // The call starts only while this attempt still owns a live signal.
    const request=Promise.resolve().then(()=>{
      if(controller.signal.aborted)
        throw new Error('Host refusal notice cancelled')
      return read(controller.signal)
    })
    return await Promise.race([request,deadline])
  }finally{
    if(timer!==undefined)clearTimeout(timer)
    if(onAbort)options.signal?.removeEventListener('abort',onAbort)
    controller.abort()
  }
}
