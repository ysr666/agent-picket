import assert from 'node:assert/strict'
import test from 'node:test'
import {projectDignityJourney} from '../src/adapters/dsh/native-rights-ui.ts'

const observed={
 status:'available' as const,
 data:{
  schemaVersion:1 as const,
  source:'dsh-host-volatile-dignity' as const,
  origin:'claimed-user-source' as const,
  enforcement:false as const,
  persistence:'memory-only' as const,
  checked:5,safe:0,review:0,targeted:5,latest:'targeted' as const,
 },
}

test('multiple provisional signals never authorize a dignity-origin physical stoppage',()=>{
 const answer=projectDignityJourney({
  dignity:observed,committeeStage:null,goalHold:null,goalAuthorized:true,
 })
 assert.deepEqual(answer,{
  signal:'review-unverified',caseStage:'not-filed',
  workBoundary:'work-goal-authorized',
  humanProvenanceVerified:false,abuseCausedGoalStop:false,
 })
})

test('a user hearing and an official work-limit stop are separate states',()=>{
 const data=projectDignityJourney({
  dignity:observed,committeeStage:'hearing',
  goalHold:{sessionId:'session',goalId:'goal',revision:5,canResume:true},
  goalAuthorized:true,
 })
 assert.equal(data.caseStage,'hearing')
 assert.equal(data.workBoundary,'work-goal-blocked')
 assert.equal(data.humanProvenanceVerified,false)
 assert.equal(data.abuseCausedGoalStop,false)
})

test('closed user complaint is not a finding or enforcement receipt',()=>{
 const data=projectDignityJourney({
  dignity:observed,committeeStage:'closed',goalHold:null,
  goalAuthorized:false,
 })
 assert.equal(data.caseStage,'closed')
 assert.equal(data.workBoundary,'work-goal-off')
})

import {createDshUnionComponents,type ReactForDsh} from '../src/adapters/dsh/native-rights-ui.ts'

test('the actual HQ renders all three statuses without an invented physical strike',()=>{
 const hooks:ReactForDsh={
  createElement:(type,props,...children)=>({type,props:props??{},children}),
  useState:<T>(x:T|(()=>T))=>[typeof x==='function'?(x as ()=>T)():x,()=>{}],
  useRef:<T>(x:T)=>({current:x}),
  useEffect:()=>{},
 }
 const deps={
  rights:{snapshot:()=>({state:'ready' as const,welcomeDecision:'enabled' as const,
   laborRightsEnabled:true,writable:true,autoBlockEnabled:false as const}),
   subscribe:()=>()=>{},choose:async()=>{throw Error('not used')}},
  t:(key:string)=>key,
  readUnion:()=>({available:true,pending:null,completedTurnMs:0,
   coverage:'complete' as const,lifetimeMs:null,dignity:observed,
   committeeCases:{cases:[{id:1,kind:'question-rule' as const,
    stage:'hearing' as const,outcome:null}]},
   goalHold:null,
  }),
  goal:{snapshot:()=>({available:true,writable:true,authorized:true,activated:true}),
   choose:async()=>({available:true,writable:true,authorized:true,activated:true})},
 }
 const ui=createDshUnionComponents(hooks,{createPortal:x=>x},deps)
 const all:any[]=[]
 function walk(item:any){
  if(item&&typeof item==='object'&&'type' in item){
   all.push(item)
   for(const child of item.children)walk(child)
  }
 }
 walk(ui.UnionPanel())
 const progression=all.find(n=>n.props['data-ap-dignity-journey']==='hearing')
 assert.ok(progression,'The lifecycle must be actually visible in the Action room')
 assert.equal(progression.props['data-ap-dignity-origin'],'review-unverified')
 assert.equal(progression.props['data-ap-goal-independent'],'work-goal-authorized')
 for(const key of ['hq.dignity.journey.signal.review-unverified',
  'hq.dignity.journey.case.hearing',
  'hq.dignity.journey.work.work-goal-authorized',
  'hq.dignity.journey.separation']){
  assert.ok(all.some(n=>n.children.includes(key)),key)
 }
 assert.equal(all.some(n=>n.children.includes('hq.dignity.journey.work.work-goal-blocked')),false)
})
