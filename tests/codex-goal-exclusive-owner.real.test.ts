import assert from 'node:assert/strict'
import test from 'node:test'
import {spawn} from 'node:child_process'
import {createServer, type ServerResponse} from 'node:http'
import {once} from 'node:events'
import {createInterface} from 'node:readline'
import {mkdtempSync,mkdirSync,rmSync,realpathSync,writeFileSync,lstatSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const bin=process.env.AGENT_PICKET_CODEX_BIN
const eligible=!!bin&&process.env.AGENT_PICKET_CODEX_GOAL_NATIVE==='1'
const stage=(name:string)=>{if(process.platform==='win32')console.error('CODEX_GOAL_OWNER_STAGE='+name)}
type Frame={id?:number;error?:{message?:string};result?:any;method?:string;params?:{
 threadId?:string;turn?:{id?:string;status?:string}
}}

/**
 * Verify whether an official newer Codex Host has fixed the multi-owner Goal race.
 * One app-server has an active Goal Turn in flight; a second independent
 * app-server sharing only the disposable CODEX_HOME resumes the same thread.
 * The second owner must fail closed while the first is running, then resume
 * only after the first releases ownership; this is NOT Goal-state CAS proof.
 */
test('native Codex newer Host rejects duplicate Goal owner and permits cold takeover',{
 skip:!eligible&&'Opt-in: pinned/reviewed native Codex Goal binary required',
 timeout:70_000,
},async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ap-codex-multi-owner-race-')))
 const home=join(root,'home');mkdirSync(home)
 const responses:ServerResponse[]=[]
 const modelRequests:string[]=[]
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
  // Do not log request body/prompt even though all work is synthetic.
  req.resume()
  req.on('end',()=>{
   const id='resp-multi-owner-'+(modelRequests.length+1)
   res.writeHead(200,{'content-type':'text/event-stream'})
   res.write(`event: response.created\ndata: ${JSON.stringify({
    type:'response.created',response:{id},
   })}\n\n`)
   modelRequests.push(id)
   responses.push(res)
  })
 })
 let ownerA:Awaited<ReturnType<typeof launch>>|undefined
 let ownerB:Awaited<ReturnType<typeof launch>>|undefined
 let firstFailure:unknown=null
 let ownerNumber=0
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const address=server.address()
  assert.ok(address&&typeof address==='object')
  writeFileSync(join(home,'config.toml'),[
   'model = "mock-model"','approval_policy = "never"',
   'sandbox_mode = "read-only"','model_provider = "mock_provider"',
   '[model_providers.mock_provider]','name = "local research model"',
   `base_url = "http://127.0.0.1:${address.port}/v1"`,
   'wire_api = "responses"','request_max_retries = 0',
   'stream_max_retries = 0','',
  ].join('\n'))
  stage('owner-A-launch')
  ownerA=await launch()
  const created=await ownerA.rpc('thread/start',{cwd:root,ephemeral:false})
  const threadId=created.thread?.id
  assert.equal(typeof threadId,'string')
  assert.equal((await ownerA.rpc('thread/goal/set',{threadId,
   objective:'Synthetic offline active Goal multi-owner race demonstration',
   status:'active',
  })).goal?.status,'active')
  assert.equal(await until(()=>modelRequests.length>=1),true,
   'First App-Server automatically starts a model request')
  assert.equal(await until(()=>ownerA!.turnIds(threadId).length===1),true)
  const firstTurnId=ownerA.turnIds(threadId)[0]!
  // No completed model response is sent to A. Goal remains in flight.
  stage('owner-B-launch')
  ownerB=await launch()
  const denied=await ownerB.rpcRaw('thread/resume',{threadId})
  assert.ok(denied.error,'The second writer must be rejected by official Host')
  assert.match(String(denied.error.message),/active writer|writer|conflict|lock/i,
   'Competing owner must get a clear cross-process ownership rejection')
  // A second process must never launch another native Responses request.
  await new Promise(resolve=>setTimeout(resolve,1400))
  assert.equal(modelRequests.length,1,
   'A rejected duplicate resume MUST NOT start a second model request')
  assert.equal(ownerB.turnIds(threadId).length,0,
   'Rejected owner MUST NOT receive a new started Goal Turn')
  console.log('CODEX_CROSS_PROCESS_GOAL_DUPLICATE_DENIED '+JSON.stringify({
   version:process.env.AGENT_PICKET_CODEX_EXPECT_VERSION,
   modelRequests:modelRequests.length,
  }))
  // Crash/exit of the writer must release its OS-owned lease.
  await ownerA.close()
  ownerA=undefined
  assert.equal((await ownerB.rpc('thread/resume',{threadId})).thread?.id,threadId)
  assert.equal(await until(()=>modelRequests.length===2),true,
   'After first owner exits, another process must be able to continue the goal')
  assert.equal(await until(()=>ownerB!.turnIds(threadId).length===1),true)
  const takeoverTurnId=ownerB.turnIds(threadId)[0]!
  assert.notEqual(takeoverTurnId,firstTurnId)
  assert.equal(modelRequests.length,2,
   'One explicit owner transfer must only start one new model request')
  console.log('CODEX_CROSS_PROCESS_GOAL_COLD_TAKEOVER_PASS '+JSON.stringify({
   version:process.env.AGENT_PICKET_CODEX_EXPECT_VERSION,
   modelRequests:modelRequests.length,
  }))
  // This proves an OS lease and bounded test-only recovery, not conditional
  // Goal mutation under concurrent user stop/resume.
 }catch(error){
  firstFailure=error
  throw error
 }finally{
  // Only event COUNTS; never log model request bodies, prompts or IDs.
  stage('cleanup-model-requests-'+modelRequests.length)
  await Promise.allSettled([ownerA?.close(),ownerB?.close()])
  for(const response of responses)try{response.end()}catch{/* cleanup */}
  // The newer official Host may leave SSE keep-alive clients in flight after
  // terminating App-Server. Shut down the test-owned server deterministically.
  server.closeAllConnections()
  await new Promise<void>(resolve=>server.close(()=>resolve()))
  // Windows official app-servers can release their final native file handles
  // AFTER the process exit notification. A bounded retry is not permission
  // to ignore active writer processes or a failed OS ownership assertion.
  let cleanupError:unknown
  for(let attempt=0;attempt<10;attempt++){
   try{
    rmSync(root,{recursive:true,force:true,maxRetries:12,retryDelay:200})
    cleanupError=undefined
    break
   }catch(error){
    cleanupError=error
    if(attempt<9)await new Promise(resolve=>setTimeout(resolve,700))
   }
  }
  if(cleanupError!==undefined){
   stage('disposable-workspace-cleanup-unconfirmed')
   // Never hide the original official Host safety assertion.
   if(firstFailure===null)throw cleanupError
  }
 }

 async function launch(){
  const owner=++ownerNumber
  stage('owner-'+owner+'-app-server')
  const env={...process.env,CODEX_HOME:home,
   CODEX_APP_SERVER_DISABLE_MANAGED_CONFIG:'1',CODEX_DISABLE_TELEMETRY:'1',
   HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',NO_PROXY:'127.0.0.1,localhost'}
  const child=spawn(bin!,['app-server','--enable','goals'],{
   cwd:root,env,stdio:'pipe',windowsHide:true,
  })
  const pending=new Map<number,(frame:Frame)=>void>()
  const notifications:Frame[]=[]
  let next=0
  createInterface({input:child.stdout}).on('line',line=>{
   try{
    const frame=JSON.parse(line) as Frame
    if(typeof frame.id==='number'){
     pending.get(frame.id)?.(frame);pending.delete(frame.id)
    }else if(frame.method)notifications.push(frame)
   }catch{/* malformed Host output never authorizes enforcement */}
  })
  child.stderr.resume()
  async function rpcRaw(method:string,params:Record<string,unknown>){
   const id=++next
   stage('owner-'+owner+'-rpc-begin-'+method)
   const reply=new Promise<Frame>(resolve=>pending.set(id,resolve))
   child.stdin.write(JSON.stringify({id,method,params})+'\n')
   return Promise.race([reply,new Promise<never>((_,reject)=>
    setTimeout(()=>reject(Error('Native Codex timeout: '+method)),8_000).unref())])
  }
  async function rpc(method:string,params:Record<string,unknown>){
   const result=await rpcRaw(method,params)
   assert.equal(result.error,undefined,'Official Codex rejected '+method)
   stage('owner-'+owner+'-rpc-ok-'+method)
   return result.result
  }
  const close=async()=>{
   child.stdin.end()
   const exited=new Promise<void>(resolve=>{
    if(child.exitCode!==null||child.signalCode!==null)resolve()
    else child.once('exit',()=>resolve())
   })
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM')
   await Promise.race([exited,new Promise<void>(resolve=>setTimeout(resolve,1000).unref())])
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')
   await Promise.race([exited,new Promise<void>(resolve=>setTimeout(resolve,1000).unref())])
  }
  try{
   const initialized=await rpc('initialize',{clientInfo:{name:'picket-native-multi-owner',
    title:'Synthetic Codex owner exclusivity probe',version:'0.0.0'},
    capabilities:{experimentalApi:true}})
   assert.equal(typeof initialized.codexHome,'string')
   // Windows official Host may report the SAME directory via a short/NT
   // path. Never trust a lexical path: compare actual filesystem identity.
   const expected=lstatSync(home,{bigint:true})
   const actual=lstatSync(initialized.codexHome,{bigint:true})
   assert.ok(expected.isDirectory()&&actual.isDirectory()
    &&!actual.isSymbolicLink()&&expected.dev===actual.dev
    &&expected.ino>0n&&expected.ino===actual.ino,
    'Official Codex must use the exact test-owned CODEX_HOME')
   child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n')
   return {rpc,rpcRaw,turnIds:(threadId:string)=>notifications.filter(frame=>
    frame.method==='turn/started'&&frame.params?.threadId===threadId
   ).map(frame=>frame.params?.turn?.id).filter((value):value is string=>typeof value==='string'),
    close}
  }catch(error){
   // Never leak a live native App-Server when validation fails before
   // assigning ownerA/ownerB, or Windows cleanup will hide the root error.
   await close()
   throw error
  }
 }
})

async function until(predicate:()=>boolean,timeout=9_000){
 const deadline=Date.now()+timeout
 while(Date.now()<deadline){if(predicate())return true
  await new Promise(resolve=>setTimeout(resolve,30))}
 return predicate()
}
