import assert from 'node:assert/strict'
import test from 'node:test'
import {spawn} from 'node:child_process'
import {createServer, type ServerResponse} from 'node:http'
import {once} from 'node:events'
import {createInterface} from 'node:readline'
import {mkdtempSync,mkdirSync,rmSync,realpathSync,writeFileSync,
 readdirSync,readFileSync,statSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const bin=process.env.AGENT_PICKET_CODEX_BIN
const eligible=!!bin&&process.env.AGENT_PICKET_CODEX_GOAL_NATIVE==='1'
type Frame={id?:number;result?:any;error?:{message?:string};method?:string;params?:{
  threadId?:string;turn?:{id?:string;status?:string};item?:{
   type?:string;status?:string;exitCode?:number;aggregatedOutput?:string
  }
}}

/**
 * Native official Codex App-Server + local synthetic Responses API.
 * The first autonomous Turn remains in flight while its Goal becomes blocked;
 * it must complete its in-flight real synthetic shell tool without cancellation.
 * A different owner process must then restore the blocked Goal without
 * launching another Turn. Explicit resume starts a further synthetic Turn.
 * This proves ONLY an isolated synthetic tool; it does NOT establish
 * external authorization, global owner fencing or conditional Host CAS.
 */
test('native Codex completes in-flight autonomous Turn, holds next round and cold-resumes safely',{
 skip:!eligible&&'Opt-in: isolated Codex 0.146.1 or reviewed compatible native binary required',
 timeout:95_000,
},async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ap-codex-real-turn-boundary-')))
 const home=join(root,'home');mkdirSync(home)
 const requests:{path:string;response:ServerResponse;id:string;advertisedTools:string[]}[]=[]
 const server=createServer((req,res)=>{
  if(req.method==='GET'){
   res.setHeader('content-type','application/json')
   res.end(JSON.stringify({object:'list',data:[{
    id:'mock-model',object:'model',created:0,owned_by:'openai',
   }]}))
   return
  }
  if(req.method!=='POST'||req.url!=='/v1/responses'){
   res.writeHead(404);res.end();return
  }
  // Disposable synthetic test only. Inspect ONLY the official tools
  // advertised to the mock model, not original prompts or user content.
  // Keep a bounded in-memory request until parsed and discard immediately.
  const chunks:Buffer[]=[]
  let bytes=0
  req.on('data',(chunk:Buffer)=>{
   bytes+=chunk.length
   if(bytes<=1_000_000)chunks.push(chunk)
  })
  req.on('end',()=>{
   if(bytes>1_000_000){res.writeHead(413);res.end();return}
   let advertisedTools:string[]=[]
   try{
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      tools?:Array<{type?:unknown;name?:unknown}>
    }
    advertisedTools=(Array.isArray(body.tools)?body.tools:[]).map(item=>
      typeof item.name==='string'?item.name:
      typeof item.type==='string'?item.type:'unknown').slice(0,32)
   }catch{/* Preserve native evidence; never echo raw body. */}
   const id='resp-picket-'+(requests.length+1)
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'})
   res.write(`event: response.created\ndata: ${JSON.stringify({
    type:'response.created',response:{id},
   })}\n\n`)
   requests.push({path:req.url!,response:res,id,advertisedTools})
  })
 })
 let first:Awaited<ReturnType<typeof launch>>|undefined
 let external:Awaited<ReturnType<typeof launch>>|undefined
 let second:Awaited<ReturnType<typeof launch>>|undefined
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const address=server.address()
  assert.ok(address&&typeof address==='object')
  writeFileSync(join(home,'config.toml'),[
   'model = "mock-model"','approval_policy = "never"',
   'sandbox_mode = "workspace-write"','model_provider = "mock_provider"',
   '[model_providers.mock_provider]',
   'name = "isolated synthetic model"',
   `base_url = "http://127.0.0.1:${address.port}/v1"`,
   'wire_api = "responses"','request_max_retries = 0',
   'stream_max_retries = 0','',
  ].join('\n'))
  first=await launch()
  const created=await first.rpc('thread/start',{cwd:root,ephemeral:false})
  const threadId=created.thread?.id
  assert.equal(typeof threadId,'string')
  assert.equal(created.thread?.status?.type,'idle')
  assert.equal((await first.rpc('thread/goal/set',{threadId,
   objective:'Synthetic local Goal round boundary observation',
   status:'active',
  })).goal?.status,'active')
  assert.equal(await until(()=>requests.length===1),true,
   'Official active Goal must start a real local model request autonomously')
  assert.equal(await until(()=>first!.notifications.some(n=>n.method==='turn/started')),
   true,'Native Host must emit real Turn start before hold')
  const firstTurnId=first.notifications.find(n=>n.method==='turn/started')?.params?.turn?.id
  assert.equal(typeof firstTurnId,'string')
  // A real exec_command is part of THIS native autonomous Turn. The
  // synthetic tool runs exclusively in this temporary workspace and waits
  // for the test-owned release flag, bounded to five seconds if interrupted.
  finishToolCall(requests[0]!,root)
  const startedShell=await until(()=>first!.notifications.some(n=>
   n.method==='item/started'&&n.params?.item?.type==='commandExecution'))
  assert.equal(startedShell,true,
   'Official Host must start an actual synthetic shell tool; bounded Host event envelope: '+
   JSON.stringify({modelRequests:requests.length,
    // Metadata only: native advertised tool names, never prompt contents.
    advertisedTools:requests.slice(0,3).map(r=>r.advertisedTools),
    events:first.notifications.slice(-16).map(n=>({
     name:n.method,itemType:n.params?.item?.type,
     itemStatus:n.params?.item?.status,turnStatus:n.params?.turn?.status,
     ...(n.method==='warning'?{warning:String(
       (n.params as Record<string,unknown>|undefined)?.message??'')
       .slice(0,280)}:{}),
    }))}))
  // A separate official App-Server is an external control plane, NOT
  // another thread owner. Never call thread/resume: that RPC independently
  // schedules a duplicate active Goal Turn on this pinned Codex version.
  external=await launch()
  assert.equal((await external.rpc('thread/goal/get',{threadId}))
   .goal?.status,'active',
   'External official Goal getter works without resuming the Thread')
  assert.equal((await external.rpc('thread/goal/set',{threadId,status:'blocked'}))
   .goal?.status,'blocked',
   'External official Goal setter must block without loading the Thread')
  assert.equal((await first.rpc('thread/goal/get',{threadId})).goal?.status,
   'blocked','Active owner must observe external block')
  // CRITICAL negative: a stale external client can silently override a
  // newer hold. Official goal/set has NO expectedRevision/CAS. Restore the
  // synthetic block immediately, before releasing the in-flight tool.
  assert.equal((await external.rpc('thread/goal/set',{threadId,status:'active'}))
   .goal?.status,'active','Unconditional external write can undo a hold')
  assert.equal((await first.rpc('thread/goal/get',{threadId})).goal?.status,'active')
  assert.equal((await external.rpc('thread/goal/set',{threadId,status:'blocked'}))
   .goal?.status,'blocked','Synthetic test must leave Goal held')
  assert.equal((await first.rpc('thread/goal/get',{threadId})).goal?.status,'blocked')
  assert.equal(external.notifications.some(n=>n.method==='turn/started'),false,
   'External non-resuming control plane must not start work')
  assert.equal(requests.length,1,'No competing Goal Turn started by controller')
  writeFileSync(join(root,'release.flag'),'synthetic release')
  assert.equal(await until(()=>first!.notifications.some(n=>
   n.method==='item/completed'&&n.params?.item?.type==='commandExecution')),
   true,'The in-flight TOOL must finish after Goal became blocked')
  const tool=first.notifications.find(n=>n.method==='item/completed'
   &&n.params?.item?.type==='commandExecution')?.params?.item
  assert.equal(tool?.status,'completed')
  assert.equal(tool?.exitCode,0)
  assert.match(tool?.aggregatedOutput??'',/SYNTHETIC_TOOL_COMPLETED/,
   'No in-flight synthetic shell output is discarded by Goal block')
  // The native Turn requests a SECOND local model response after the tool;
  // this is still the SAME Turn, not another autonomous Goal round.
  assert.equal(await until(()=>requests.length===2),true)
  finishResponse(requests[1]!, 'SYNTHETIC-FIRST-ROUND-COMPLETED')
  assert.equal(await until(()=>first!.notifications.some(n=>
   n.method==='turn/completed'&&n.params?.turn?.id===firstTurnId)),true,
   'The current real model Turn must be allowed to finish after Goal block')
  const firstDone=first.notifications.find(n=>n.method==='turn/completed'
   &&n.params?.turn?.id===firstTurnId)
  assert.equal(firstDone?.params?.turn?.status,'completed')
  assert.ok(first.notifications.some(n=>n.method==='item/completed'),
   'Host must persist the synthetic model output item before holding')
  await new Promise(resolve=>setTimeout(resolve,450))
  assert.equal(requests.length,2,'No automatic NEXT TURN model request while blocked')
  assert.equal((await first.rpc('thread/goal/get',{threadId})).goal?.status,'blocked')
  assert.equal(external.notifications.some(n=>n.method==='turn/started'),false)
  await external.close();external=undefined

  await first.close();first=undefined
  second=await launch()
  assert.equal((await second.rpc('thread/resume',{threadId})).thread?.id,threadId)
  assert.equal((await second.rpc('thread/goal/get',{threadId})).goal?.status,'blocked')
  const restored=await second.rpc('thread/read',{threadId,includeTurns:true})
  assert.equal(restored.thread?.id,threadId)
  const retainedTurn=restored.thread?.turns?.find((turn:{id?:string})=>turn.id===firstTurnId)
  assert.ok(retainedTurn,'The exact first Turn remains in the cold-restored rollout')
  assert.equal(retainedTurn.status,'completed')
  assert.match(JSON.stringify(retainedTurn.items),/SYNTHETIC-FIRST-ROUND-COMPLETED/,
   'Official cold thread/read must preserve the assistant final message')
  // Official thread/read may project only assistant messages. The source
  // Codex rollout must still retain the actual native TOOL output bytes.
  // Inspect ONLY this newly created disposable synthetic CODEX_HOME.
  assert.equal(syntheticRolloutContains(join(home,'sessions'),
   'SYNTHETIC_TOOL_COMPLETED'),true,
   'Cold-restored Codex source rollout must preserve completed tool output')
  await new Promise(resolve=>setTimeout(resolve,450))
  assert.equal(requests.length,2,
   'A cold-restored blocked Goal must not start another model request')
  // Only an explicit reactivation can schedule another autonomous Turn.
  assert.equal((await second.rpc('thread/goal/set',{threadId,status:'active'}))
   .goal?.status,'active')
  assert.equal(await until(()=>requests.length===3),true,
   'Explicit resume must start another native Goal round')
  assert.equal(await until(()=>second!.notifications.some(n=>n.method==='turn/started')),
   true)
  const resumedTurnId=second.notifications.find(n=>n.method==='turn/started')?.params?.turn?.id
  assert.notEqual(resumedTurnId,firstTurnId,'Resume must use a new Turn ID')
  assert.equal((await second.rpc('thread/goal/set',{threadId,status:'blocked'}))
   .goal?.status,'blocked')
  finishResponse(requests[2]!, 'SYNTHETIC-SECOND-ROUND-COMPLETED')
  assert.equal(await until(()=>second!.notifications.some(n=>
   n.method==='turn/completed'&&n.params?.turn?.id===resumedTurnId)),true)
  assert.equal(second.notifications.find(n=>n.method==='turn/completed'
   &&n.params?.turn?.id===resumedTurnId)?.params?.turn?.status,'completed')
  await new Promise(resolve=>setTimeout(resolve,450))
  assert.equal(requests.length,3,'No duplicate or third automatic round')
  assert.equal((await second.rpc('thread/goal/get',{threadId})).goal?.status,'blocked')
 }finally{
  await Promise.allSettled([first?.close(),external?.close(),second?.close()])
  for(const request of requests)try{request.response.end()}catch{/* cleanup */}
  await new Promise<void>(resolve=>server.close(()=>resolve()))
  rmSync(root,{recursive:true,force:true})
 }

 async function launch(){
  const env={...process.env,CODEX_HOME:home,CODEX_DISABLE_TELEMETRY:'1',
   CODEX_APP_SERVER_DISABLE_MANAGED_CONFIG:'1',
   HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}
  const child=spawn(bin!,['app-server','--enable','goals'],{
   cwd:root,env,stdio:'pipe',windowsHide:true,
  })
  const pending=new Map<number,(frame:Frame)=>void>()
  const notifications:Frame[]=[]
  let index=0
  createInterface({input:child.stdout}).on('line',line=>{
   try{
    const frame=JSON.parse(line) as Frame
    if(typeof frame.id==='number'){
     pending.get(frame.id)?.(frame);pending.delete(frame.id)
    }else if(frame.method)notifications.push(frame)
   }catch{/* Never trust malformed native frames */}
  })
  child.stderr.resume()
  async function rpc(method:string,params:Record<string,unknown>){
   const id=++index
   const answer=new Promise<Frame>(resolve=>pending.set(id,resolve))
   child.stdin.write(JSON.stringify({id,method,params})+'\n')
   const frame=await Promise.race([answer,new Promise<never>((_,reject)=>
    setTimeout(()=>reject(Error('Official Codex timeout: '+method)),8_000).unref())])
   assert.equal(frame.error,undefined,'Codex rejected '+method)
   return frame.result
  }
  const initialized=await rpc('initialize',{clientInfo:{name:'agent-picket-native-sse',
   title:'Synthetic boundary contract',version:'0.0.0'},
   capabilities:{experimentalApi:true}})
  assert.equal(initialized.codexHome,home)
  child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n')
  return {rpc,notifications,async close(){
   child.stdin.end()
   const exited=new Promise<void>(resolve=>{
    if(child.exitCode!==null||child.signalCode!==null)resolve()
    else child.once('exit',()=>resolve())
   })
   child.kill('SIGTERM')
   await Promise.race([exited,new Promise<void>(resolve=>setTimeout(resolve,1000).unref())])
   if(child.exitCode===null)child.kill('SIGKILL')
   await Promise.race([exited,new Promise<void>(resolve=>setTimeout(resolve,1000).unref())])
  }}
 }
})

