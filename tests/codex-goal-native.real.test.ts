import assert from 'node:assert/strict'
import test from 'node:test'
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {mkdtempSync,mkdirSync,rmSync,realpathSync,lstatSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const bin=process.env.AGENT_PICKET_CODEX_BIN
const eligible=!!bin&&process.env.AGENT_PICKET_CODEX_GOAL_NATIVE==='1'
// Stage-only native evidence. No Goal objective, prompts or user paths emitted.
const stage=(name:string)=>{if(process.platform==='win32')console.error('CODEX_GOAL_NATIVE_STAGE='+name)}

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
    stage('app-server-spawn')
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
      stage('rpc-begin-'+method)
      const response=new Promise<Frame>(resolve=>awaiting.set(id,resolve))
      child.stdin.write(JSON.stringify({id,method,params})+'\n')
      const frame=await Promise.race([response,new Promise<never>((_,reject)=>
        setTimeout(()=>reject(new Error('Official Codex timeout: '+method)),9_000).unref())])
      assert.equal(frame.error,undefined,'Codex rejected '+method)
      stage('rpc-ok-'+method)
      return frame.result
    }
    // A failed initialize/readback MUST still own and terminate this
    // App-Server. Otherwise Windows keeps CODEX_HOME locked, hides the
    // original assertion behind EPERM and strands the Node test worker.
    const close=async()=>{
      stage('app-server-close-begin')
      child.stdin.end()
      const exit=new Promise<void>(resolve=>{
        if(child.exitCode!==null||child.signalCode!==null)resolve()
        else child.once('exit',()=>resolve())
      })
      await Promise.race([exit,new Promise<void>(resolve=>{setTimeout(resolve,1200).unref()})])
      if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM')
      await Promise.race([exit,new Promise<void>(resolve=>{setTimeout(resolve,1000).unref()})])
      if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL')
      await Promise.race([exit,new Promise<void>(resolve=>{setTimeout(resolve,1000).unref()})])
      stage('app-server-close-return')
    }
    try{
      const init=await rpc('initialize',{clientInfo:{name:'agent-picket-native-probe',
        title:'Isolated offline Goal persistence test',version:'0.0.0'},
        capabilities:{experimentalApi:true}})
      // Windows official Codex can report an 8.3/NT spelling for the same
      // directory. Check the physical, non-symlinked test CODEX_HOME rather
      // than assuming identical lexical paths.
      assert.equal(typeof init.codexHome,'string')
      const expected=lstatSync(home,{bigint:true})
      const actual=lstatSync(init.codexHome,{bigint:true})
      assert.ok(expected.isDirectory()&&actual.isDirectory()
        &&!actual.isSymbolicLink()&&expected.dev===actual.dev
        &&expected.ino>0n&&expected.ino===actual.ino,
        'Official Codex must use the exact isolated test CODEX_HOME')
      child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n')
      return {rpc,notifications,close}
    }catch(error){
      await close()
      throw error
    }
  }
  type Owner=Awaited<ReturnType<typeof launch>>
  let first:Owner|undefined,second:Owner|undefined,third:Owner|undefined
  try {
    stage('first-host')
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
    // Separate idle Goal in the SAME actual Host owner: no model turn for
    // either session, no risk of unrequested background goal execution.
    const secondary=await first.rpc('thread/start',{cwd:root,ephemeral:false})
    const otherId=secondary.thread?.id
    assert.equal(typeof otherId,'string')
    assert.notEqual(otherId,id)
    assert.equal(secondary.thread.status?.type,'idle')
    const otherObjective='SECOND synthetic paused Goal, must not be changed'
    assert.equal((await first.rpc('thread/goal/set',{
      threadId:otherId,objective:otherObjective,status:'paused',
    })).goal?.status,'paused')
    assert.equal((await first.rpc('thread/goal/get',{threadId:otherId})).goal?.status,'paused')
    stage('first-host-close')
    await first.close();first=undefined
    stage('second-host')
    second=await launch()
    const restored=await second.rpc('thread/resume',{threadId:id})
    assert.equal(restored.thread?.id,id)
    const saved=await second.rpc('thread/goal/get',{threadId:id})
    assert.equal(saved.goal?.objective,objective)
    assert.equal(saved.goal?.status,'paused','A different App-Server must not silently restart idle Goal work')
    assert.equal(saved.goal?.tokensUsed,0)
    assert.equal((await second.rpc('thread/resume',{threadId:otherId})).thread?.id,otherId)
    const unaffectedBefore=await second.rpc('thread/goal/get',{threadId:otherId})
    assert.equal(unaffectedBefore.goal?.status,'paused')
    assert.equal(unaffectedBefore.goal?.objective,otherObjective)
    const blocked=await second.rpc('thread/goal/set',{threadId:id,status:'blocked'})
    assert.equal(blocked.goal?.status,'blocked')
    assert.equal((await second.rpc('thread/goal/get',{threadId:id})).goal?.status,'blocked')
    const unaffectedAfter=await second.rpc('thread/goal/get',{threadId:otherId})
    assert.equal(unaffectedAfter.goal?.status,'paused',
      'Blocking one Goal must not block an unrelated second thread')
    assert.equal(unaffectedAfter.goal?.tokensUsed,0)
    assert.ok(second.notifications.includes('thread/goal/updated'))
    stage('second-host-close')
    await second.close();second=undefined
    stage('third-host')
    third=await launch()
    assert.equal((await third.rpc('thread/resume',{threadId:id})).thread?.id,id)
    const stillBlocked=await third.rpc('thread/goal/get',{threadId:id})
    assert.equal(stillBlocked.goal?.status,'blocked',
      'Blocked status survives a SECOND complete App-Server restart')
    assert.equal(stillBlocked.goal?.objective,objective)
    assert.equal(stillBlocked.goal?.tokensUsed,0)
    assert.equal((await third.rpc('thread/resume',{threadId:otherId})).thread?.id,otherId)
    const stillPaused=await third.rpc('thread/goal/get',{threadId:otherId})
    assert.equal(stillPaused.goal?.status,'paused')
    assert.equal(stillPaused.goal?.objective,otherObjective)
    assert.equal(stillPaused.goal?.tokensUsed,0)

  }finally{
    stage('cleanup-start')
    await Promise.allSettled([first?.close(),second?.close(),third?.close()])
    rmSync(root,{recursive:true,force:true,maxRetries:12,retryDelay:200})
    stage('cleanup-done')
  }
})
