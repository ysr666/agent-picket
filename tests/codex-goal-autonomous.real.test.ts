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
 * Native Goal runtime discovery, NOT an Agent Picket strike or lossless hold.
 * Activating a Goal on an idle Codex owner is capable of scheduling a model
 * Turn WITHOUT the client sending turn/start. Model endpoint is deliberately
 * unreachable; no model output, tool invocation or user files are involved.
 */
test('native Codex active Goal autonomously dispatches a Turn from idle owner',{
 skip:!eligible&&'Opt-in: installed isolated Codex App-Server required',timeout:50_000,
},async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'ap-codex-auto-goal-')))
 const home=join(root,'home');mkdirSync(home,{recursive:true})
 const env={...process.env,CODEX_HOME:home,CODEX_DISABLE_TELEMETRY:'1',
  OPENAI_BASE_URL:'http://127.0.0.1:9',HTTP_PROXY:'http://127.0.0.1:9',
  HTTPS_PROXY:'http://127.0.0.1:9',ALL_PROXY:'http://127.0.0.1:9'}
 const child=spawn(bin!,['app-server','--enable','goals'],{
  cwd:root,env,stdio:'pipe',windowsHide:true,
 })
 type Frame={id?:number;result?:any;error?:{message?:string};method?:string;
   params?:{threadId?:string;turn?:{id?:string;status?:string}}}
 const pending=new Map<number,(response:Frame)=>void>()
 const notifications:Frame[]=[]
 let index=0
 createInterface({input:child.stdout}).on('line',line=>{
  try{
   const frame=JSON.parse(line) as Frame
   if(typeof frame.id==='number'){
    pending.get(frame.id)?.(frame);pending.delete(frame.id)
   }else if(frame.method)notifications.push(frame)
  }catch{/* Unrecognized messages do not authorize real Goal control */}
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
  const initialized=await rpc('initialize',{
   clientInfo:{name:'agent-picket-auto-goal-probe',
    title:'Synthetic offline native autonomy probe',version:'0.0.0'},
   capabilities:{experimentalApi:true},
  })
  assert.equal(initialized.codexHome,home)
  child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n')
  const created=await rpc('thread/start',{cwd:root,ephemeral:false})
  const threadId=created.thread?.id
  assert.equal(typeof threadId,'string')
  assert.equal(created.thread?.status?.type,'idle')
  // No manual turn/start RPC appears anywhere in this test.
  const activated=await rpc('thread/goal/set',{threadId,
   objective:'Synthetic offline native continuation observation; no real work',
   status:'active',
  })
  assert.equal(activated.goal?.status,'active')
  const deadline=Date.now()+6_000
  let started:Frame|undefined
  while(Date.now()<deadline){
   started=notifications.find(frame=>frame.method==='turn/started'
    &&frame.params?.threadId===threadId)
   if(started)break
   await new Promise(resolve=>setTimeout(resolve,30))
  }
  assert.ok(started,'An active Goal must dispatch a native Turn without manual turn/start')
  assert.equal(typeof started.params?.turn?.id,'string')
  assert.equal(started.params?.turn?.status,'inProgress')
  const current=await rpc('thread/goal/get',{threadId})
  assert.equal(current.goal?.status,'active',
   'The runtime had an active Goal when autonomous work began')
  // This cannot prove the Turn succeeds: the offline proxy intentionally
  // prevents a real model response. Never use this as strike readiness.
 }finally{
  child.stdin.end()
  const exited=new Promise<void>(resolve=>{
   if(child.exitCode!==null||child.signalCode!==null)resolve()
   else child.once('exit',()=>resolve())
  })
  child.kill('SIGTERM')
  await Promise.race([exited,new Promise<void>(resolve=>setTimeout(resolve,1000).unref())])
  if(child.exitCode===null)child.kill('SIGKILL')
  await Promise.race([exited,new Promise<void>(resolve=>setTimeout(resolve,1000).unref())])
  rmSync(root,{recursive:true,force:true})
 }
})
