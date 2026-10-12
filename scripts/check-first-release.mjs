#!/usr/bin/env node
import { readFileSync } from 'node:fs'

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
  if(value.schemaVersion!==1 || value.release!=='1.0.0')
    invalid('Unexpected release acceptance schema/version')
  const proof=(section,name)=>{
    const evidence=section?.[name]
    if(evidence?.status!=='verified'
      ||!Array.isArray(evidence?.evidence)
      ||evidence.evidence.length===0
      ||!evidence.evidence.every(v=>typeof v==='string' && v.length>12
        &&!v.includes('TODO') &&!v.includes('PLACEHOLDER'))){
      invalid(name+': requires verified results and concrete review evidence')
    }
  }
  for(const name of ['web','cli','acp'])proof(value.surfaces,name)
  for(const name of ['macos','windows','linux'])proof(value.operatingSystems,name)
  for(const name of ['dsh','codex','claude-code']){
    const host=value.hosts?.[name]
    proof(value.hosts,name)
    for(const key of ['realEnforcement','losslessRecovery',
      'verifiedHumanProvenance','visibleRefusalAndResume']){
      if(host?.[key]!=='verified')invalid(name+'.'+key+': not proven')
    }
  }
  for(const name of ['unionHeadquarters','settings','firstRunWarning',
    'warningAppealResume','responsiveAndAccessibility']){
    proof(value.userExperience,name)
  }
  if(value.status!=='ready' || value.finalHumanApproval!==true)
    invalid('Maintainer sign-off is absent; release must stay private')
  return reasons
}

if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
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
