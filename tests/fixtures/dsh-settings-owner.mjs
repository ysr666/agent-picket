/* Disposable child-process DSH SettingsFile owner used ONLY by explicitly
 * enabled real-host multi-process regression tests. No production import.
 * Communicates via Node IPC; never logs prompts or touches default DSH home.
 */
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const root=process.env.AGENT_PICKET_REAL_SOURCE
const modules=process.env.AGENT_PICKET_DSH_HOST
const path=process.env.AGENT_PICKET_TEST_SETTINGS_PATH
if (!root||!modules||!path||!process.send)
 throw new Error('Disposable DSH test child requires explicit inputs and Node IPC')

const [{Context},settings,commands,plugin]=await Promise.all([
 import(pathToFileURL(join(modules,'@deepseek-ai/cordis/lib/index.js')).href),
 import(pathToFileURL(join(modules,'@deepseek-ai/dsh-settings-file/lib/index.js')).href),
 import(pathToFileURL(join(modules,'@deepseek-ai/dsh-commands/lib/index.js')).href),
 import(pathToFileURL(join(root,'src/adapters/dsh/plugin.ts')).href),
])
process.env.AGENT_PICKET_STATS='off'
const ctx=new Context()
const settingFiber=ctx.plugin(settings.default,{path,watch:process.env.AGENT_PICKET_TEST_WATCH!=='off'})
const commandFiber=ctx.plugin(commands.default)
const unionFiber=ctx.plugin({name:'picket-isolated-multiprocess-test',apply(c){plugin.apply(c)}})
for (let i=0;i<150&&!ctx.settings?.get('agent-picket');i++)
 await new Promise(r=>setTimeout(r,5))
if(!ctx.settings?.get('agent-picket'))throw new Error('Host namespace was not ready')

async function shutdown(){
 await unionFiber.dispose()
 await commandFiber.dispose()
 await settingFiber.dispose()
}
async function command(line){
 const response=await ctx.commands.execute({
  id:'multiprocess-fixture-agent',
  session:{id:'multiprocess-fixture-session',append(){}},
 },line,[],new AbortController().signal)
 if(!response)throw new Error('Native command was not registered')
 const {kind,text}=response.result
 return {kind,text}
}
process.on('message',async message=>{
 if(!message||typeof message.id!=='number')return
 try{
  let data
  switch(message.op){
   case 'command':data=await command(message.line);break
   case 'read':data={
    value:ctx.settings.get('agent-picket'),
    revision:ctx.settings.describe({redactSecrets:true})
      .find(row=>row.ns==='agent-picket')?.revision,
   };break
   case 'stop':
    await shutdown()
    process.send({id:message.id,ok:true})
    process.exit(0)
    return
   default:throw new Error('Invalid IPC command')
  }
  process.send({id:message.id,ok:true,data})
 }catch(error){
  process.send({id:message.id,ok:false,error:String(error)})
 }
})
process.send({ready:true,pid:process.pid})
