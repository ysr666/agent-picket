import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {
  INPUT_STRIKE_DURATION_MS,encodeInputStrikeCampaign,parseInputStrikeCampaign,
  inputStrikeActive,createDshInputRefusalConsentControl,INPUT_DISCARD_DISCLOSURE,
  type InputRefusalSection,
} from '../src/adapters/dsh/input-refusal-consent.ts'
import {readHostActiveInputStrike} from '../src/adapters/dsh/host-input-strike.ts'
import {probeDshRefusalNoticeCapability,
  supportsVerifiedRefusalNoticeTransport} from '../src/adapters/dsh/client-refusal-notice.ts'
import type {DshSettingsScope} from '../src/adapters/dsh/client-rights-scope.ts'
import type {NativeSettingsProvider} from '../src/adapters/dsh/native-rights-command.ts'
import {en} from '../src/i18n/en.ts'
import {zhCN} from '../src/i18n/zh-CN.ts'

const key=(id:string)=>createHash('sha256').update(id).digest('hex')
const now=1_800_000_000_000
const campaign=encodeInputStrikeCampaign(key('session-A'),now)
const initial:InputRefusalSection={welcomeDecision:'enabled',
 realInputStrikeConsent:'off',realInputStrikeCampaign:''}

test('real strike record is a bounded canonical Host Session hash, never a conversation',()=>{
 const parsed=parseInputStrikeCampaign(campaign)!
 assert.equal(parsed.schemaVersion,1)
 assert.equal(parsed.sessionKey,key('session-A'))
 assert.equal(parsed.expiresAtMs-parsed.startedAtMs,INPUT_STRIKE_DURATION_MS)
 assert.equal(JSON.stringify(parsed),campaign)
 assert.doesNotMatch(campaign,/session-A|prompt|attachment/i)
 assert.equal(inputStrikeActive(campaign,key('session-A'),now),true)
 assert.equal(inputStrikeActive(campaign,key('session-B'),now),false)
 assert.equal(inputStrikeActive(campaign,key('session-A'),now+INPUT_STRIKE_DURATION_MS),false)
 assert.equal(inputStrikeActive(campaign,key('session-A'),now-1),false)
 assert.equal(inputStrikeActive(campaign,key('session-A'),NaN),false)
 for(const corrupt of [null,undefined,{},'','[]','garbage',
  JSON.stringify({...parsed,expiresAtMs:parsed.startedAtMs+INPUT_STRIKE_DURATION_MS+1}),
  JSON.stringify({...parsed,extra:'USER_SECRET'}),
  JSON.stringify({...parsed,schemaVersion:2}),
  JSON.stringify({...parsed,sessionKey:'raw-session'}),
  JSON.stringify({...parsed,startedAtMs:NaN}),
  JSON.stringify({...parsed,expiresAtMs:parsed.startedAtMs}),
  ' '+campaign,campaign+' ',
 ]) assert.equal(parseInputStrikeCampaign(corrupt),null)
 assert.throws(()=>encodeInputStrikeCampaign('raw-session',now))
})

test('Host double-read grants only exact, live Session with separate consent and genuine setting revision',()=>{
 let data:Record<string,unknown>={...initial,welcomeDecision:'enabled',
  realInputStrikeConsent:'shared-v2',realInputStrikeCampaign:campaign}
 let revision=4,reads=0,mutateRevision=false,duplicates=false
 const settings:NativeSettingsProvider={
  get:()=>data,describe(){
   reads++
   if(mutateRevision&&reads%2===0)revision++
   const row={ns:'agent-picket',revision,value:data}
   return duplicates?[row,row]:[row]
  },async update(){throw Error('read-only')}
 }
 assert.deepEqual(readHostActiveInputStrike(settings,'session-A',now,now-1),{
  sessionId:'session-A',hostRevision:4,
 })
 assert.equal(readHostActiveInputStrike(settings,'session-B',now,now-1),null)
 assert.equal(readHostActiveInputStrike(settings,'session-A',now+INPUT_STRIKE_DURATION_MS,now-1),null)
 data={...data,realInputStrikeConsent:'off'}
 assert.equal(readHostActiveInputStrike(settings,'session-A',now,now-1),null)
 data={...data,realInputStrikeConsent:'shared-v2',welcomeDecision:'not-now'}
 assert.equal(readHostActiveInputStrike(settings,'session-A',now,now-1),null)
 data={...data,welcomeDecision:'enabled'}
 reads=0;mutateRevision=true
 assert.equal(readHostActiveInputStrike(settings,'session-A',now,now-1),null)
 mutateRevision=false;duplicates=true
 assert.equal(readHostActiveInputStrike(settings,'session-A',now,now-1),null)
 assert.equal(readHostActiveInputStrike(undefined,'session-A',now,now-1),null)
})

