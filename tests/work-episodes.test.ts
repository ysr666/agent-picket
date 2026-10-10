import assert from 'node:assert/strict'
import test from 'node:test'
import { projectCompletedWorkEpisodes } from '../src/core/work-episodes.ts'
import type { WorkEvent } from '../src/core/types.ts'
const event = (id:string,type:'turn-start'|'turn-end',t:number,sessionId='s'):WorkEvent =>
  ({id,type,recordedAtMs:t,agentId:'a',sessionId})
const measure=(events:readonly WorkEvent[],coverage:'complete'|'partial'|'unavailable'='complete')=>
  projectCompletedWorkEpisodes({agentId:'a',sessionId:'s',events,coverage})
test('gap merges into one episode but active duration excludes idle',()=>{
 const v=measure([event('1','turn-start',0),event('2','turn-end',60_000),
   event('3','turn-start',240_000),event('4','turn-end',360_000)])
 assert.equal(v.episodes?.length,1)
 assert.equal(v.episodes[0]?.wallSpanMs,360_000)
 assert.equal(v.episodes[0]?.completedTurnMs,180_000)
 assert.equal(v.longestCompletedTurnMs,180_000)
})
test('long gap starts a new episode',()=>{
 const v=measure([event('1','turn-start',0),event('2','turn-end',1),
   event('3','turn-start',400_002),event('4','turn-end',400_005)])
 assert.equal(v.episodes?.length,2)
})
test('partial history, an unclosed turn and foreign sessions cannot yield invented time',()=>{
 assert.equal(measure([event('a','turn-start',1)],'partial').episodes,null)
 assert.deepEqual(measure([event('a','turn-start',1)]).episodes,[])
 assert.deepEqual(measure([event('a','turn-start',1,'foreign'),event('b','turn-end',100,'foreign')]).episodes,[])
})
test('duplicate input replay never double counts',()=>{
 const events=[event('a','turn-start',10),event('b','turn-end',50)]
 assert.equal(measure([...events,...events]).episodes?.[0]?.completedTurnMs,40)
})
test('mismatched pairing cannot manufacture a long interrupted turn',()=>{
 const e=[event('a','turn-start',10),event('b','turn-start',20),event('c','turn-end',100)]
 assert.equal(measure(e).episodes?.[0]?.completedTurnMs,80)
})
