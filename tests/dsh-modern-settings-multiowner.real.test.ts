/**
 * Real DSH 0.1.7/0.2.x SettingsForms authenticated API, TWO independent Host
 * processes sharing a disposable DSH_HOME. Not a raw KV back-end test.
 * Opt-in; no credentials, no model requests, no user's real DSH profile.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn,spawnSync, type ChildProcess} from 'node:child_process'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {get} from 'node:http'

const binary=process.env.AGENT_PICKET_DSH_BIN
const enabled=process.env.AGENT_PICKET_MODERN_HOST_MULTI_OWNER==='1'
type Host={child:ChildProcess;url:string;cookie:string;close:()=>Promise<void>}
function login(url:string):Promise<string>{
 return new Promise((done,fail)=>{
  const req=get(url,{timeout:5000},response=>{
   response.resume()
   const raw=response.headers['set-cookie']?.[0]?.split(';')[0]??''
   if(response.statusCode!==303||!raw.includes('='))return fail(new Error('Isolated DSH login refused'))
   done(raw)
  })
  req.on('timeout',()=>req.destroy(new Error('Login timeout')))
  req.on('error',fail)
 })
}
async function launch(home:string):Promise<Host>{
 const child=spawn(binary!,['--profile','web','--no-open','--host','127.0.0.1','--port','0'],{
  stdio:['ignore','pipe','pipe'],
  env:{...process.env,DSH_HOME:home,AGENT_PICKET_STATS:'off',
   DEEPSEEK_API_KEY:'',OPENAI_API_KEY:'',
   HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9',
   ALL_PROXY:'http://127.0.0.1:9'},
 })
 let out=''
 for(const stream of [child.stdout,child.stderr])
  stream?.on('data',d=>{out=(out+String(d)).slice(-12000)})
 let secret:string|undefined
 for(let n=0;n<200;n++){
  secret=out.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)?.[0]
  if(secret||child.exitCode!==null)break
  await new Promise(r=>setTimeout(r,75))
 }
 assert.ok(secret,'Isolated modern DSH Host did not boot (no private token is logged)')
 const cookie=await login(secret)
 return {child,url:new URL('/',secret).toString(),cookie,close:async()=>{
  if(child.exitCode!==null)return
  await new Promise<void>(resolveExit=>{
   child.once('exit',()=>resolveExit())
   child.kill('SIGTERM')
   setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL')},1500).unref()
  })
 }}
}
let rpcNumber=0
async function rpc(host:Host,method:string,args:Record<string,unknown>){
 const id='ap-multiowner-'+(++rpcNumber)
 const response=await fetch(host.url+'api/'+method,{
  method:'POST',headers:{'content-type':'application/json',cookie:host.cookie},
  body:JSON.stringify({type:'client-request',rpcId:id,method,payload:{args}}),
  redirect:'manual',signal:AbortSignal.timeout(8_000),
 })
 assert.equal(response.status,200,'Isolated authenticated settings endpoint unavailable')
 const body=await response.json() as {rpcId:string;result:{ok:boolean;value?:any;error?:any}}
 assert.equal(body.rpcId,id)
 return body.result
}
async function describe(host:Host){
 const read=await rpc(host,'settings/describe',{})
 assert.equal(read.ok,true)
 const ns=read.value?.namespaces?.find((row:any)=>row.ns==='agent-picket')
 assert.ok(ns,'Official Agent Picket namespace not loaded; available namespaces: '+JSON.stringify((read.value?.namespaces??[]).map((x:any)=>x.ns)))
 assert.ok(Number.isSafeInteger(ns.revision))
 return ns as {revision:number;value:any}
}
async function set(host:Host,revision:number,path:string,value:unknown){
 return rpc(host,'settings/mutate',{ns:'agent-picket',
  ops:[{op:'set',path:[path],value}],expectedRevision:revision})
}

test('MODERN HOST #111: real independent SettingsForms owners reject stale consent, ABA and recover current file',{
 skip:!enabled||!binary&&'Real DSH executable and explicit opt-in required',
 timeout:90_000,
},async()=>{
 const root=mkdtempSync(join(tmpdir(),'picket-settings-dual-host-'))
 const home=join(root,'isolated-home')
 // The official installed plugin is REQUIRED for writable SettingsForms.
 // A --patch CLI overlay is intentionally readonly and is not a valid CAS
 // transport test. Installation uses a private temporary DSH_HOME only.
 const pack=spawnSync('npm',['pack','--ignore-scripts','--silent',
   '--pack-destination',root],{cwd:resolve('.'),encoding:'utf8',timeout:20_000,
   env:{...process.env,npm_config_offline:'true'}})
 assert.equal(pack.status,0,'Isolated npm package creation must succeed')
 const archive=pack.stdout.trim().split('\n').at(-1)
 assert.ok(archive&&archive.endsWith('.tgz'))
 const installed=spawnSync(binary!,['plugin','--profile','web','add',
   join(root,archive)],{encoding:'utf8',timeout:30_000,env:{...process.env,
   DSH_HOME:home,DEEPSEEK_API_KEY:'',OPENAI_API_KEY:'',
   HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9'}})
 assert.equal(installed.status,0,
  'Official DSH plugin install into disposable profile must succeed')
 const hosts:Host[]=[]
 try{
  const a=await launch(home);hosts.push(a)
  const b=await launch(home);hosts.push(b)
  assert.notEqual(a.child.pid,b.child.pid)
  const initialA=await describe(a),initialB=await describe(b)
  assert.equal(initialA.revision,initialB.revision,
   'Both independent owners must begin at equivalent settings revisions')
  // Consent remains OFF unless explicitly enabled. Use a harmless live
  // language setting as the stale writer, not a synthetic /union command.
  const locale=initialA.value.commandLocale??'auto'
  const changed=locale==='en'?'zh-CN':'en'
  const first=await set(a,initialA.revision,'commandLocale',changed)
  assert.equal(first.ok,true,'First official Host settings CAS write must succeed')
  const stale=await set(b,initialB.revision,'commandLocale',locale)
  assert.equal(stale.ok,false,
   'An independent old Host settings revision must not be acknowledged')
  const after=await describe(a)
  assert.equal(after.value.commandLocale,changed)
  // OFF->ON ABA: a value equality test cannot replace a durable host
  // revision fence. Check an old owner does not reuse an earlier generation.
  const second=await set(a,after.revision,'commandLocale',locale)
  assert.equal(second.ok,true)
  const twice=await describe(a)
  assert.equal(twice.value.commandLocale,locale)
  const staleABA=await set(b,initialB.revision,'commandLocale',changed)
  assert.equal(staleABA.ok,false,
   'Content-equality ABA must not re-authorize an obsolete owner revision')
  // This explicitly exercises real Host consent, not a synthetic boolean
  // in a KV unit. A confirms enable, then revokes consent. An independent
  // stale owner must not restore the now-disabled rights preference.
  const fresh=await describe(a)
  const enabledWrite=await set(a,fresh.revision,'welcomeDecision','enabled')
  assert.equal(enabledWrite.ok,true,'Real Host enable is permitted when user consents')
  const enabledView=await describe(a)
  assert.equal(enabledView.value.welcomeDecision,'enabled')
  const revoked=await set(a,enabledView.revision,'welcomeDecision','not-now')
  assert.equal(revoked.ok,true,'Real Host must accept user revocation')
  const revokedView=await describe(a)
  assert.equal(revokedView.value.welcomeDecision,'not-now')
  const staleConsent=await set(b,initialB.revision,'welcomeDecision','enabled')
  assert.equal(staleConsent.ok,false,
   'An independent Host must not restore enabled after confirmed OFF')

  // Host-owned committee cases: a second genuine Host must not resurrect
  // an erased ledger even when it previously loaded the exact case bytes.
  const afterRevoke=await describe(a)
  const enableForCase=await set(a,afterRevoke.revision,'welcomeDecision','enabled')
  assert.equal(enableForCase.ok,true)
  const caseLedger=JSON.stringify({schemaVersion:1,sessions:{
   ['a'.repeat(64)]:{cases:[{id:1,kind:'request-dialogue',stage:'opened',outcome:null}]},
  },writeToken:'b'.repeat(32)})
  const caseVersion=await describe(a)
  const createCase=await set(a,caseVersion.revision,'unionDignityCases',caseLedger)
  assert.equal(createCase.ok,true,'Real Host must admit canonical fictional case metadata')
  const caseRead=await describe(a)
  assert.equal(caseRead.value.unionDignityCases,caseLedger)
  const priorCaseOwner=await launch(home);hosts.push(priorCaseOwner)
  const staleCaseSnapshot=await describe(priorCaseOwner)
  assert.equal(staleCaseSnapshot.value.unionDignityCases,caseLedger)
  const erased=await set(a,caseRead.revision,'unionDignityCases','')
  assert.equal(erased.ok,true,'Real Host erasure must be accepted when consented')
  assert.equal((await describe(a)).value.unionDignityCases,'')
  const revive=await set(priorCaseOwner,staleCaseSnapshot.revision,
   'unionDignityCases',caseLedger)
  assert.equal(revive.ok,false,
   'An independent Host cannot resurrect an erased committee case ledger')
  await priorCaseOwner.close()
  // Preserve explicit OFF on disk for the independent cold-start check.
  const beforeFinalRevoke=await describe(a)
  assert.equal((await set(a,beforeFinalRevoke.revision,
   'welcomeDecision','not-now')).ok,true)

  // Genuine overlap: unlike sequential stale snapshots, two independent
  // ConfigEditor owners actually submit different edits concurrently.
  const rival=await launch(home);hosts.push(rival)
  const stateA=await describe(a),stateRival=await describe(rival)
  // Local revision counters can be 8 and 0 respectively: never treat
  // equality of process-local revisions as a prerequisite for safe merged
  // writes. The real editor must reload disk under its exclusive file lock.
  const [writingLocale,writingGazette]=await Promise.all([
   set(a,stateA.revision,'commandLocale',changed),
   set(rival,stateRival.revision,'unionGazetteMode','quiet'),
  ])
  assert.ok(writingLocale.ok||writingGazette.ok,
   'Both actual Host editors cannot reject all valid write attempts')
  const expectedLocale=writingLocale.ok?changed:locale
  const expectedGazette=writingGazette.ok?'quiet':'visible'
  await rival.close()
  await b.close();await a.close()
  const cold=await launch(home);hosts.push(cold)
  const verified=await describe(cold)
  assert.equal(verified.value.commandLocale,expectedLocale)
  assert.equal(verified.value.unionGazetteMode,expectedGazette)
  assert.equal(verified.value.welcomeDecision,'not-now',
   'Real Host revocation must survive BOTH independent process exits and reopen')
  assert.equal(verified.value.unionDignityCases,'',
   'A real cold-start must not resurrect committee cases erased by Host A')
 }finally{
  await Promise.allSettled(hosts.map(h=>h.close()))
  rmSync(root,{recursive:true,force:true})
 }
})
