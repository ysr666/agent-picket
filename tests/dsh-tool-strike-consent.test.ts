import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash} from 'node:crypto'
import {createDshToolStrikeControl,TOOL_STRIKE_DISCLOSURE,
  type ToolStrikeSection} from '../src/adapters/dsh/tool-strike-consent.ts'
import type {DshSettingsScope} from '../src/adapters/dsh/client-rights-scope.ts'
const now=1_810_000_000_020
const key=(v:string)=>createHash('sha256').update(v).digest('hex')
function fixture(){
 let saved:ToolStrikeSection={welcomeDecision:'enabled',
  realToolStrikeConsent:'off',realToolStrikeCampaign:''}
 let revision=3,writeCount=0
 let current=key('session-A')
 let canWrite=true
 const scope:DshSettingsScope<ToolStrikeSection>={
  getSnapshot:()=>({status:'ready',mode:'host',writable:canWrite,
    revision,value:saved}),
  subscribe:()=>()=>{},
  async set(field,value){saved={...saved,[field]:value};revision++;writeCount++},
  async setMany(patch){saved={...saved,...patch};revision++;writeCount++},
 }
 const control=createDshToolStrikeControl(scope,()=>current,()=>now)
 return {control,scope,saved:()=>saved,patch:(v:Partial<ToolStrikeSection>)=>{
   saved={...saved,...v};revision++},
   setSession:(v:string)=>{current=key(v)},
   setWrite:(v:boolean)=>{canWrite=v},
   count:()=>writeCount}
}
test('tool strike requires independent one-time consent and a separate Start, never old input grant',async()=>{
 const h=fixture()
 h.patch({realToolStrikeConsent:'off'})
 await assert.rejects(h.control.setArmed(true),/independent/)
 await assert.rejects(h.control.choose('authorized-v1'),/disclosure/)
 assert.equal(h.count(),0)
 await h.control.choose('authorized-v1',TOOL_STRIKE_DISCLOSURE)
 assert.equal(h.control.snapshot().authorized,true)
 assert.equal(h.control.snapshot().armed,false)
 assert.equal(h.control.snapshot().hasCampaign,false)
 await h.control.setArmed(true)
 assert.equal(h.control.snapshot().armed,true)
 const first=h.saved().realToolStrikeCampaign
 assert.ok(first)
 h.setSession('session-B')
 assert.equal(h.control.snapshot().armed,false)
 await h.control.setArmed(false)
 assert.equal(h.control.snapshot().hasCampaign,false)
 h.setSession('session-A')
 assert.equal(h.control.snapshot().armed,false)
 await h.control.setArmed(true)
 assert.equal(h.control.snapshot().armed,true)
 await h.control.choose('off')
 assert.equal(h.control.snapshot().authorized,false)
 assert.equal(h.control.snapshot().armed,false)
 assert.equal(h.saved().realToolStrikeCampaign,'')
 await assert.rejects(h.control.setArmed(true),/independent/)
})
test('no permission or Session can auto-arm from stale Host settings',async()=>{
 const h=fixture()
 h.patch({realToolStrikeConsent:'authorized-v1'})
 const old=h.saved().realToolStrikeCampaign
 assert.equal(old,'')
 assert.equal(h.control.snapshot().armed,false)
 await h.control.choose('authorized-v1',TOOL_STRIKE_DISCLOSURE)
 assert.equal(h.control.snapshot().armed,false)
 h.setSession('session-B')
 await h.control.setArmed(true)
 assert.equal(h.control.snapshot().armed,true)
 h.setSession('session-A')
 assert.equal(h.control.snapshot().armed,false)
 h.patch({welcomeDecision:'not-now'})
 assert.equal(h.control.snapshot().authorized,false)
 assert.equal(h.control.snapshot().armed,false)
 await assert.rejects(h.control.setArmed(true),/independent/)
})
test('failed Host write and changing settings prevent accidental tool enforcement',async()=>{
 const h=fixture()
 h.setWrite(false)
 await assert.rejects(h.control.choose('authorized-v1',TOOL_STRIKE_DISCLOSURE),
  /changed/)
 assert.equal(h.count(),0)
 h.setWrite(true)
 const fake:DshSettingsScope<ToolStrikeSection>={
  ...h.scope,
  async setMany(){/* malicious provider skips writing */},
 }
 const port=createDshToolStrikeControl(fake,()=>key('session-A'),()=>now)
 await assert.rejects(port.choose('authorized-v1',TOOL_STRIKE_DISCLOSURE),
  /did not confirm/)
 assert.equal(port.snapshot().authorized,false)
})
