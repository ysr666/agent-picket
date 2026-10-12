import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {publishVerifiedBuild, stagedBuild} from '../scripts/dev-staged-build.mjs'

const old = 'window.__ModuleLoader__.load({ id: "agent-picket", factory: () => "old" })'
const next = 'window.__ModuleLoader__.load({ id: "agent-picket", factory: () => "new" })'

async function sandbox(run: (ctx: {root:string;stage:string;dest:string}) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(),'picket-stage-unit-'))
  const stage=join(root,'stage'),dest=join(root,'dist')
  await mkdir(join(stage,'adapters/dsh'),{recursive:true})
  await mkdir(join(dest,'adapters/dsh'),{recursive:true})
  await writeFile(join(stage,'adapters/dsh/client.js'),next)
  await writeFile(join(stage,'adapters/dsh/plugin.js'),'export default 1')
  await writeFile(join(stage,'adapters/dsh/other.js'),'other')
  await writeFile(join(dest,'adapters/dsh/client.js'),old)
  await writeFile(join(dest,'adapters/dsh/stale.js'),'stale')
  try{await run({root,stage,dest})}finally{await rm(root,{force:true,recursive:true})}
}

test('staged publish writes DSH Client last, replacing siblings first',async()=>sandbox(async({stage,dest})=>{
  const emitted:string[]=[]
  await publishVerifiedBuild(stage,dest,{async afterFile(path:string){
    emitted.push(path)
    if(path!==join('adapters','dsh','client.js'))assert.equal(await readFile(join(dest,'adapters/dsh/client.js'),'utf8'),old)
  }})
  assert.equal(emitted.at(-1),join('adapters','dsh','client.js'))
  assert.equal(await readFile(join(dest,'adapters/dsh/client.js'),'utf8'),next)
  await assert.rejects(readFile(join(dest,'adapters/dsh/stale.js')),{code:'ENOENT'})
}))

test('invalid Client stage cannot mutate live published files',async()=>sandbox(async({stage,dest})=>{
  await writeFile(join(stage,'adapters/dsh/client.js'),'invalid build output')
  await assert.rejects(publishVerifiedBuild(stage,dest),/factory is invalid/)
  assert.equal(await readFile(join(dest,'adapters/dsh/client.js'),'utf8'),old)
}))

test('failed compiler leaves last-good Client and removes its staging directory',async()=>sandbox(async({root,dest})=>{
  await assert.rejects(stagedBuild(root,async()=>{throw Error('synthetic TypeScript failure')}),/synthetic TypeScript failure/)
  assert.equal(await readFile(join(dest,'adapters/dsh/client.js'),'utf8'),old)
}))
