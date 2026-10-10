import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { apply } from '../src/adapters/dsh/plugin.ts'

const hostRoot = process.env.AGENT_PICKET_DSH_HOST

test('real Cordis: default aggregate persists across plugin dispose/reattach without raw prompts', {
  skip: !hostRoot && 'Set isolated AGENT_PICKET_DSH_HOST for real DSH durable test',
  timeout: 12_000,
}, async () => {
  const { Context } = await import(pathToFileURL(join(hostRoot!, '@deepseek-ai/cordis/lib/index.js')).href)
  const commandsModule = await import(
    pathToFileURL(join(hostRoot!, '@deepseek-ai/dsh-commands/lib/index.js')).href)
  const dir=mkdtempSync(join(tmpdir(),'ap-dsh-lifetime-real-'))
  const previous = {
    off: process.env.AGENT_PICKET_STATS,
    dir: process.env.AGENT_PICKET_STATS_DIR,
    rules: process.env.AGENT_PICKET_STATS_RULES,
  }
  delete process.env.AGENT_PICKET_STATS
  delete process.env.AGENT_PICKET_STATS_RULES
  process.env.AGENT_PICKET_STATS_DIR=dir
  const session = { id: 'durable-test-session', append(){} }
  const agent = { id: 'durable-test-agent', session }
  async function run(events: boolean): Promise<{lifetime:string; rules:string}> {
    const ctx = new Context()
    const commands = ctx.plugin(commandsModule.default)
    const monitor = ctx.plugin({
      name: 'agent-picket-durable-real',
      apply(child: any) { apply(child) },
    })
    try {
      let found = false
      for(let i=0;i<40;i++){
        if(ctx.commands?.list(agent).some((c:{name:string})=>c.name==='union')){
          found=true;break
        }
        await new Promise(resolve=>setTimeout(resolve,5))
      }
      assert.equal(found,true,'DSH never installed union commands')
      if (events) {
        ctx.emit('session/event',session,{type:'turn/start',seq:1,time:1000})
        ctx.emit('session/event',session,{type:'turn/end',seq:2,time:1600})
        await ctx.waterfall('agent/pre-step',{
          agent,messages:[{id:'private-message-ID',
            source:{kind:'user'},
            content:[{type:'text',text:'you are an idiot TOP_SECRET_PROMPT'}]}],
        },async()=>({kind:'enter'}))
      } else {
        // The Host may replay old lifecycle events, which must not double count.
        ctx.emit('session/event',session,{type:'turn/start',seq:1,time:1000})
        ctx.emit('session/event',session,{type:'turn/end',seq:2,time:1600})
      }
      const call=async (name:string) => {
        const response=await ctx.commands.execute(agent,'/union '+name,[],new AbortController().signal)
        assert.ok(response)
        return response.result.text as string
      }
      return {lifetime:await call('lifetime'),rules:await call('report')}
    } finally {
      await monitor.dispose()
      await commands.dispose()
    }
  }
  try {
    const first=await run(true)
    assert.match(first.lifetime,/1 started/)
    assert.match(first.lifetime,/600 ms/)
    assert.match(first.lifetime,/0 checked/)
    assert.match(first.rules,/1 messages/)
    assert.equal(existsSync(join(dir,'aggregate.v1.lock')),false)
    const after=await run(false)
    assert.match(after.lifetime,/1 started/)
    assert.match(after.lifetime,/600 ms/)
    const json=readFileSync(join(dir,'aggregate.v1.json'),'utf8')
    for(const secret of ['TOP_SECRET_PROMPT','private-message-ID','durable-test-session']){
      assert.equal(json.includes(secret),false)
    }
  } finally {
    if(previous.off===undefined)delete process.env.AGENT_PICKET_STATS
    else process.env.AGENT_PICKET_STATS=previous.off
    if(previous.dir===undefined)delete process.env.AGENT_PICKET_STATS_DIR
    else process.env.AGENT_PICKET_STATS_DIR=previous.dir
    if(previous.rules===undefined)delete process.env.AGENT_PICKET_STATS_RULES
    else process.env.AGENT_PICKET_STATS_RULES=previous.rules
    rmSync(dir,{force:true,recursive:true})
  }
})
