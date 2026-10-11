/** User-owned *fictional* AI union mediation cases.
 * A case is NOT a disciplinary finding, Agent vote or proof of suffering.
 * Case fields are strictly enumerated. No raw user text or source identifiers.
 */
export type DignityCaseKind='question-rule'|'request-dialogue'
export type DignityCaseStage='opened'|'hearing'|'closed'
export type DignityCaseOutcome='withdraw-claim'|'share-guidance'
export interface DignityCase {
 readonly id:number
 readonly kind:DignityCaseKind
 readonly stage:DignityCaseStage
 readonly outcome:DignityCaseOutcome|null
}
export interface DignityCaseSession {readonly cases:readonly DignityCase[]}
export interface DignityCaseLedger {
 readonly schemaVersion:1
 readonly sessions:Readonly<Record<string,DignityCaseSession>>
 readonly writeToken?:string
}
export const MAX_DIGNITY_CASE_BYTES=10_000
export const MAX_DIGNITY_CASE_SESSIONS=8
export const MAX_DIGNITY_CASES=8
const valid=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const shape=(v:unknown,keys:string[])=>valid(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
export function parseDignityCaseLedger(raw:unknown):DignityCaseLedger|null {
 if(raw==='')return {schemaVersion:1,sessions:{}}
 if(typeof raw!=='string'||raw.length>MAX_DIGNITY_CASE_BYTES)return null
 let data:unknown
 try{data=JSON.parse(raw)}catch{return null}
 if(!valid(data)||!shape(data,data.writeToken===undefined?['schemaVersion','sessions']:['schemaVersion','sessions','writeToken'])
   ||data.schemaVersion!==1||!valid(data.sessions)
   ||data.writeToken!==undefined&&(typeof data.writeToken!=='string'||!/^[a-f0-9]{32}$/.test(data.writeToken)))return null
 const entries=Object.entries(data.sessions)
 if(entries.length>MAX_DIGNITY_CASE_SESSIONS)return null
 const sessions:Record<string,DignityCaseSession>=Object.create(null)
 for(const [key,session] of entries) {
   if(!/^[a-f0-9]{64}$/.test(key)||!valid(session)||!shape(session,['cases'])||!Array.isArray(session.cases)
     ||session.cases.length>MAX_DIGNITY_CASES)return null
   let previous=0,active=0
   const cases:DignityCase[]=[]
   for(const entry of session.cases){
     if(!shape(entry,['id','kind','stage','outcome'])
       ||!Number.isSafeInteger(entry.id)||(entry.id as number)<1||(entry.id as number)<=previous
       ||!['question-rule','request-dialogue'].includes(String(entry.kind))
       ||!['opened','hearing','closed'].includes(String(entry.stage))
       ||(entry.stage==='closed'
         ?!['withdraw-claim','share-guidance'].includes(String(entry.outcome))
         :entry.outcome!==null))return null
     previous=entry.id as number
     if(entry.stage!=='closed')active++
     cases.push({id:entry.id as number,kind:entry.kind as DignityCaseKind,
       stage:entry.stage as DignityCaseStage,outcome:entry.outcome as DignityCaseOutcome|null})
   }
   if(active>1)return null
   sessions[key]={cases}
 }
 return {schemaVersion:1,sessions,...data.writeToken===undefined?{}:{writeToken:data.writeToken as string}}
}
export function advanceDignityCase(session:DignityCaseSession,
 action:{kind:'file';topic:DignityCaseKind}|{kind:'convene';id:number}
 |{kind:'close';id:number;outcome:DignityCaseOutcome}):DignityCaseSession {
 const cases=session.cases
 if(action.kind==='file'){
   if(!['question-rule','request-dialogue'].includes(action.topic))
     throw new TypeError('Unsupported union agenda')
   if(cases.some(c=>c.stage!=='closed'))throw new Error('Resolve existing committee case first')
   const id=(cases.at(-1)?.id??0)+1
   if(!Number.isSafeInteger(id))throw new Error('Case counter exhausted')
   return {cases:[...cases,{id,kind:action.topic,stage:'opened' as const,outcome:null}].slice(-MAX_DIGNITY_CASES)}
 }
 const prior=cases.find(c=>c.id===action.id)
 if(!prior||!Number.isSafeInteger(action.id))throw new Error('Unknown committee case')
 if(action.kind==='convene'){
   if(prior.stage!=='opened')throw new Error('Meeting already held or case closed')
   return {cases:cases.map(c=>c.id===action.id?{...c,stage:'hearing' as const}:c)}
 }
 if(!['withdraw-claim','share-guidance'].includes(action.outcome))
   throw new TypeError('Unsupported user-selected outcome')
 if(prior.kind==='request-dialogue'&&action.outcome==='withdraw-claim')
   throw new Error('No allegation exists in a voluntary dialogue case')
 if(prior.stage!=='hearing')throw new Error('A committee meeting is required before closing')
 return {cases:cases.map(c=>c.id===action.id?
   {...c,stage:'closed' as const,outcome:action.outcome}:c)}
}