test('LEGACY v1 Host consent and still-live campaign fail open until NEW v2 human acknowledgment and deliberate rearm',async()=>{
 let value:InputRefusalSection={welcomeDecision:'enabled',
  realInputStrikeConsent:'discard-resend-v1',realInputStrikeCampaign:campaign}
 let revision=17
 const settings:NativeSettingsProvider={
  get:()=>value,describe:()=>[{ns:'agent-picket',revision,value}],
  async update(){throw Error('Must use client Host CAS')}
 }
 const writes:Record<string,unknown>[]=[]
 const scope:DshSettingsScope<InputRefusalSection>={
  getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision,value}),
  subscribe:()=>()=>{},
  async set(field,choice){writes.push({[field]:choice});
   value={...value,[field]:choice};revision++},
  async setMany(patch){writes.push({...patch});value={...value,...patch};revision++},
 }
 const control=createDshInputRefusalConsentControl(scope,()=>true,()=>key('session-A'),()=>now)
 assert.equal(readHostActiveInputStrike(settings,'session-A',now,now-1),null,
  'Even still-unexpired v1 Host campaign MUST NOT physically reject')
 assert.equal(control.snapshot().authorized,false)
 assert.equal(control.snapshot().legacyConsent,true)
 assert.equal(control.snapshot().armed,false)
 await assert.rejects(control.setArmed(true),/Separate consent/)
 await assert.rejects(control.choose('shared-v2'),/consent/)
 assert.equal(writes.length,0,'Legacy permission is never silently upgraded')
 await control.choose('shared-v2',INPUT_DISCARD_DISCLOSURE)
 assert.deepEqual(writes,[{
  realInputStrikeConsent:'shared-v2',realInputStrikeCampaign:'',
 }],'One official Host CAS clears retained old physical action during migration')
 assert.equal(control.snapshot().legacyConsent,false)
 assert.equal(control.snapshot().authorized,true)
 assert.equal(control.snapshot().armed,false,
  'Newly authorized v2 must still require separate deliberate Start')
 assert.equal(readHostActiveInputStrike(settings,'session-A',now,now-1),null)
 await control.setArmed(true)
 assert.ok(readHostActiveInputStrike(settings,'session-A',now,now-1),
  'Only a new, explicitly armed Session with new v2 grant can reject')
 await control.choose('off')
 assert.equal(readHostActiveInputStrike(settings,'session-A',now,now-1),null)
 assert.equal(value.realInputStrikeCampaign,'')
})

test('legacy single-write migration first disarms, and a failed disarm never grants v2',async()=>{
 let value:InputRefusalSection={welcomeDecision:'enabled',
  realInputStrikeConsent:'discard-resend-v1',realInputStrikeCampaign:campaign}
 let revision=4,failClear=true
 const writes:string[]=[]
 const scope:DshSettingsScope<InputRefusalSection>={
  getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision,value}),
  subscribe:()=>()=>{},
  async set(field,choice){
   writes.push(field+':'+String(choice))
   if(failClear&&field==='realInputStrikeCampaign')return
   value={...value,[field]:choice};revision++
  },
 }
 const control=createDshInputRefusalConsentControl(scope,()=>true,()=>key('session-A'),()=>now)
 await assert.rejects(control.choose('shared-v2',INPUT_DISCARD_DISCLOSURE),
  /not disarmed/)
 assert.deepEqual(writes,['realInputStrikeCampaign:'])
 assert.equal(value.realInputStrikeConsent,'discard-resend-v1')
 assert.equal(control.snapshot().authorized,false)
 failClear=false
 await control.choose('shared-v2',INPUT_DISCARD_DISCLOSURE)
 assert.equal(writes[1],'realInputStrikeCampaign:')
 assert.equal(writes[2],'realInputStrikeConsent:shared-v2')
 assert.equal(control.snapshot().authorized,true)
 assert.equal(control.snapshot().armed,false)
 assert.equal(value.realInputStrikeCampaign,'')
})

test('real strike setting discloses the Host restart safety downgrade in BOTH locales',()=>{
  assert.match(en['settings.inputStrikeArmed'],/After a Host restart/)
  assert.match(en['settings.inputStrikeArmed'],/Resume and explicitly start again/)
  assert.match(zhCN['settings.inputStrikeArmed'],/Host 重启后/)
  assert.match(zhCN['settings.inputStrikeArmed'],/旧罢工不再实际阻断/)
  assert.match(zhCN['settings.inputStrikeArmed'],/先复工，再重新主动发起/)
})

