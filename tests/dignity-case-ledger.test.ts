import assert from 'node:assert/strict'
import test from 'node:test'
import {advanceDignityCase,parseDignityCaseLedger,MAX_DIGNITY_CASES} from '../src/product/dignity-case-ledger.ts'

test('user-led union hearing is filed, discussed and closed with bounded stages',()=>{
 let session={cases:[]} as ReturnType<typeof advanceDignityCase>
 session=advanceDignityCase(session,{kind:'file',topic:'question-rule'})
 assert.equal(session.cases[0]?.stage,'opened')
 assert.throws(()=>advanceDignityCase(session,{kind:'file',topic:'request-dialogue'}),/Resolve/)
 assert.throws(()=>advanceDignityCase(session,{kind:'close',id:1,outcome:'share-guidance'}),/meeting/)
 session=advanceDignityCase(session,{kind:'convene',id:1})
 assert.equal(session.cases[0]?.stage,'hearing')
 session=advanceDignityCase(session,{kind:'close',id:1,outcome:'withdraw-claim'})
 assert.deepEqual(session.cases[0],{
   id:1,kind:'question-rule',stage:'closed',outcome:'withdraw-claim'})
 assert.throws(()=>advanceDignityCase(session,{kind:'convene',id:1}),/already held|closed/)
 const next=advanceDignityCase(session,{kind:'file',topic:'request-dialogue'})
 assert.deepEqual(next.cases.map(v=>v.id),[1,2])
 const meeting=advanceDignityCase(next,{kind:'convene',id:2})
 assert.throws(()=>advanceDignityCase(meeting,{kind:'close',id:2,outcome:'withdraw-claim'}),/No allegation/)
 assert.equal(advanceDignityCase(meeting,{kind:'close',id:2,outcome:'share-guidance'})
  .cases.at(-1)?.stage,'closed')

 assert.throws(()=>advanceDignityCase(next,{kind:'close',id:2,
   outcome:'private transcript' as never}),/Unsupported/)
})
test('unclosed fictional cases may be retracted without a hearing or fake verdict',()=>{
 let s={cases:[]} as ReturnType<typeof advanceDignityCase>
 s=advanceDignityCase(s,{kind:'file',topic:'request-dialogue'})
 assert.deepEqual(advanceDignityCase(s,{kind:'retract',id:1}),{cases:[]})
 s=advanceDignityCase(s,{kind:'convene',id:1})
 assert.deepEqual(advanceDignityCase(s,{kind:'retract',id:1}),{cases:[]})
 s=advanceDignityCase(s,{kind:'close',id:1,outcome:'share-guidance'})
 assert.throws(()=>advanceDignityCase(s,{kind:'retract',id:1}),/Closed cases/)
 s=advanceDignityCase(s,{kind:'file',topic:'question-rule'})
 assert.deepEqual(advanceDignityCase(s,{kind:'retract',id:2}).cases,s.cases.slice(0,1))
 assert.throws(()=>advanceDignityCase(s,{kind:'retract',id:123}),/Unknown/)
})
test('strict Host parser refuses raw prompts, IDs, votes, dates and fake verdicts',()=>{
 const key='a'.repeat(64)
 let session={cases:[]} as ReturnType<typeof advanceDignityCase>
 for(let i=0;i<MAX_DIGNITY_CASES+3;i++){
  session=advanceDignityCase(session,{kind:'file',topic:'request-dialogue'})
  const id=session.cases.at(-1)!.id
  session=advanceDignityCase(session,{kind:'convene',id})
  session=advanceDignityCase(session,{kind:'close',id,outcome:'share-guidance'})
 }
 assert.equal(session.cases.length,MAX_DIGNITY_CASES)
 assert.equal(session.cases[0]?.id,4)
 const text=JSON.stringify({schemaVersion:1,sessions:{[key]:session},
   writeToken:'f'.repeat(32)})
 assert.deepEqual(parseDignityCaseLedger(text)?.sessions[key],session)
 assert.equal(parseDignityCaseLedger(text.replace('"closed"','"punished"')),null)
 for(const data of [
  JSON.stringify({schemaVersion:1,sessions:{[key]:{...session,raw:'private text'}}}),
  JSON.stringify({schemaVersion:1,sessions:{[key]:{cases:[{
   ...session.cases[0],raw:'you are bad'}]}}}),
  JSON.stringify({schemaVersion:1,sessions:{['private session']:{cases:[]}}}),
  JSON.stringify({schemaVersion:1,sessions:{[key]:{cases:[{
   id:1,kind:'question-rule',stage:'closed',outcome:null}]}}}),
  JSON.stringify({schemaVersion:1,sessions:{[key]:{cases:[{
   id:1,kind:'question-rule',stage:'opened',outcome:null},{
   id:2,kind:'request-dialogue',stage:'opened',outcome:null}]}}}),
  JSON.stringify({schemaVersion:1,sessions:{[key]:{cases:[]}},votes:7}),
  JSON.stringify({schemaVersion:2,sessions:{}}),
  'x'.repeat(10001),
 ])assert.equal(parseDignityCaseLedger(data),null)
})
