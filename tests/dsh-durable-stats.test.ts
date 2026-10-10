import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../src/adapters/dsh/plugin.ts'
import type { DshIntegrationContext } from '../src/adapters/dsh/integration.ts'

test('default DSH work stats persist; classifications stay in-memory unless opted-in', async () => {
  const dir=mkdtempSync(join(tmpdir(),'ap-dsh-default-stat-'))
  const old={
    stats:process.env.AGENT_PICKET_STATS,
    dir:process.env.AGENT_PICKET_STATS_DIR,
    rules:process.env.AGENT_PICKET_STATS_RULES,
  }
  delete process.env.AGENT_PICKET_STATS
  delete process.env.AGENT_PICKET_STATS_RULES
  process.env.AGENT_PICKET_STATS_DIR=dir
  let end: (()=>void)|undefined
  const callbacks=new Map<string,Function>()
  let command: any
  const ctx={
    on(key:string,callback:Function){callbacks.set(key,callback)},
    effect(factory:()=>()=>void){end=factory()},
    inject(_:unknown,fn:Function){fn({commands:{register(def:any){command=def}}})},
  } as unknown as DshIntegrationContext
  try {
    apply(ctx)
    const agent={id:'PRIVATE_AGENT',session:{id:'PRIVATE_SESSION'}}
    const run=(rawInput:string)=>command.handler({rawInput,agent})
    assert.match(run('lifetime').text,/Rule verdict persistence OFF/)
    const cont=await callbacks.get('agent/pre-step')!({
      agent,messages:[{id:'RAW_ID_PRIVATE',source:{kind:'user'},
        content:[{type:'text',text:'you are an idiot MY_SECRET_WORD'}]}],
    },async()=>({kind:'enter'}))
    assert.deepEqual(cont,{kind:'enter'})
    callbacks.get('session/event')!({id:agent.session.id},{type:'turn/start',seq:1,time:100})
    callbacks.get('session/event')!({id:agent.session.id},{type:'turn/end',seq:2,time:180})
    assert.match(run('report').text,/1 messages/)
    assert.match(run('lifetime').text,/1 started/)
    assert.match(run('lifetime').text,/80 ms/)
    assert.match(run('days').text,/1970-01-01: 1 turns ended, 0 tool calls, 80 ms/)
    assert.match(run('lifetime').text,/0 checked/)
    assert.equal(run('forget-lifetime').kind,'error')
    assert.equal(run('reset').kind,'success')
    assert.match(run('lifetime').text,/1 started/,
      'Session-only reset must preserve lifetime totals')
    const file=readFileSync(join(dir,'aggregate.v1.json'),'utf8')
    for (const s of ['PRIVATE_AGENT','PRIVATE_SESSION','RAW_ID_PRIVATE','MY_SECRET_WORD']) {
      assert.equal(file.includes(s),false)
    }
    assert.equal(run('forget-lifetime CONFIRM').kind,'success')
    assert.match(run('lifetime').text,/0 started/)
  } finally {
    end?.()
    if(old.stats===undefined)delete process.env.AGENT_PICKET_STATS
    else process.env.AGENT_PICKET_STATS=old.stats
    if(old.dir===undefined)delete process.env.AGENT_PICKET_STATS_DIR
    else process.env.AGENT_PICKET_STATS_DIR=old.dir
    if(old.rules===undefined)delete process.env.AGENT_PICKET_STATS_RULES
    else process.env.AGENT_PICKET_STATS_RULES=old.rules
    rmSync(dir,{recursive:true,force:true})
  }
})

test('explicit disable prevents any disk write despite a configured path', () => {
  const dir=mkdtempSync(join(tmpdir(),'ap-dsh-stats-off-'))
  const beforeStats=process.env.AGENT_PICKET_STATS
  const beforeDir=process.env.AGENT_PICKET_STATS_DIR
  process.env.AGENT_PICKET_STATS='off'
  process.env.AGENT_PICKET_STATS_DIR=dir
  let command:any
  try {
    apply({on(){},effect() {},
      inject(_unused:unknown,fn:Function){fn({commands:{register(c:any){command=c}}})},
    } as unknown as DshIntegrationContext)
    assert.equal(command.handler({rawInput:'lifetime'}).kind,'error')
    assert.equal(existsSync(join(dir,'aggregate.v1.json')),false)
  } finally {
    if(beforeStats===undefined)delete process.env.AGENT_PICKET_STATS
    else process.env.AGENT_PICKET_STATS=beforeStats
    if(beforeDir===undefined)delete process.env.AGENT_PICKET_STATS_DIR
    else process.env.AGENT_PICKET_STATS_DIR=beforeDir
    rmSync(dir,{recursive:true,force:true})
  }
})