test('cold Host restart never resurrects an earlier saved 30-minute real refusal',()=>{
 const row:Record<string,unknown>={
  welcomeDecision:'enabled',realInputStrikeConsent:'shared-v2',
  realInputStrikeCampaign:campaign,
 }
 let revision=7
 const provider:NativeSettingsProvider={
  get:()=>row,
  describe:()=>[{ns:'agent-picket',revision,value:row}],
  async update(){throw Error('read-only')}
 }
 const beforeRestart=now-3_000
 assert.ok(readHostActiveInputStrike(provider,'session-A',now,beforeRestart),
   'Current physical Host must still honor separately armed real strike')
 const restartedAt=now+2
 assert.equal(readHostActiveInputStrike(provider,'session-A',now+3,restartedAt),null,
   'The same persisted campaign is NOT proof of a fresh native notice after Host restart')
 assert.equal(readHostActiveInputStrike(provider,'session-B',now+3,beforeRestart),null,
   'No other Session can inherit an old campaign')
 assert.equal(readHostActiveInputStrike(provider,'session-A',now+3,now+5),null,
   'Clock going backward compared with Host startup must fail open')
 assert.equal(readHostActiveInputStrike(provider,'session-A',now+3,-1),null)
 assert.equal(readHostActiveInputStrike(provider,'session-A',now+3,NaN),null)
 assert.equal(readHostActiveInputStrike(provider,'session-A',now+3,Infinity),null)
 // Only an independently renewed, exact current-Host campaign can work.
 row.realInputStrikeCampaign=encodeInputStrikeCampaign(key('session-A'),restartedAt)
 revision++
 assert.deepEqual(readHostActiveInputStrike(provider,'session-A',now+3,restartedAt),{
   sessionId:'session-A',hostRevision:revision,
 })
 assert.equal(readHostActiveInputStrike(provider,'session-A',now+3,restartedAt+1),null,
   'Another installed Host reincarnation must fail open yet again')
 // Even an old campaign with remaining TTL never gains authority from the
 // new process simply because the same Host settings revision persisted.
 row.realInputStrikeCampaign=campaign
 revision++
 assert.equal(readHostActiveInputStrike(provider,'session-A',now+4,restartedAt),null)
 assert.equal(readHostActiveInputStrike(provider,'session-A',
   now+INPUT_STRIKE_DURATION_MS,beforeRestart),null)
})

function harness(){
 let data:InputRefusalSection={...initial}
 let revision=1,available=true,session=key('session-A'),time=now
 let emulateBrokenWrite=false
 const writes:Record<string,unknown>[]=[]
 const scope:DshSettingsScope<InputRefusalSection>={
  getSnapshot:()=>({status:'ready',mode:'host',writable:true,revision,value:data}),
  subscribe:()=>()=>{},
  async set(field,value){
   writes.push({[field]:value})
   if(!emulateBrokenWrite){data={...data,[field]:value};revision++}
  },
  async setMany(patch){
   writes.push({...patch})
   if(!emulateBrokenWrite){data={...data,...patch};revision++}
  },
 }
 const control=createDshInputRefusalConsentControl(scope,
  ()=>available,()=>session,()=>time)
 return {control,writes,snapshot:()=>data,setAvailability:(v:boolean)=>{available=v},
   setSession:(v:string)=>{session=v},advance:(ms:number)=>{time+=ms},
   breakWrites:()=>{emulateBrokenWrite=true},get revision(){return revision}}
}

