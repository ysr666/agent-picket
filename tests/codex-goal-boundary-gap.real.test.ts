import assert from 'node:assert/strict'
import test from 'node:test'
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {mkdtempSync,mkdirSync,rmSync,realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const bin=process.env.AGENT_PICKET_CODEX_BIN
const eligible=!!bin&&process.env.AGENT_PICKET_CODEX_GOAL_NATIVE==='1'

/**
 * This is a deliberate negative Host-contract probe, not a valid strike.
 * Codex Goal blocked may apply to autonomous scheduling, but cannot be
 * treated as a global pre-turn veto: manual turn/start is a separate RPC.
 * All interactions use a disposable HOME, local-only offline proxy, synthetic
 * input, and no real user credentials/files or personal Codex configuration.
 */
test('native Codex blocked Goal does not itself veto an explicit new turn/start',{
 skip:!eligible&&'Opt-in: isolated official Codex binary required',timeout:50_000,
},async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ap-codex-blocked-turn-')))
 const home=join(root,'home');mkdirSync(home,{recursive:true})
 const env={...process.env,CODEX_HOME:home,CODEX_DISABLE_TELEMETRY:'1',
  OPENAI_BASE_URL:'http://127.0.0.1:9',HTTP_PROXY:'http://127.0.0.1:9',
  HTTPS_PROXY:'http://127.0.0.1:9',ALL_PROXY:'http://127.0.0.1:9'}
 const child=spawn(bin!,['app-server','--enable','goals'],{
  cwd:root,env,stdio:'pipe',windowsHide:true,
 })
 type Frame={id?:number;result?:any;error?:{message?:string};method?:string}
 const pending=new Map<number,(frame:Frame)=>void>()
 const notifications:string[]=[]
 let index=0
 createInterface({input:child.stdout}).on('line',line=>{
  try{
   const frame=JSON.parse(line) as Frame
   if(typeof frame.id==='number'){
    pending.get(frame.id)?.(frame);pending.delete(frame.id)
   }else if(frame.method)notifications.push(frame.method)
  }catch{/* An invalid Host frame never grants strike capability */}
 })
 child.stderr.resume()
 async function rpc(method:string,params:Record<string,unknown>):Promise<any>{
  const id=++index
  const result=new Promise<Frame>(resolve=>pending.set(id,resolve))
  child.stdin.write(JSON.stringify({id,method,params})+'\n')
  const frame=await Promise.race([result,new Promise<never>((_,reject)=>
   setTimeout(()=>reject(Error('Native Codex timeout: '+method)),8_000).unref())])
  assert.equal(frame.error,undefined,'Native Codex rejected '+method)
  return frame.result
 }
 try{
  const init=await rpc('initialize',{clientInfo:{name:'agent-picket-goal-negative-probe',
   title:'Offline blocked-turn contract probe',version:'0.0.0'},
   capabilities:{experimentalApi:true}})
  assert.equal(init.codexHome,home)
  child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n')
  const started=await rpc('thread/start',{cwd:root,ephemeral:false})
  const threadId=started.thread?.id
  assert.equal(typeof threadId,'string')
  const held=await rpc('thread/goal/set',{
   threadId,objective:'Synthetic offline objective; never execute user work',status:'blocked',
  })
  assert.equal(held.goal?.status,'blocked')
  const result=await rpc('turn/start',{threadId,
   input:[{type:'text',text:'OFFLINE SYNTHETIC HOST CONTRACT TEST ONLY'}],
  })
  assert.equal(typeof result.turn?.id,'string',
   'A blocked Goal does not provide a blanket pre-turn rejection')
  assert.equal(result.turn?.status,'inProgress')
  assert.equal((await rpc('thread/goal/get',{threadId})).goal?.status,'blocked',
   'Goal status is still blocked even though explicit Turn started')
  // Notifications can arrive asynchronously after the acknowledged RPC.
  const notificationDeadline=Date.now()+2_000
  while(!notifications.includes('turn/started')&&Date.now()<notificationDeadline)
   await new Promise(resolve=>setTimeout(resolve,40))
  assert.ok(notifications.includes('turn/started'),
   'Actual native App-Server emitted turn/started despite blocked Goal')
 }finally{
  child.stdin.end()
  const exit=new Promise<void>(resolve=>{
   if(child.exitCode!==null||child.signalCode!==null)resolve()
   else child.once('exit',()=>resolve())
  })
  child.kill('SIGTERM')
  await Promise.race([exit,new Promise<void>(resolve=>setTimeout(resolve,1000).unref())])
  if(child.exitCode===null)child.kill('SIGKILL')
  await Promise.race([exit,new Promise<void>(resolve=>setTimeout(resolve,1000).unref())])
  rmSync(root,{recursive:true,force:true})
 }
})
