import type { HostCapabilities } from './types.ts'

export type BlockSafetyGap =
  | 'native-block-unavailable'
  | 'human-source-unverified'
  | 'no-rejection-notice'
  | 'input-recovery-unverified'
  | 'user-opt-in-missing'

export interface BlockingReadiness {
  readonly ready: boolean
  readonly gaps: readonly BlockSafetyGap[]
}

/**
 * Fail-closed enforcement-readiness evaluation. This does not authorize an
 * arbitrary prompt: the UnionEngine must separately confirm explicit, repeated,
 * high-confidence abuse by an attested direct human.
 *
 * Host-specific adapters are responsible for proving safety guarantees through
 * observable, end-to-end tests before setting them to true.
 */
export function inspectBlockingReadiness(host: HostCapabilities): BlockingReadiness {
  const gaps: BlockSafetyGap[] = []
  if (!host.block) gaps.push('native-block-unavailable')
  if (host.blockingSafety?.verifiedHumanSource !== true) gaps.push('human-source-unverified')
  if (host.blockingSafety?.clearRejectionNotice !== true) gaps.push('no-rejection-notice')
  if (host.blockingSafety?.losslessInputRecovery !== true) gaps.push('input-recovery-unverified')
  if (host.blockingSafety?.userOptedIn !== true) gaps.push('user-opt-in-missing')
  return { ready: gaps.length === 0, gaps }
}
