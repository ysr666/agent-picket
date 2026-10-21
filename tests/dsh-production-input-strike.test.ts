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
  realInputStrikeConsent:'discard-resend-v1',realInputStrikeCampaign:campaign}
 let revision=4,reads=0,mutateRevision=false,duplicates=false
 const settings:NativeSettingsProvider={
  get:()=>data,describe(){
   reads++
   if(mutateRevision&&reads%2===0)revision++
   const row={ns:'agent-picket',revision,value:data}
   return duplicates?[row,row]:[row]
  },async update(){throw Error('read-only')}
 }
 assert.deepEqual(readHostActiveInputStrike(settings,'session-A',now),{
  sessionId:'session-A',hostRevision:4,
 })
 assert.equal(readHostActiveInputStrike(settings,'session-B',now),null)
 assert.equal(readHostActiveInputStrike(settings,'session-A',now+INPUT_STRIKE_DURATION_MS),null)
 data={...data,realInputStrikeConsent:'off'}
 assert.equal(readHostActiveInputStrike(settings,'session-A',now),null)
 data={...data,realInputStrikeConsent:'discard-resend-v1',welcomeDecision:'not-now'}
 assert.equal(readHostActiveInputStrike(settings,'session-A',now),null)
 data={...data,welcomeDecision:'enabled'}
 reads=0;mutateRevision=true
 assert.equal(readHostActiveInputStrike(settings,'session-A',now),null)
 mutateRevision=false;duplicates=true
 assert.equal(readHostActiveInputStrike(settings,'session-A',now),null)
 assert.equal(readHostActiveInputStrike(undefined,'session-A',now),null)
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
 await assert.rejects(h.control.choose('discard-resend-v1'),/agreement/)
 await h.control.choose('discard-resend-v1',INPUT_DISCARD_DISCLOSURE)
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
 await h.control.choose('discard-resend-v1',INPUT_DISCARD_DISCLOSURE)
 await h.control.setArmed(true)
 await h.control.choose('off')
 assert.deepEqual(h.writes.at(-1),{
  realInputStrikeConsent:'off',realInputStrikeCampaign:'',
 })
 assert.equal(h.control.snapshot().armed,false)
 const second=harness()
 await second.control.choose('discard-resend-v1',INPUT_DISCARD_DISCLOSURE)
 second.breakWrites()
 await assert.rejects(second.control.setArmed(true),/Host did not confirm/)
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
