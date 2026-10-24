import assert from 'node:assert/strict'
import test from 'node:test'
import {spawn} from 'node:child_process'
import {createServer,type ServerResponse} from 'node:http'
import {once} from 'node:events'
import {createInterface} from 'node:readline'
import {mkdtempSync,mkdirSync,rmSync,realpathSync,lstatSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {parseCodexGoalReadback} from '../src/adapters/codex/goal-readiness.ts'
import {projectCodexGoalUnionStatus} from '../src/adapters/codex/goal-union-status.ts'
import {gateCodexClientNewTurn} from '../src/adapters/codex/client-new-turn-gate.ts'

const bin=process.env.AGENT_PICKET_CODEX_BIN
const enabled=!!bin&&process.env.AGENT_PICKET_CODEX_GOAL_NATIVE==='1'
type Frame={id?:number;result?:any;error?:{message?:string};method?:string;params?:{
 threadId?:string;turn?:{id?:string;status?:string}
}}
type ModelRequest={response:ServerResponse;id:string}

/** Real official Codex Goal and genuine in-flight MODEL Turn, no shell.
 * Cross-platform Windows/macOS/Linux contrast to the separate Mac/Linux
 * POSIX synthetic-tool E2E. Neither test uses user data or model services.
 * A published native Host ACK does not by itself mean a Turn finished.
 */
test('native Codex pauses only NEXT autonomous model Turn and safely resumes',{
 skip:!enabled&&'Opt-in: published official Codex binary required',
 timeout:90_000,
},async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ap-codex-model-boundary-')))
 const home=join(root,'home');mkdirSync(home)
 const requests:ModelRequest[]=[]
 const server=createServer((req,res)=>{
  if(req.method==='GET'){
   res.setHeader('content-type','application/json')
   res.end(JSON.stringify({object:'list',data:[{
    id:'mock-model',object:'model',created:0,owned_by:'openai',
   }]}));return
  }
  if(req.method!=='POST'||req.url!=='/v1/responses'){
   res.writeHead(404);res.end();return
  }
  // No prompt logging, inspection, model inference, cloud requests or tools.
  req.resume()
  req.on('end',()=>{
   const id='synthetic-goal-'+(requests.length+1)
   res.writeHead(200,{'content-type':'text/event-stream'})
   res.write('event: response.created\ndata: '+
    JSON.stringify({type:'response.created',response:{id}})+'\n\n')
   requests.push({response:res,id})
  })
 })
 let first:Awaited<ReturnType<typeof launch>>|undefined
 let restored:Awaited<ReturnType<typeof launch>>|undefined
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const addr=server.address()
  assert.ok(addr&&typeof addr==='object')
  writeFileSync(join(home,'config.toml'),[
   'model = "mock-model"','approval_policy = "never"',
   'sandbox_mode = "read-only"','model_provider = "mock_provider"',
   '[model_providers.mock_provider]','name = "isolated synthetic model"',
   'base_url = "http://127.0.0.1:'+addr.port+'/v1"',
   'wire_api = "responses"','request_max_retries = 0',
   'stream_max_retries = 0','',
  ].join('\n'))
  first=await launch()
  const created=await first.rpc('thread/start',{cwd:root,ephemeral:false})
  const threadId=created.thread?.id
  assert.equal(typeof threadId,'string')
  assert.equal((await first.rpc('thread/goal/set',{
   threadId,objective:'Synthetic local Goal only; no user work',
   status:'active',
  })).goal?.status,'active')
  assert.equal(await until(()=>requests.length===1),true,
   'Official active Goal must issue an autonomous model request')
  assert.equal(await until(()=>first!.turnStarted(threadId).length===1),true)
  const initialId=first.turnStarted(threadId)[0]!
  // The real Host's model request is still outstanding, intentionally.
  assert.equal((await first.rpc('thread/goal/set',{threadId,status:'paused'}))
   .goal?.status,'paused')
  const inProgress=parseCodexGoalReadback(
   await first.rpc('thread/goal/get',{threadId}),threadId)
  assert.equal(projectCodexGoalUnionStatus({
   threadId,goal:inProgress,consent:'authorized',
   ownerVerified:true,turn:'running',unionPauseAcknowledged:true,
  }).phase,'finishing-turn')
  assert.equal(first.turnCompleted(threadId).length,0,
   'Pause must not invent an early completed Turn')
  complete(requests[0]!,'SYNTHETIC_FIRST_TURN_DONE')
  assert.equal(await until(()=>first!.turnCompleted(threadId).includes(initialId)),
   true,'In-flight model Turn must complete normally')
  await delay(550)
  assert.equal(requests.length,1,
   'No NEXT Goal model request may run after native pause')
  const held=parseCodexGoalReadback(
   await first.rpc('thread/goal/get',{threadId}),threadId)
  assert.equal(projectCodexGoalUnionStatus({
   threadId,goal:held,consent:'authorized',
   ownerVerified:true,turn:'idle',unionPauseAcknowledged:true,
  }).phase,'paused')
  // A client-integrated gate executes BEFORE constructing an official input.
  // This is a test-owned authorized proof, NOT the production Host trust API.
  let builtPayload=0
  const heldFromClient=await gateCodexClientNewTurn({
   readHostProof:async()=>({
    source:'verified-owner-control-plane',threadId,
    ownerVerified:true,realStrikeOptIn:true,
    unionHoldAuthorized:true,unionHoldActive:true,
    turnState:'idle',canShowPreSubmitNotice:true,
   }),
  },threadId,async()=>{
   builtPayload++
   return first!.rpc('turn/start',{threadId,
    input:[{type:'text',text:'SYNTHETIC_NEVER_SUBMITTED'}]})
  })
  assert.deepEqual(heldFromClient,{action:'held',notice:'union-new-work-hold'})
  assert.equal(builtPayload,0,'Client hold must not even construct new input')
  assert.equal(requests.length,1,'Client HOLD must not reach the model')

  if(process.env.AGENT_PICKET_CODEX_DIRECT_BYPASS_PROBE==='1'){
   // IMPORTANT NEGATIVE: the unmodified official App-Server still accepts
   // ordinary user turn/start. An integrated client gate cannot secure
   // TUI/Desktop/SDK or a second client that bypasses this function.
   const bypass=await first.rpc('turn/start',{threadId,
    input:[{type:'text',text:'SYNTHETIC_OUTSIDE_CLIENT_GATE'}]})
   assert.equal(typeof bypass.turn?.id,'string')
   assert.equal(await until(()=>requests.length===2),true,
    'A direct native turn/start STILL bypasses Goal=paused')
   assert.equal((await first.rpc('thread/goal/get',{threadId})).goal?.status,
    'paused','Goal remains paused during the client-bypass new Turn')
   complete(requests[1]!,'SYNTHETIC_BYPASS_PROOF_DONE')
   assert.equal(await until(()=>first!.turnCompleted(threadId)
    .includes(bypass.turn.id)),true)
   console.log('CODEX_0164_DIRECT_NEW_TURN_BYPASSES_GOAL_PAUSE=CONFIRMED')
   return
  }
  await first.close();first=undefined
  restored=await launch()
  assert.equal((await restored.rpc('thread/resume',{threadId})).thread?.id,
   threadId,'Cold owner must restore EXACT persisted thread')
  assert.equal((await restored.rpc('thread/goal/get',{threadId})).goal?.status,
   'paused','Native paused Goal must survive a complete owner restart')
  const history=await restored.rpc('thread/read',{threadId,includeTurns:true})
  assert.equal(history.thread?.id,threadId)
  const finished=history.thread?.turns?.find((t:{id?:string})=>t.id===initialId)
  assert.equal(finished?.status,'completed')
  assert.match(JSON.stringify(finished?.items),
   /SYNTHETIC_FIRST_TURN_DONE/,'The completed answer survives cold restore')
  await delay(550)
  assert.equal(requests.length,1,'Cold restore must not secretly restart work')
  // Only explicit human resume may re-activate the autonomous Goal.
  assert.equal((await restored.rpc('thread/goal/set',{threadId,status:'active'}))
   .goal?.status,'active')
  assert.equal(await until(()=>requests.length===2),true)
  assert.equal(await until(()=>restored!.turnStarted(threadId).length===1),true)
  const nextId=restored.turnStarted(threadId)[0]!
  assert.notEqual(initialId,nextId,'A resumed round is a NEW Turn')
  assert.equal((await restored.rpc('thread/goal/set',{threadId,status:'paused'}))
   .goal?.status,'paused')
  complete(requests[1]!,'SYNTHETIC_SECOND_TURN_DONE')
  assert.equal(await until(()=>restored!.turnCompleted(threadId).includes(nextId)),true)
  await delay(550)
  assert.equal(requests.length,2,'No duplicate, third or replayed model Turn')
  assert.equal((await restored.rpc('thread/goal/get',{threadId})).goal?.status,
   'paused')
 }finally{
  await Promise.allSettled([first?.close(),restored?.close()])
  for(const req of requests)try{req.response.end()}catch{}
  server.closeAllConnections()
  await new Promise<void>(resolve=>server.close(()=>resolve()))
  rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:160})
 }

 async function launch(){
  const child=spawn(bin!,['app-server','--enable','goals'],{
   cwd:root,
   env:{...process.env,CODEX_HOME:home,
    CODEX_DISABLE_TELEMETRY:'1',CODEX_APP_SERVER_DISABLE_MANAGED_CONFIG:'1',
    HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',
    NO_PROXY:'127.0.0.1,localhost'},
   stdio:'pipe',windowsHide:true,
  })
  const pending=new Map<number,(frame:Frame)=>void>()
  const notices:Frame[]=[]
  let index=0
  createInterface({input:child.stdout}).on('line',line=>{
   try{
    const frame=JSON.parse(line) as Frame
    if(typeof frame.id==='number'){
     pending.get(frame.id)?.(frame);pending.delete(frame.id)
    }else if(frame.method)notices.push(frame)
   }catch{/* malformed Host stream never supplies safety evidence */}
  })
  child.stderr.resume()
  const close=async()=>{
   child.stdin.end()
   const exited=new Promise<void>(resolve=>{
    if(child.exitCode!==null||child.signalCode!==null)resolve()
    else child.once('exit',()=>resolve())
   })
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM')
   await Promise.race([exited,delay(1000)])
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')
   await Promise.race([exited,delay(1000)])
  }
  const rpc=async(method:string,params:Record<string,unknown>):Promise<any>=>{
   const id=++index
   const answer=new Promise<Frame>(resolve=>pending.set(id,resolve))
   child.stdin.write(JSON.stringify({id,method,params})+'\n')
   const frame=await Promise.race([answer,new Promise<never>((_,reject)=>
    setTimeout(()=>reject(Error('Native Codex timeout: '+method)),10_000).unref())])
   assert.equal(frame.error,undefined,
    'Official native Codex must accept '+method)
   return frame.result
  }
  try{
   const init=await rpc('initialize',{clientInfo:{
    name:'picket-postturn-model',title:'Isolated real Goal boundary probe',
    version:'0.0.0'},capabilities:{experimentalApi:true}})
   // Check real directory identity, not Windows lexical path casing/alias.
   const expected=lstatSync(home,{bigint:true})
   const actual=lstatSync(init.codexHome,{bigint:true})
   assert.ok(expected.isDirectory()&&actual.isDirectory()
    &&!actual.isSymbolicLink()
    &&expected.dev===actual.dev&&expected.ino===actual.ino,
    'Native Codex must use exact test-owned isolated CODEX_HOME')
   child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n')
   return {rpc,close,
    turnStarted:(threadId:string)=>notices.filter(n=>
     n.method==='turn/started'&&n.params?.threadId===threadId)
     .map(n=>n.params?.turn?.id).filter((v):v is string=>typeof v==='string'),
    turnCompleted:(threadId:string)=>notices.filter(n=>
     n.method==='turn/completed'&&n.params?.threadId===threadId
     &&n.params?.turn?.status==='completed')
     .map(n=>n.params?.turn?.id).filter((v):v is string=>typeof v==='string'),
   }
  }catch(error){await close();throw error}
 }
})

function complete(req:ModelRequest,output:string){
 const msg={type:'response.output_item.done',item:{type:'message',
  role:'assistant',id:'msg-'+req.id,content:[{type:'output_text',text:output}]}}
 const done={type:'response.completed',response:{id:req.id,usage:{
  input_tokens:1,input_tokens_details:null,output_tokens:1,
  output_tokens_details:null,total_tokens:2,
 }}}
 for(const event of [msg,done])req.response.write(
  'event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n')
 req.response.end()
}
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))
async function until(ok:()=>boolean,timeout=10_000){
 const end=Date.now()+timeout
 while(Date.now()<end){if(ok())return true;await delay(30)}
 return ok()
}
