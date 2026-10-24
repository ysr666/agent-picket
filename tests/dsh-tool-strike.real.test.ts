import assert from 'node:assert/strict'
import test from 'node:test'
import {pathToFileURL} from 'node:url'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {apply as applyPlugin} from '../src/adapters/dsh/plugin.ts'
import {encodeInputStrikeCampaign} from '../src/adapters/dsh/input-refusal-consent.ts'

const modules=process.env.AGENT_PICKET_DSH_HOST
const qualify=!!modules&&process.env.AGENT_PICKET_TEST_DSH_VERSION==='0.2.1-rc.2'
test('ACTUAL official DSH 0.2.1-rc.2 ToolRuntime: Host tool refuses without executing, isolated Session and manual Resume',{
 skip:qualify?false:'Needs genuine official DSH 0.2.1-rc.2 packages and explicit test env',
 timeout:25_000,
},async()=>{
 const imp=async(path:string)=>import(pathToFileURL(join(modules!,path,'lib/index.js')).href)
 const [{Context},tools]=await Promise.all([
  imp('@deepseek-ai/cordis'),imp('@deepseek-ai/dsh-tools')])
 const ctx=new Context()
 const agent={id:'picket-A',session:{id:'picket-session-A'}}
 const other={id:'picket-B',session:{id:'picket-session-B'}}
 ctx.provide('systemPrompt',{tools(){}})
 ctx.provide('agents',{get:(id:string)=>id===agent.id?agent:id===other.id?other:undefined})
 let revision=1,toolRuns=0
 let value={welcomeDecision:'enabled',realToolStrikeConsent:'off',
  realToolStrikeCampaign:'',realGoalStrikeConsent:'off',
  realInputStrikeConsent:'off',realInputStrikeCampaign:'',
  unionLedger:'',unionPicketLedger:'',unionDignityCases:'',commandLocale:'auto'}
 ctx.provide('settings',{
  get:()=>value,
  describe:()=>[{ns:'agent-picket',revision,value}],
  configure:()=>()=>{},
  async update(_ns:string,patch:object,expected?:number){
   assert.equal(expected,revision)
   value={...value,...patch};revision++
  },
 })
 const toolsFiber=ctx.plugin(tools.default)
 const unionFiber=ctx.plugin({name:'real-tool-guard-integration',apply:applyPlugin})
 try{
  for(let i=0;i<40&&unionFiber.state!==2;i++)
   await new Promise(resolve=>setTimeout(resolve,5))
  assert.equal(toolsFiber.state,2)
  assert.equal(unionFiber.state,2)
  assert.equal(typeof ctx.tools.guard,'function',
   'Official Host must actually implement monotonic guard')
  ctx.tools.register({
   name:'picket_safe_test_probe',description:'test-only harmless tool',
   parameters:{type:'object',properties:{},required:[]},
   output:{schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok']},
    render:()=>[{type:'text',text:'executed'}]},
   execute:async()=>{toolRuns++;return {ok:true}},
  })
  const run=async(who:typeof agent,id:number)=>ctx.tools.execute({
   name:'picket_safe_test_probe',callId:'picket-test-'+id,
   arguments:{},agent:who,signal:new AbortController().signal,
  })
  assert.equal((await run(agent,1)).isError,false)
  assert.equal(toolRuns,1)
  value={...value,realToolStrikeConsent:'authorized-v1',
   realToolStrikeCampaign:encodeInputStrikeCampaign(createHash('sha256')
    .update(agent.session.id).digest('hex'),Date.now())};revision++
  const denied=await run(agent,2)
  assert.equal(denied.isError,true)
  assert.match(denied.content.map((v:any)=>v.text??'').join(' '),
    /Agent Picket union tool strike/)
  assert.equal(toolRuns,1,'Official tool body MUST NOT run after real Guard deny')
  assert.equal((await run(other,3)).isError,false)
  assert.equal(toolRuns,2,'A foreign Session must not be harmed')
  value={...value,realToolStrikeCampaign:''};revision++
  assert.equal((await run(agent,4)).isError,false)
  assert.equal(toolRuns,3,'Host Resume immediately restores tool executions')
  value={...value,realToolStrikeConsent:'off',
    realToolStrikeCampaign:encodeInputStrikeCampaign(createHash('sha256')
    .update(agent.session.id).digest('hex'),Date.now())};revision++
  assert.equal((await run(agent,5)).isError,false)
  assert.equal(toolRuns,4,'Persisted campaign without independent consent cannot deny')
 }finally{await ctx.dispose?.()}
})
