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
 assert.equal(result.verifiedDiscardRefusal,false)
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
 assert.ok(['0.2.0-rc.2','0.2.1-alpha.2','0.2.1-alpha.3','0.2.1-alpha.4','0.2.1-alpha.5','0.2.1-rc.2'].includes(result.version),
   'Refresh this audit if the isolated official Host version changes')
 assert.equal(result.facts.officialComposerBlock,true)
 assert.equal(result.facts.composerBlockOnlyAffordance,true)
 assert.equal(result.facts.composerDisablesInputUi,true)
 assert.equal(result.facts.alternateSendPathExists,true)
 assert.equal(result.facts.preStepRejectHasNoReceipt,true)
 assert.equal(result.facts.publishedSessionHoldApi,false)
 assert.equal(result.releaseDecision,'NO-GO')
})

test('official DSH 0.2.1-alpha.3 declaration shape cannot authorize lossy input interception',()=>{
 const candidate=inspectPublishedDshWebAdmission({...published,
  version:'0.2.1-alpha.3'})
 assert.equal(candidate.knownInstalledVersion,true,
  'The exact alpha.3 distribution was independently inspected')
 assert.equal(candidate.facts.officialComposerBlock,true)
 assert.equal(candidate.facts.composerBlockOnlyAffordance,true)
 assert.equal(candidate.facts.alternateSendPathExists,true)
 assert.equal(candidate.facts.preStepRejectHasNoReceipt,true)
 assert.equal(candidate.facts.publishedSessionHoldApi,false)
 assert.equal(candidate.verifiedSafeHold,false)
 assert.equal(candidate.releaseDecision,'NO-GO')
})


test('independently installed DSH 0.2.1-alpha.4 still cannot authorize lossy normal-chat interception',()=>{
  const candidate=inspectPublishedDshWebAdmission({...published,
    version:'0.2.1-alpha.4'})
  assert.equal(candidate.knownInstalledVersion,true,
    'Published alpha.4 was independently installed and its exact public declarations read')
  assert.equal(candidate.facts.officialComposerBlock,true)
  assert.equal(candidate.facts.composerBlockOnlyAffordance,true)
  assert.equal(candidate.facts.alternateSendPathExists,true)
  assert.equal(candidate.facts.preStepRejectHasNoReceipt,true)
  assert.equal(candidate.facts.publishedSessionHoldApi,false)
  assert.equal(candidate.verifiedSafeHold,false)
  assert.equal(candidate.releaseDecision,'NO-GO',
    'Even real successful alpha.4 Goal block/resume is not ordinary prompt-and-attachments recovery')
})


test('genuine published DSH 0.2.1-alpha.5 remains NO-GO for ordinary human pre-submit hold',()=>{
 const candidate=inspectPublishedDshWebAdmission({...published,
   version:'0.2.1-alpha.5'})
 assert.equal(candidate.knownInstalledVersion,true,
   'The exact published alpha.5 package was separately installed and inspected')
 assert.equal(candidate.facts.officialComposerBlock,true)
 assert.equal(candidate.facts.composerBlockOnlyAffordance,true)
 assert.equal(candidate.facts.alternateSendPathExists,true)
 assert.equal(candidate.facts.preStepRejectHasNoReceipt,true)
 assert.equal(candidate.facts.publishedSessionHoldApi,false)
 assert.equal(candidate.verifiedSafeHold,false)
 assert.equal(candidate.releaseDecision,'NO-GO',
   'New official Goal compatibility must not be misreported as human attachment hold')
})

test('official DSH 0.2.1-rc.2 remains an audited NO-GO for ordinary human input hold',()=>{
 const candidate=inspectPublishedDshWebAdmission({...published,
  version:'0.2.1-rc.2'})
 assert.equal(candidate.knownInstalledVersion,true,
  'The exact published rc.2 distribution was separately installed and compared')
 assert.equal(candidate.facts.officialComposerBlock,true)
 assert.equal(candidate.facts.composerBlockOnlyAffordance,true)
 assert.equal(candidate.facts.alternateSendPathExists,true)
 assert.equal(candidate.facts.preStepRejectHasNoReceipt,true)
 assert.equal(candidate.facts.publishedSessionHoldApi,false)
 assert.equal(candidate.verifiedSafeHold,false)
 assert.equal(candidate.releaseDecision,'NO-GO',
  'A fresh official candidate does not make source-less human attachment recovery safe')
})
