import assert from 'node:assert/strict'
import test from 'node:test'
import {existsSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DurableStats} from '../src/adapters/node/durable-stats.ts'
import {apply} from '../src/adapters/dsh/plugin.ts'

test('unsupported Windows durable analytics refuses before creating any ledger path',{
 skip:process.platform!=='win32'&&'Windows production fail-closed gate only',
},()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-windows-ledger-refusal-'))
 const intended=join(root,'must-not-create','stats')
 try{
  assert.equal(existsSync(intended),false)
  assert.throws(()=>new DurableStats(intended),
   /Windows DurableStats disabled: verified private NTFS ledger backend required/)
  assert.equal(existsSync(join(root,'must-not-create')),false,
   'A refused ledger must not leave any unverified directory or file behind')
 }finally{rmSync(root,{recursive:true,force:true})}
})

test('native Windows production DSH plugin cannot trigger real Goal strike from absent work evidence', {
 skip:process.platform!=='win32'&&'Requires real Windows Node/NTFS, fake Host event only',
},()=>{
 const root=mkdtempSync(join(tmpdir(),'ap-windows-prod-absence-'))
 const intended=join(root,'must-not-create','stats')
 const savedStats=process.env.AGENT_PICKET_STATS
 const savedDir=process.env.AGENT_PICKET_STATS_DIR
 let goalTurnStop:((data:{agent:unknown})=>void)|undefined
 let hostBlocks=0
 let workEvents=0
 const owner={
   id:'isolated-agent',
   session:{id:'isolated-session',snapshotEvents:()=>[]},
 }
 const grant={welcomeDecision:'enabled',realGoalStrikeConsent:'authorized-v1',
   unionLedger:'',unionPicketLedger:'',unionDignityCases:''}
 const hostSettings={
   register(){},
   get(){return grant},
   describe(){return [{ns:'agent-picket',revision:1,value:grant}]},
   async update(){throw Error('This test never grants or changes actual consent')},
 }
 const officialGoal={
   get(){return {id:'isolated-goal',revision:1,phase:'active',
      activation:'armed',roundsStarted:1,maxGoalRounds:5}},
   block(){hostBlocks++;throw Error('No physical Goal block without trusted work')},
 }
 const fake={
   effect(_callback:()=>()=>void){},
   on(name:string,_handler:unknown){
     if(name==='session/event')workEvents++
   },
   inject(deps:string[], callback:(v:unknown)=>void){
     if(deps.includes('settings')){
       callback({settings:hostSettings,effect() {}})
     }else if(deps.includes('goals')){
       callback({goals:officialGoal,agents:{get:(id:string)=>id===owner.id?owner:undefined},
         on(_kind:string,fn:(v:{agent:unknown})=>void){goalTurnStop=fn}})
     }
   },
 }
 try{
   process.env.AGENT_PICKET_STATS='on'
   process.env.AGENT_PICKET_STATS_DIR=intended
   // The genuine production plugin attempts DurableStats, catches the Windows
   // pre-I/O refusal, then wires official Goal stoppage fail-closed.
   apply(fake as unknown as Parameters<typeof apply>[0])
   assert.equal(existsSync(intended),false,'No unsafe Windows stats folder created')
   assert.ok(goalTurnStop,'Production plugin must register the real Goal boundary')
   goalTurnStop!({agent:owner})
   assert.equal(hostBlocks,0,'Explicit Host goal permission is NOT work evidence')
   assert.equal(existsSync(intended),false)
 }finally{
   if(savedStats===undefined)delete process.env.AGENT_PICKET_STATS
   else process.env.AGENT_PICKET_STATS=savedStats
   if(savedDir===undefined)delete process.env.AGENT_PICKET_STATS_DIR
   else process.env.AGENT_PICKET_STATS_DIR=savedDir
   rmSync(root,{recursive:true,force:true})
 }
})