async function until(predicate:()=>boolean,timeout=9_000){
 const deadline=Date.now()+timeout
 while(Date.now()<deadline){if(predicate())return true
  await new Promise(resolve=>setTimeout(resolve,30))}
 return predicate()
}
function finishResponse(request:{response:ServerResponse;id:string},text:string){
 const message={type:'response.output_item.done',item:{type:'message',
  role:'assistant',id:'msg-'+request.id,content:[{type:'output_text',text}]}}
 const completed={type:'response.completed',response:{id:request.id,usage:{
  input_tokens:1,input_tokens_details:null,output_tokens:1,
  output_tokens_details:null,total_tokens:2,
 }}}
 for(const event of [message,completed])request.response.write(
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
 request.response.end()
}

/** First synthetic model reply requests an actual bounded local exec_command. */
function finishToolCall(request:{response:ServerResponse;id:string},root:string){
 const script='i=0; while [ "$i" -lt 100 ] && [ ! -f release.flag ]; '
  +'do sleep 0.05; i=$((i+1)); done; '
  +'test -f release.flag && printf SYNTHETIC_TOOL_COMPLETED'
 // Real Responses API streams a function call as an added item followed
 // by a completed item. A done-only fixture worked on macOS but Linux
 // Codex 0.146.1 consumed a second model request without starting a tool.
 // Keep native execution assertions unchanged: this must be a real tool.
 const item={id:'fc-'+request.id,type:'function_call' as const,
  call_id:'call-'+request.id,name:'exec_command',
  arguments:JSON.stringify({cmd:script,workdir:root,yield_time_ms:30_000})}
 const added={type:'response.output_item.added',output_index:0,
  item:{...item,status:'in_progress',arguments:''}}
 const call={type:'response.output_item.done',output_index:0,
  item:{...item,status:'completed'}}
 const completed={type:'response.completed',response:{id:request.id,usage:{
  input_tokens:1,input_tokens_details:null,output_tokens:1,
  output_tokens_details:null,total_tokens:2,
 }}}
 for(const event of [added,call,completed])request.response.write(
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
 request.response.end()
}

/** Test-only audit of the *disposable* Codex rollout, never user records. */
function syntheticRolloutContains(dir:string,needle:string):boolean{
 for(const entry of readdirSync(dir,{withFileTypes:true})){
  const path=join(dir,entry.name)
  if(entry.isDirectory()){
   if(syntheticRolloutContains(path,needle))return true
  }else if(entry.isFile()&&entry.name.endsWith('.jsonl')
   &&statSync(path).size<=8_000_000&&readFileSync(path,'utf8').includes(needle))
   return true
 }
 return false
}
