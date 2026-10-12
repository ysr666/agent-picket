/**
 * TEST-ONLY destructive Host pre-step probe. This MUST NOT be imported by
 * src/ or published in any consumer package. It exists solely to
 * characterize why Host pre-step rejection is unsafe without lossless input
 * recovery (including every original attachment).
 */
import type { DshPreStep } from '../../src/adapters/dsh/integration.ts'

export function createDshPreStepProbe(
  rejectIds: ReadonlySet<string>,
): (payload: DshPreStep, next: () => Promise<unknown>) => Promise<unknown> {
  return async (payload, next) => {
    if (payload.messages.some(message =>
      typeof message.id === 'string' && rejectIds.has(message.id))) {
      return { kind: 'reject' }
    }
    return next()
  }
}
