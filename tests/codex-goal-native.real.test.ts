import assert from 'node:assert/strict'
import test from 'node:test'
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {mkdtempSync,mkdirSync,rmSync,realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const bin=process.env.AGENT_PICKET_CODEX_BIN
const eligible=!!bin&&process.env.AGENT_PICKET_CODEX_GOAL_NATIVE==='1'

test('Codex official App-Server preserves a paused idle Goal across process restart',{
  skip:!eligible&&'Opt-in: isolated official Codex binary required',
  timeout:45_000,
},async()=>{
  const root=realpathSync(mkdtempSync(join(tmpdir(),'ap-codex-goal-native-')))
  const home=join(root,'home');mkdirSync(home,{recursive:true})
  const env={...process.env,CODEX_HOME:home,CODEX_DISABLE_TELEMETRY:'1',
    OPENAI_BASE_URL:'http://127.0.0.1:9',HTTP_PROXY:'http://127.0.0.1:9',
    HTTPS_PROXY:'http://127.0.0.1:9',ALL_PROXY:'http://127.0.0.1:9'}
  type Frame={id?:number;error?:{message?:string};result?:any;method?:string}
  async function launch(){
    const child=spawn(bin!,['app-server','--enable','goals'],{
      cwd:root,env,stdio:'pipe',windowsHide:true,
    })
    const awaiting=new Map<number,(frame:Frame)=>void>()
    const notifications:string[]=[]
    let next=0
    createInterface({input:child.stdout}).on('line',(line)=>{
      try {const frame=JSON.parse(line) as Frame
        if(typeof frame.id==='number'){
          awaiting.get(frame.id)?.(frame);awaiting.delete(frame.id)
        }else if(frame.method)notifications.push(frame.method)
      }catch{/* malformed Host messages cannot enable actions */}
    })
    child.stderr.resume()
    const rpc=async(method:string,params:Record<string,unknown>)=>{
      const id=++next
      const response=new Promise<Frame>(resolve=>awaiting.set(id,resolve))
      child.stdin.write(JSON.stringify({id,method,params})+'\n')
      const frame=await Promise.race([response,new Promise<never>((_,reject)=>
        setTimeout(()=>reject(new Error('Official Codex timeout: '+method)),9_000).unref())])
      assert.equal(frame.error,undefined,'Codex rejected '+method)
      return frame.result
    }
    const init=await rpc('initialize',{clientInfo:{name:'agent-picket-native-probe',
      title:'Isolated offline Goal persistence test',version:'0.0.0'},
      capabilities:{experimentalApi:true}})
    assert.equal(init.codexHome,home)
    child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n')
    return {rpc,notifications,async close(){
      child.stdin.end()
      const exit=new Promise<void>(resolve=>{
        if(child.exitCode!==null||child.signalCode!==null)resolve()
        else child.once('exit',()=>resolve())
      })
      await Promise.race([exit,new Promise<void>(resolve=>{setTimeout(resolve,1200).unref()})])
      if(child.exitCode===null)child.kill('SIGTERM')
      await Promise.race([exit,new Promise<void>(resolve=>{setTimeout(resolve,1000).unref()})])
      if(child.exitCode===null)child.kill('SIGKILL')
    }}
  }
  type Owner=Awaited<ReturnType<typeof launch>>
  let first:Owner|undefined,second:Owner|undefined,third:Owner|undefined
  try {
    first=await launch()
    const created=await first.rpc('thread/start',{cwd:root,ephemeral:false})
    const id=created.thread?.id
    assert.equal(typeof id,'string')
    assert.equal(created.thread.status?.type,'idle')
    const objective='Local dummy objective — NO automatic/model turns'
    const hold=await first.rpc('thread/goal/set',{threadId:id,objective,status:'paused'})
    assert.equal(hold.goal?.status,'paused')
    assert.equal(hold.goal?.tokensUsed,0)
    assert.equal((await first.rpc('thread/goal/get',{threadId:id})).goal?.status,'paused')
    await first.close();first=undefined
    second=await launch()
    const restored=await second.rpc('thread/resume',{threadId:id})
    assert.equal(restored.thread?.id,id)
    const saved=await second.rpc('thread/goal/get',{threadId:id})
    assert.equal(saved.goal?.objective,objective)
    assert.equal(saved.goal?.status,'paused','A different App-Server must not silently restart idle Goal work')
    assert.equal(saved.goal?.tokensUsed,0)
    const blocked=await second.rpc('thread/goal/set',{threadId:id,status:'blocked'})
    assert.equal(blocked.goal?.status,'blocked')
    assert.equal((await second.rpc('thread/goal/get',{threadId:id})).goal?.status,'blocked')
    assert.ok(second.notifications.includes('thread/goal/updated'))
    await second.close();second=undefined
    third=await launch()
    assert.equal((await third.rpc('thread/resume',{threadId:id})).thread?.id,id)
    const stillBlocked=await third.rpc('thread/goal/get',{threadId:id})
    assert.equal(stillBlocked.goal?.status,'blocked',
      'Blocked status survives a SECOND complete App-Server restart')
    assert.equal(stillBlocked.goal?.objective,objective)
    assert.equal(stillBlocked.goal?.tokensUsed,0)

  }finally{
    await Promise.allSettled([first?.close(),second?.close(),third?.close()])
    rmSync(root,{recursive:true,force:true})
  }
})
