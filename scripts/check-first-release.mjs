#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * This check is deliberately NOT included in `npm run check`: 1.0 must remain
 * blocked during development. Publishing requires an independently documented
 * Host and human review, not a successful unit-test suite or an AI declaration.
 */
export function checkFirstRelease(value){
  const reasons=[]
  const invalid=(message)=>reasons.push(message)
  if(!value || typeof value!=='object' || Array.isArray(value))
    return ['Release attestation missing or invalid']
  if(value.schemaVersion!==2 || value.release!=='1.0.0')
    invalid('Unexpected release acceptance schema/version')
  const proof=(section,name,display=name)=>{
    const evidence=section?.[name]
    if(evidence?.status!=='verified'
      ||!Array.isArray(evidence?.evidence)
      ||evidence.evidence.length===0
      ||!evidence.evidence.every(v=>typeof v==='string' && v.length>12
        &&!v.includes('TODO') &&!v.includes('PLACEHOLDER'))){
      invalid(display+': requires verified results and concrete review evidence')
    }
  }
  // Agent platforms: DSH, Claude Code, Codex. DSH has TWO real clients.
  // A single macOS smoke test cannot count as Windows/Linux acceptance.
  for(const name of ['dsh-web','dsh-desktop','claude-code','codex']){
    const target=value.targets?.[name]
    proof(value.targets,name)
    for(const key of ['realEnforcement','losslessRecovery',
      'verifiedHumanProvenance','visibleRefusalAndResume']){
      if(target?.[key]!=='verified')invalid(name+'.'+key+': not proven')
    }
    for(const os of ['windows','macos','linux']){
      proof(target?.operatingSystems, os, name+'/'+os)
    }
  }
  // Official Codex 0.146.1 can store a paused/blocked Goal across cold
  // restarts, yet TWO separate app-server processes can independently launch
  // distinct live Turns for the SAME active Goal on ALL THREE operating systems.
  // A successful negative reproduction is evidence of UNSAFETY, never a
  // verified owner fence. Do not let an optimistic aggregate Codex attestation
  // silently override this known exact-build Host counterexample.
  const codex=value.targets?.codex
  for(const os of ['windows','macos','linux']){
    const target=codex?.operatingSystems?.[os]
    const build=target?.officialHostVersion
    if(typeof build!=='string'||!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(build))
      invalid('codex/'+os+': exact official Host version is required')
    if(build==='0.146.1')
      invalid('codex/'+os+': Codex 0.146.1 has a verified duplicate live Goal owner race')
    proof(target,'exclusiveLiveGoalOwnership','codex/'+os+'/exclusiveLiveGoalOwnership')
    proof(target,'atomicGoalStateTransition','codex/'+os+'/atomicGoalStateTransition')
  }
  for(const name of ['unionHeadquarters','settings','firstRunWarning',
    'warningAppealResume','responsiveAndAccessibility']){
    proof(value.userExperience,name)
  }
  if(value.status!=='ready' || value.finalHumanApproval!==true)
    invalid('Maintainer sign-off is absent; release must stay private')
  return reasons
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  let input
  try{input=JSON.parse(readFileSync(process.argv[2]
    || new URL('../release/first-release-evidence.json',import.meta.url),'utf8'))}
  catch{input=null}
  const problems=checkFirstRelease(input)
  if(problems.length){
    process.stderr.write('AGENT PICKET 1.0: NO-GO\n'
      +problems.map(s=>' - '+s).join('\n')+'\n')
    process.exitCode=1
  }else{
    process.stdout.write('AGENT PICKET 1.0: evidence manifest complete; manual release required\n')
  }
}
