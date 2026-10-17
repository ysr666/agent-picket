#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Audit of PUBLISHED Host extension surfaces, not a license to block.
 * Only a native Host E2E with actual user input + attachments + recovery can
 * authorize a capability; strings/types can solely identify missing surfaces.
 */
export function inspectPublishedDshWebAdmission({version,blocks,conversation,
  session,preStep,clientJs}) {
  const pinnedVersions=['0.2.0-rc.2','0.2.1-alpha.2','0.2.1-alpha.3','0.2.1-alpha.4','0.2.1-alpha.5']
  const isKnown=pinnedVersions.includes(version)
  // The false state is deliberate: successful shape checks do not attest
  // real Host recovery, verified human authorship, or genuine veto.
  const facts={
    version,
    officialComposerBlock: /interface ComposerBlocks\s*\{/.test(blocks)
      &&/set\(sessionId: SessionId, block: ComposerBlock \| undefined\)/.test(blocks),
    composerBlockOnlyAffordance: /This is an affordance, not enforcement/.test(blocks),
    composerDisablesInputUi: /blocked !== void 0/.test(clientJs),
    alternateSendPathExists: /send\(text: string\): Promise<void>/.test(conversation)
      && /async send\(text\)\s*\{[\s\S]{0,150}scopedSession\("send"\)\.prompt\(/.test(clientJs),
    preStepRejectHasNoReceipt: /kind: 'reject';/.test(preStep)
      && !/kind: 'hold'/.test(preStep),
    promptReturnsOnlyAccepted: /accepted: true/.test(session)
      && !/resumeHold\(/.test(session),
    publishedSessionHoldApi: /(?:holdPrompt|holdSubmission|resumeHold|beforeUserSubmit)\(/.test(session)
      || /(?:holdCurrentAttempt|resumeHold|preSubmitHold)\(/.test(conversation),
  }
  const blockers=[]
  if(facts.officialComposerBlock&&facts.composerBlockOnlyAffordance)
    blockers.push('ComposerBlocks is an in-browser visual affordance, not authoritative Host enforcement')
  if(facts.alternateSendPathExists)
    blockers.push('conversation.send(text) calls Session.prompt independently of composer block state')
  if(facts.preStepRejectHasNoReceipt)
    blockers.push('agent/pre-step.reject lacks a Host-owned original-input recovery ticket or refusal notice')
  if(!facts.publishedSessionHoldApi)
    blockers.push('No documented atomic Host-owned pre-submit hold/resume interface was detected')
  blockers.push('Direct-human provenance, retention of text plus every attachment, notice, and exactly-once resume require independent native E2E')
  return {
    kind:'agent-picket-dsh-web-admission-audit',version,
    knownInstalledVersion:isKnown, facts,
    verifiedSafeHold:false,
    releaseDecision:'NO-GO',
    blockers,
  }
}

/** The DSH installation root is provided, never auto-searches a personal profile. */
export function inspectDshWebHost(nodeModules) {
  const root=resolve(nodeModules)
  const conversation=join(root,'@deepseek-ai/dsh-client-ui-conversation')
  const session=join(root,'@deepseek-ai/dsh-api-session-controller')
  const agent=join(root,'@deepseek-ai/dsh-agent')
  const read=p=>readFileSync(p,'utf8')
  return inspectPublishedDshWebAdmission({
    version:JSON.parse(read(join(conversation,'package.json'))).version,
    blocks:read(join(conversation,'lib/types/client/input/blocks.d.ts'))+'\n'+read(join(conversation,'lib/types/client/contract/composer-blocks.d.ts')),
    conversation:read(join(conversation,'lib/types/client/service.d.ts')),
    session:read(join(session,'lib/types/client/contract/session.d.ts')),
    preStep:read(join(agent,'lib/types/runtime-types.d.ts')),
    clientJs:read(join(conversation,'lib/client.js')),
  })
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const location=process.env.AGENT_PICKET_DSH_HOST
  if(!location){
    process.stderr.write('Set AGENT_PICKET_DSH_HOST to an isolated official DSH node_modules directory.\n')
    process.exitCode=2
  }else{
    try{
      const result=inspectDshWebHost(location)
      process.stdout.write(JSON.stringify(result,null,2)+'\n')
      if(process.argv.includes('--require-safe-hold'))process.exitCode=1
    }catch(error){
      process.stderr.write('Could not inspect the official isolated DSH packages: '+String(error)+'\n')
      process.exitCode=2
    }
  }
}