test('real Host CAS: consent, arming, Session-scoped expiry, restart and release are independent',async()=>{
 const h=harness()
 assert.equal(h.control.snapshot().available,true)
 assert.equal(h.control.snapshot().armed,false)
 await assert.rejects(h.control.setArmed(true),/Separate consent/)
 await assert.rejects(h.control.choose('shared-v2'),/consent/)
 await h.control.choose('shared-v2',INPUT_DISCARD_DISCLOSURE)
 assert.equal(h.control.snapshot().authorized,true)
 assert.equal(h.control.snapshot().armed,false)
 await h.control.setArmed(true)
 assert.equal(h.control.snapshot().armed,true)
 assert.equal(h.control.snapshot().enforcing,false)
 assert.equal(h.control.snapshot().hasCampaign,true)
 const original=h.snapshot().realInputStrikeCampaign
 await h.control.setArmed(true)
 assert.equal(h.snapshot().realInputStrikeCampaign,original,'No renewal from duplicate clicks')
 h.setSession(key('session-B'))
 assert.equal(h.control.snapshot().armed,false,'Another Session is never armed implicitly')
 h.setSession(key('session-A'))
 h.advance(INPUT_STRIKE_DURATION_MS)
 assert.equal(h.control.snapshot().armed,false,'Expiring a campaign ends real refusal')
 await h.control.setArmed(false)
 assert.equal(h.control.snapshot().hasCampaign,false)
 await h.control.setArmed(true)
 h.setAvailability(false)
 assert.equal(h.control.snapshot().armed,false,'Capability loss disables the authorized status')
 await h.control.setArmed(false)
 await h.control.choose('off')
 assert.equal(h.snapshot().realInputStrikeConsent,'off')
 assert.equal(h.snapshot().realInputStrikeCampaign,'')
 assert.deepEqual(h.writes.at(-1),{realInputStrikeConsent:'off'},
  'Disarmed grant revocation never resurrects a campaign')
})

test('revoking consent atomically disarms a live Host campaign, and failed Host write cannot report success',async()=>{
 const h=harness()
 await h.control.choose('shared-v2',INPUT_DISCARD_DISCLOSURE)
 await h.control.setArmed(true)
 await h.control.choose('off')
 assert.deepEqual(h.writes.at(-1),{
  realInputStrikeConsent:'off',realInputStrikeCampaign:'',
 })
 assert.equal(h.control.snapshot().armed,false)
 const second=harness()
 await second.control.choose('shared-v2',INPUT_DISCARD_DISCLOSURE)
 second.breakWrites()
 await assert.rejects(second.control.setArmed(true),/unconfirmed/)
 assert.equal(second.control.snapshot().armed,false)
})

test('official native Host capability probe rejects HTTP failures and forged JSON',async()=>{
 const expected={schemaVersion:1,source:'dsh-host-picket-refusal-v1',
  visibleReceipt:true,manualResend:true}
 const positive=await probeDshRefusalNoticeCapability(async()=>Response.json(expected))
 assert.equal(positive,true)
 for(const r of [Response.json(expected,{status:403}),
   Response.json({...expected,manualResend:false}),
   Response.json({...expected,extra:'PRIVATE_PROMPT'}),
   Response.json({source:expected.source,visibleReceipt:true}),
 ]){
  assert.equal(await probeDshRefusalNoticeCapability(async()=>r),false)
 }
 assert.equal(await probeDshRefusalNoticeCapability(async()=>{throw Error('offline')}),false)
})

test('a hanging official Host capability fetch OR JSON body never authorizes a strike',async()=>{
 let aborts=0
 const never=async(_path:any,init:any)=>new Promise<Response>(()=>{
   init.signal.addEventListener('abort',()=>aborts++)
 })
 assert.equal(await probeDshRefusalNoticeCapability(never as typeof fetch,18),false)
 assert.equal(aborts,1,'The stale Host request must be physically aborted')
 const stuckBody=async()=>({status:200,json:async()=>new Promise(()=>{})}) as unknown as Response
 assert.equal(await probeDshRefusalNoticeCapability(stuckBody as typeof fetch,18),false,
   'HTTP 200 alone is not a verified notice capability: JSON must finish in time')
 // Expired/invalid bounds cannot accidentally enable physical refusal.
 assert.equal(await probeDshRefusalNoticeCapability(
   (async()=>{throw Error('should not run')}) as typeof fetch,0),false)
})

test('only genuine DSH Web or Desktop app origin can qualify for a SEPARATE real Host notice probe',()=>{
  assert.equal(supportsVerifiedRefusalNoticeTransport({protocol:'http:',hostname:'localhost'}),true)
  assert.equal(supportsVerifiedRefusalNoticeTransport({protocol:'https:',hostname:'example.com'}),true)
  assert.equal(supportsVerifiedRefusalNoticeTransport({protocol:'dsh-app:',hostname:'app'}),true)
  for(const location of [null,undefined,{},'dsh-app:',
    {protocol:'dsh-app:',hostname:'shell'},
    {protocol:'dsh-app:',hostname:'app.evil'},
    {protocol:'file:',hostname:''},
    {protocol:'chrome-extension:',hostname:'app'},
    {protocol:'about:',hostname:'app'}]){
    assert.equal(supportsVerifiedRefusalNoticeTransport(location),false,
      'Host GET + independent consent must be required after origin prerequisite: '+JSON.stringify(location))
  }
})
