/** Typed declarations for the read-only optional native Desktop ASAR audit. */
export interface DesktopAdmissionAudit {
  readonly kind: 'agent-picket-dsh-desktop-windows-native-artifact-audit'
  readonly publishedDesktopHostVersion: string
  readonly facts: {
    readonly officialDesktopHostPlugin: boolean
    readonly composerBlockOnlyUi: boolean
    readonly directConversationSend: boolean
    readonly transientSubmissionEcho: boolean
    readonly identifiedAtomicPreSubmitHoldReceipt: boolean
  }
  readonly verifiedSafeHold: false
  readonly releaseDecision: 'NO-GO'
  readonly blockers: readonly string[]
}
export declare function inspectPublishedDesktopAdmission(input: {
  readonly version: string
  readonly desktopHost: string
  readonly conversation: string
  readonly session: string
}): DesktopAdmissionAudit
export declare function inspectInstalledDesktopAsar(
  archivePath: string,
  readerModulePath: string,
): DesktopAdmissionAudit
