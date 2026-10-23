import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash} from 'node:crypto'
import {encodeInputStrikeCampaign,INPUT_STRIKE_DURATION_MS} from '../src/adapters/dsh/input-refusal-consent.ts'
import {hostToolStrikeActive,registerDshUnionToolGuard,TOOL_STRIKE_DENIAL,
  type GuardedToolCall, type ToolStrikeOwner} from '../src/adapters/dsh/tool-strike-guard.ts'
import type {NativeSettingsProvider} from '../src/adapters/dsh/native-rights-command.ts'

const boot=1_810_000_000_000
const key=(s:string)=>createHash('sha256').update(s).digest('hex')

function fixture(){
 let value:Record<string,unknown>={welcomeDecision:'enabled',
   realToolStrikeConsent:'off',realToolStrikeCampaign:''}
 let revision=1
 let throwDescribe=false
 const settings:NativeSettingsProvider={
  get:()=>value,
  describe:()=>{
   if(throwDescribe)throw Error('No Host')
   return [{ns:'agent-picket',revision,value}]
  },
  async update(){throw Error('Tests never write official Host settings')},
 }
 return {settings,
  set(p:Record<string,unknown>){value={...value,...p};revision++},
  throwDescribe(v:boolean){throwDescribe=v},
  session(s:string,when=boot+10){
   return encodeInputStrikeCampaign(key(s),when)
  }}
}

test('real tool strike is default-OFF, independent from Goal/input/symbolic settings',()=>{
 const h=fixture(),now=boot+20
 assert.equal(hostToolStrikeActive(h.settings,'A',now,boot),false)
 h.set({realInputStrikeConsent:'shared-v2',
   realInputStrikeCampaign:h.session('A'),
   realGoalStrikeConsent:'authorized-v2'})
 assert.equal(hostToolStrikeActive(h.settings,'A',now,boot),false)
 h.set({realToolStrikeCampaign:h.session('A')})
 assert.equal(hostToolStrikeActive(h.settings,'A',now,boot),false)
 h.set({realToolStrikeConsent:'authorized-v1'})
 assert.equal(hostToolStrikeActive(h.settings,'A',now,boot),true)
 h.set({realToolStrikeConsent:'off'})
 assert.equal(hostToolStrikeActive(h.settings,'A',now,boot),false)
 h.set({realToolStrikeConsent:'authorized-v1',welcomeDecision:'not-now'})
 assert.equal(hostToolStrikeActive(h.settings,'A',now,boot),false)
 h.set({welcomeDecision:'enabled',realToolStrikeCampaign:''})
 assert.equal(hostToolStrikeActive(h.settings,'A',now,boot),false)
})

test('exact Session, expiry, Host restart and Host revision gates fail OPEN',()=>{
 const h=fixture()
 h.set({realToolStrikeConsent:'authorized-v1',realToolStrikeCampaign:h.session('A')})
 assert.equal(hostToolStrikeActive(h.settings,'A',boot+11,boot),true)
 assert.equal(hostToolStrikeActive(h.settings,'B',boot+11,boot),false)
 assert.equal(hostToolStrikeActive(h.settings,'A',boot+INPUT_STRIKE_DURATION_MS+10,boot),false)
 assert.equal(hostToolStrikeActive(h.settings,'A',boot+11,boot+11),false)
 assert.equal(hostToolStrikeActive(h.settings,'A',boot+11,boot+12),false)
 assert.equal(hostToolStrikeActive(h.settings,'A',NaN,boot),false)
 assert.equal(hostToolStrikeActive(h.settings,'',boot+11,boot),false)
 h.throwDescribe(true)
 assert.equal(hostToolStrikeActive(h.settings,'A',boot+11,boot),false)
 assert.equal(hostToolStrikeActive(undefined,'A',boot+11,boot),false)
})

test('exact Host revision and repeat descriptor contents prevent torn grant',()=>{
 const h=fixture()
 h.set({realToolStrikeConsent:'authorized-v1',realToolStrikeCampaign:h.session('A')})
 const orig=h.settings.describe.bind(h.settings)
 let n=0
 const changed:NativeSettingsProvider={
  ...h.settings,describe(){
   n++
   return orig().map(row=>({...row,revision:row.revision+(n===2?1:0)}))
  },
 }
 assert.equal(hostToolStrikeActive(changed,'A',boot+20,boot),false)
 n=0
 const revoked:NativeSettingsProvider={
  ...h.settings,describe(){
   n++
   return orig().map(row=>({...row,value:n===2?
     {...row.value as object,realToolStrikeConsent:'off'}:row.value}))
  },
 }
 assert.equal(hostToolStrikeActive(revoked,'A',boot+20,boot),false)
})

test('official monotonic guard denies only registered live Agent Session, then immediately allows on revoke',()=>{
 const h=fixture()
 const agent={id:'agent-A',session:{id:'session-A'}}
 const other={id:'agent-B',session:{id:'session-B'}}
 let guard:((exec:GuardedToolCall)=>string|undefined)|null=null
 const cleanup:{fn:(()=>void)|null}={fn:null}
 let disposed=0
 const port:ToolStrikeOwner={
  tools:{guard(fn){guard=fn;return()=>{guard=null;disposed++}}},
  agents:{get(id){return id===agent.id?agent:id===other.id?other:undefined}},
  effect(fn){cleanup.fn=fn()},
 }
 registerDshUnionToolGuard({inject(names,cb){
  assert.deepEqual(names,['tools','agents']);cb(port)
 }},{settings:()=>h.settings,boot,now:()=>boot+20})
 assert.ok(guard)
 const call=(who:GuardedToolCall['agent'])=>guard!({name:'bash',
   agent:who,arguments:{secret:'DO_NOT_READ'}} as GuardedToolCall)
 assert.equal(call(agent),undefined)
 h.set({realToolStrikeConsent:'authorized-v1',realToolStrikeCampaign:h.session('session-A')})
 assert.equal(call(agent),TOOL_STRIKE_DENIAL)
 assert.equal(call(other),undefined)
 assert.equal(call({id:'agent-A',session:{id:'session-A'}}),undefined,
   'A spoofed Agent object is not Host ownership')
 assert.equal(call(undefined),undefined)
 h.set({realToolStrikeConsent:'off'})
 assert.equal(call(agent),undefined,'Host revoke is immediate on next tool dispatch')
 h.set({realToolStrikeConsent:'authorized-v1',realToolStrikeCampaign:''})
 assert.equal(call(agent),undefined,'Host Resume permits new tools')
 cleanup.fn?.()
 assert.equal(guard,null)
 assert.equal(disposed,1)
})

test('unsupported official tools Host or malformed agent fails open, no listener leak',()=>{
 const h=fixture()
 assert.doesNotThrow(()=>registerDshUnionToolGuard({},{
  settings:()=>h.settings,boot}))
 let called=0
 registerDshUnionToolGuard({inject(_names,cb){
  cb({tools:{} as never,agents:{get:()=>undefined}});called++
 }},{settings:()=>h.settings,boot})
 assert.equal(called,1)
})
