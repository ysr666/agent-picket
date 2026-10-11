import assert from 'node:assert/strict'
import test from 'node:test'
import { createBrowserDignityReader, parseDignityResponse } from '../src/adapters/dsh/client-dignity.ts'
const result=(n=1)=>({
 schemaVersion:1,source:'dsh-host-volatile-dignity',origin:'claimed-user-source',
 enforcement:false,persistence:'memory-only',
 checked:n,safe:0,review:0,targeted:n,latest:n?'targeted':'none',
})
const settle=async()=>{for(let i=0;i<16;i++)await Promise.resolve()}
test('only the authenticated opted-in current Session hash reaches read-only Host Fetch',async()=>{
 let allowed=false,calls=0;const urls:string[]=[]
 const reader=createBrowserDignityReader({
  authorized:()=>allowed,
  digest:async value=>{assert.equal(value,'private-original-session');return 'a'.repeat(64)},
  fetcher:async url=>{calls++;urls.push(String(url));return Response.json(result())},
 })
 reader.setScope(true,'private-original-session')
 await settle()
 assert.equal(calls,0)
 allowed=true
 reader.setScope(true,'private-original-session')
 await settle()
 assert.equal(calls,1)
 assert.equal(reader.snapshot().status,'available')
 assert.equal(reader.snapshot().data?.targeted,1)
 assert.equal(urls[0]?.includes('private-original-session'),false)
 assert.match(urls[0]!,/sessionKey=a{64}$/)
 allowed=false
 assert.deepEqual(reader.snapshot(),{status:'off',data:null})
 allowed=true
 assert.equal(reader.snapshot().status,'off')
 reader.setScope(true,'private-original-session')
 await settle()
 assert.equal(calls,2,'Re-enable requires a new authenticated Host Fetch')
 reader.dispose()
 assert.deepEqual(reader.snapshot(),{status:'off',data:null})
})
test('revoked, swapped or malformed Host results do not resurrect sensitive events',async()=>{
 let release:Array<(r:Response)=>void>=[]
 const read=createBrowserDignityReader({
  authorized:()=>true,digest:async()=> 'b'.repeat(64),
  fetcher:()=>new Promise<Response>(resolve=>{release.push(resolve)}),
 })
 read.setScope(true,'s1')
 await settle()
 read.setScope(true,'s2')
 await settle()
 assert.equal(release.length,2)
 release[0]!(Response.json(result(3)))
 await settle()
 assert.equal(read.snapshot().status,'loading')
 release[1]!(Response.json({...result(1),input:'private transcript'}))
 await settle()
 assert.deepEqual(read.snapshot(),{status:'unavailable',data:null})
 assert.equal(parseDignityResponse({...result(1),targeted:2}),null)
 assert.equal(parseDignityResponse({...result(1),enforcement:true}),null)
 read.dispose()
})
test('HTTP 401 and 403 never become zero incidents',async()=>{
 for(const status of [401,403,503]){
  const read=createBrowserDignityReader({authorized:()=>true,
   digest:async()=> 'a'.repeat(64),
   fetcher:async()=>new Response('denied',{status})})
  read.setScope(true,'session')
  await settle()
  assert.equal(read.snapshot().status,'unavailable')
  assert.equal(read.snapshot().data,null)
 }
})
