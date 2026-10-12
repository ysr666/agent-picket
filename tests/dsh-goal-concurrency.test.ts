import assert from 'node:assert/strict'
import test from 'node:test'
import {
  registerDshGoalWorkEnforcement,alreadyBlockedGoalToday,
} from '../src/adapters/dsh/goal-work-enforcement.ts'
import type {GoalStrikeConsentV1} from '../src/adapters/dsh/goal-boundary-strike.ts'

const DAY=Date.parse('2026-10-12T14:00:00.000Z')
const H8=8*3_600_000
const live:GoalStrikeConsentV1={kind:'agent-picket-real-goal-strike-v1',
  hostAuthenticated:true,enabled:true}
type Agent={id:string;session:{id:string;snapshotEvents():readonly unknown[]}}
type Goal={id:string;revision:number;phase:'active'|'blocked';activation:'armed'|'disarmed';roundsStarted:number}
function harness(ids=['s-a','s-b']){
  const history=new Map<string,unknown[]>()
  const agents=new Map<string,Agent>()
  const goals=new Map<string,Goal>()
  for(const id of ids){
    const events:unknown[]=[];history.set(id,events)
    agents.set(id,{id,session:{id,snapshotEvents:()=>events}})
    goals.set(id,{id:'goal-'+id,revision:1,phase:'active',activation:'armed',roundsStarted:2})
  }
  let callback:((payload:{agent:Agent})=>void)|undefined
  let permission:GoalStrikeConsentV1|null=live
  let work=H8,reads=0,blocks=0,afterStats:(()=>void)|undefined
  const results:string[]=[]
  registerDshGoalWorkEnforcement({inject(deps,attach){
    assert.deepEqual(deps,['goals','agents'])
    attach({agents:{get:id=>agents.get(id)},
      goals:{
        get:(agent:Agent)=>goals.get(agent.id),
        block(agent:Agent,ref,reason){
          const current=goals.get(agent.id)!
          assert.equal(ref.id,current.id)
          assert.equal(ref.revision,current.revision)
          assert.equal(reason.code,'picket-work-limit')
          blocks++
          const updated:Goal={...current,phase:'blocked',activation:'disarmed',revision:current.revision+1}
          goals.set(agent.id,updated)
          history.get(agent.id)!.push({type:'goal/change',data:{operation:'block',
            goal:{id:current.id,blockedReason:{code:'picket-work-limit'}},updatedAt:DAY}})
          return updated
        },
      },on(name,fn){assert.equal(name,'agent/turn-stopping');callback=fn},
    })
  }},{consent:()=>{reads++;return permission},todayWork:()=>{
    afterStats?.();return work
  },now:()=>DAY,onResult:value=>results.push(value)})
  assert.ok(callback)
  return {agents,goals,history,results,
    fire:(id:string)=>callback!({agent:agents.get(id)!}),
    fireObject:(agent:Agent)=>callback!({agent}),
    setPermission:(value:GoalStrikeConsentV1|null)=>{permission=value},
    setWork:(value:number)=>{work=value},
    afterStats:(action:()=>void)=>{afterStats=action},
    resetHook:()=>{afterStats=undefined},
    get reads(){return reads},get blocks(){return blocks},
    resume:(id:string)=>{const goal=goals.get(id)!;goals.set(id,{...goal,phase:'active',
      activation:'armed',revision:goal.revision+1})},
  }
}

test('two active Goal sessions are isolated and one repeated event never blocks twice',()=>{
  const h=harness()
  h.fire('s-a')
  assert.equal(h.blocks,1)
  assert.equal(h.goals.get('s-b')?.phase,'active')
  h.fire('s-b')
  assert.equal(h.blocks,2)
  h.resume('s-a')
  h.resume('s-b')
  h.fire('s-a');h.fire('s-b')
  assert.equal(h.blocks,2,'Each Goal blocks at most once in same UTC day')
  assert.deepEqual(h.results,['blocked','blocked'])
  assert.ok(alreadyBlockedGoalToday(h.history.get('s-a')!,'goal-s-a',DAY))
})

test('an unrelated later Host block cannot cause a second union stop',()=>{
 const h=harness(['s-a']);h.fire('s-a')
 h.history.get('s-a')!.push({type:'goal/change',data:{operation:'block',
   goal:{id:'goal-s-a',blockedReason:{code:'manual-work-hold'}},updatedAt:DAY+20}})
 h.resume('s-a');h.fire('s-a')
 assert.equal(h.blocks,1)
})

test('revocation during durable statistics read cancels pending Goal enforcement',()=>{
 const h=harness(['s-a'])
 h.afterStats(()=>h.setPermission(null))
 h.fire('s-a')
 assert.equal(h.blocks,0)
 assert.ok(h.reads>=2,'Consent is independently rechecked after ledger read')
 h.resetHook();h.setPermission(live);h.fire('s-a')
 assert.equal(h.blocks,1,'A later newly granted consent may authorize a new stop')
 h.setPermission(null);h.resume('s-a');h.fire('s-a')
 assert.equal(h.blocks,1,'Revoked permissions may not re-arm the Goal')
})

test('forged stale Agent object, unstarted and inactive Goals cannot block',()=>{
 const h=harness(['s-a'])
 const real=h.agents.get('s-a')!
 h.fireObject({...real})
 assert.equal(h.blocks,0)
 h.goals.set('s-a',{...h.goals.get('s-a')!,roundsStarted:0})
 h.fire('s-a');assert.equal(h.blocks,0)
 h.goals.set('s-a',{...h.goals.get('s-a')!,phase:'blocked',activation:'disarmed'})
 h.fire('s-a');assert.equal(h.blocks,0)
})

test('partial/unavailable work and a revoked consent fail open without a Host block',()=>{
 const h=harness(['s-a'])
 h.setWork(H8-1);h.fire('s-a');assert.equal(h.blocks,0)
 h.setWork(NaN);h.fire('s-a');assert.equal(h.blocks,0)
 h.setPermission(null);h.setWork(H8);h.fire('s-a');assert.equal(h.blocks,0)
})
