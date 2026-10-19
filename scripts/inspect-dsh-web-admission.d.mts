export interface PublishedDshWebAdmissionInputs {
  version:string
  blocks:string
  conversation:string
  session:string
  preStep:string
  clientJs:string
}
export interface DshWebAdmissionReport {
  kind:'agent-picket-dsh-web-admission-audit'
  version:string
  knownInstalledVersion:boolean
  facts:{
    version:string
    officialComposerBlock:boolean
    composerBlockOnlyAffordance:boolean
    composerDisablesInputUi:boolean
    alternateSendPathExists:boolean
    preStepRejectHasNoReceipt:boolean
    promptReturnsOnlyAccepted:boolean
    publishedSessionHoldApi:boolean
  }
  verifiedSafeHold:false
  verifiedDiscardRefusal:false
  releaseDecision:'NO-GO'
  blockers:string[]
}
export function inspectPublishedDshWebAdmission(input:PublishedDshWebAdmissionInputs):DshWebAdmissionReport
export function inspectDshWebHost(nodeModules:string):DshWebAdmissionReport
