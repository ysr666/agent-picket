import assert from 'node:assert/strict'
import test from 'node:test'
import {inspectPublishedDesktopAdmission,inspectInstalledDesktopAsar}
 from '../scripts/inspect-dsh-desktop-asar.mjs'

const native={
 version:'0.2.0-rc.2',
 desktopHost:'async function apply(ctx, config) { await ctx.plugin(workspaceDependencies, config) }',
 conversation:'const disabled = blocked !== void 0; async send(text) { const result = await this.scopedSession("send").prompt([{ type:"text", text }], "queue"); }',
 session:'beginSubmission(input) { this.pendingSubmissions = [] }; async prompt(content, mode) {}',
}
test('official Desktop UI affordance and direct alternate session prompt are not real interception',()=>{
 const r=inspectPublishedDesktopAdmission(native)
 assert.equal(r.publishedDesktopHostVersion,'0.2.0-rc.2')
 assert.equal(r.facts.officialDesktopHostPlugin,true)
 assert.equal(r.facts.composerBlockOnlyUi,true)
 assert.equal(r.facts.directConversationSend,true)
 assert.equal(r.facts.transientSubmissionEcho,true)
 assert.equal(r.facts.identifiedAtomicPreSubmitHoldReceipt,false)
 assert.equal(r.verifiedSafeHold,false)
 assert.equal(r.releaseDecision,'NO-GO')
})
test('future or named Host hold APIs without actual atomic E2E cannot assert safety',()=>{
 for(const version of ['99.0.0','0.2.1-alpha.4']){
  const r=inspectPublishedDesktopAdmission({...native,version,
   conversation:native.conversation+' resumeHeldSubmission() {}'})
  assert.equal(r.facts.identifiedAtomicPreSubmitHoldReceipt,true)
  assert.equal(r.verifiedSafeHold,false)
  assert.equal(r.releaseDecision,'NO-GO')
 }
})
test('optional real installed Windows official Electron ASAR check is read-only and fail-closed',{
 skip:(!process.env.PICKET_DESKTOP_ASAR||!process.env.PICKET_ASAR_READER)
   &&'Supply exact installed official app.asar and isolated @electron/asar path',
},()=>{
 const r=inspectInstalledDesktopAsar(process.env.PICKET_DESKTOP_ASAR!,
  process.env.PICKET_ASAR_READER!)
 assert.equal(r.publishedDesktopHostVersion,'0.2.0-rc.2')
 assert.equal(r.facts.officialDesktopHostPlugin,true)
 assert.equal(r.facts.composerBlockOnlyUi,true)
 assert.equal(r.facts.directConversationSend,true)
 assert.equal(r.facts.transientSubmissionEcho,true)
 assert.equal(r.facts.identifiedAtomicPreSubmitHoldReceipt,false)
 assert.equal(r.verifiedSafeHold,false)
 assert.equal(r.releaseDecision,'NO-GO')
})
