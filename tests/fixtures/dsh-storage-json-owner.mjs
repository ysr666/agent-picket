// Disposable genuine JSON Storage SDK subprocess. No product/Host consent claims.
import {pathToFileURL} from 'node:url'
import {join} from 'node:path'
const sdk=process.env.AGENT_PICKET_STORAGE_SDK
const root=process.env.AGENT_PICKET_STORAGE_ROOT
const layout=process.env.AGENT_PICKET_STORAGE_LAYOUT
if(!sdk||!root||!['single','per-record'].includes(layout))
 throw new Error('Genuine storage SDK, disposable root, layout required')
const {JsonStorageBackend}=await import(pathToFileURL(join(sdk,'@deepseek-ai/dsh-storage-json/lib/index.js')).href)
const backend=new JsonStorageBackend(root)
const descriptor={name:'picket_storage_probe',version:1,tables:['ledger'],hasGlobal:false,layout}
const unit=await backend.kv.open(descriptor)
process.send?.({ready:true,pid:process.pid})
process.on('message',async msg=>{
 const {id,op,key,value}=msg
 try{
  if(op==='put')await unit.putRecord('ledger',key,value)
  else if(op==='delete')await unit.deleteRecord('ledger',key)
  else if(op==='read'){process.send?.({id,ok:true,data:await unit.loadAll()});return}
  else if(op==='stop'){await backend.close();process.send?.({id,ok:true},()=>process.disconnect?.());return}
  else throw new Error('Unknown test operation')
  process.send?.({id,ok:true})
 }catch(e){process.send?.({id,ok:false,error:String(e?.stack??e)})}
})
