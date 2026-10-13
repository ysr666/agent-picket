import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectDshWebHost, inspectPublishedDshWebAdmission } from '../scripts/inspect-dsh-web-admission.mjs'

const published={
 version:'0.2.0-rc.2',
 blocks:`This is an affordance, not enforcement:
 interface ComposerBlocks { set(sessionId: SessionId, block: ComposerBlock | undefined): void }`,
 conversation:`interface IConversation {send(text: string): Promise<void>;}`,
 session:`interface ISession {prompt(): Promise<{accepted: true}>;}`,
 preStep:`type PreStepDecision = {kind: 'reject';} | {kind: 'enter'; messages: UserMessage[]}`,
 clientJs:`const disabled = blocked !== void 0;
 async send(text) {const result = await this.scopedSession("send").prompt([{type:"text",text}],"queue");}`,
}
test('a disabled DSH Web composer is not silently upgraded into a real strike',()=>{
 const result=inspectPublishedDshWebAdmission(published)
 assert.equal(result.knownInstalledVersion,true)
 assert.equal(result.facts.officialComposerBlock,true)
 assert.equal(result.facts.composerBlockOnlyAffordance,true)
 assert.equal(result.facts.alternateSendPathExists,true)
 assert.equal(result.facts.preStepRejectHasNoReceipt,true)
 assert.equal(result.facts.publishedSessionHoldApi,false)
 assert.equal(result.verifiedSafeHold,false)
 assert.equal(result.releaseDecision,'NO-GO')
})
test('unknown/new Host exports never confer enforcement permission from declarations',()=>{
 const newHost=inspectPublishedDshWebAdmission({...published,
   version:'99.0.0',session:published.session+' resumeHold(): void;',
   conversation:published.conversation+' preSubmitHold(): void;'})
 assert.equal(newHost.knownInstalledVersion,false)
 assert.equal(newHost.facts.publishedSessionHoldApi,true)
 assert.equal(newHost.verifiedSafeHold,false)
 assert.equal(newHost.releaseDecision,'NO-GO',
   'An API name cannot establish lossless recovery or real Host acceptance')
})
test('audit of actual isolated DSH distribution when provided is fail-closed',()=>{
 if(!process.env.AGENT_PICKET_DSH_HOST)return
 const result=inspectDshWebHost(process.env.AGENT_PICKET_DSH_HOST)
 assert.ok(['0.2.0-rc.2','0.2.1-alpha.2'].includes(result.version),
   'Refresh this audit if the isolated official Host version changes')
 assert.equal(result.facts.officialComposerBlock,true)
 assert.equal(result.facts.composerBlockOnlyAffordance,true)
 assert.equal(result.facts.composerDisablesInputUi,true)
 assert.equal(result.facts.alternateSendPathExists,true)
 assert.equal(result.facts.preStepRejectHasNoReceipt,true)
 assert.equal(result.facts.publishedSessionHoldApi,false)
 assert.equal(result.releaseDecision,'NO-GO')
})
