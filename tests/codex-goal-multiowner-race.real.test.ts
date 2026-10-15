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
 * Pinpoint native Codex 0.146.1 MULTI-OWNER race in an isolated workspace.
 * One app-server has an active Goal Turn in flight; a second independent
 * app-server sharing only the disposable CODEX_HOME resumes the same thread.
 * The two local synthetic model requests prove process-local owner checks
 * are insufficient. DO NOT connect Agent Picket strike enforcement to this.
 */
test('native Codex independent App-Server owners can duplicate an active Goal Turn',{
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
  assert.equal((await ownerB.rpc('thread/resume',{threadId})).thread?.id,threadId)
  assert.equal(await until(()=>modelRequests.length>=2),true,
   'Second process unexpectedly launches another automatic model Turn')
  assert.equal(await until(()=>ownerB!.turnIds(threadId).length===1),true)
  const otherTurnId=ownerB.turnIds(threadId)[0]!
  assert.notEqual(otherTurnId,firstTurnId,
   'Same active Goal can have TWO distinct native in-flight Turns')
  assert.equal((await ownerB.rpc('thread/goal/get',{threadId})).goal?.status,'active')
  assert.equal(modelRequests.length,2,'Synthetic reproduction must remain bounded')
  // This result is a NEGATIVE capability finding, not strike permission.
 }finally{
  await Promise.allSettled([ownerA?.close(),ownerB?.close()])
  for(const response of responses)try{response.end()}catch{/* cleanup */}
  await new Promise<void>(resolve=>server.close(()=>resolve()))
  rmSync(root,{recursive:true,force:true,maxRetries:12,retryDelay:200})
 }

 async function launch(){
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
  async function rpc(method:string,params:Record<string,unknown>){
   const id=++next
   const reply=new Promise<Frame>(resolve=>pending.set(id,resolve))
   child.stdin.write(JSON.stringify({id,method,params})+'\n')
   const result=await Promise.race([reply,new Promise<never>((_,reject)=>
    setTimeout(()=>reject(Error('Native Codex timeout: '+method)),8_000).unref())])
   assert.equal(result.error,undefined,'Official Codex rejected '+method)
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
   return {rpc,turnIds:(threadId:string)=>notifications.filter(frame=>
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
