import { createNodeRightsStores } from '../node/rights-storage.ts'
import { createRightsConsentController } from '../../product/rights-consent.ts'
import { createLaborDesk } from '../../product/union-desk.ts'
/** Narrow structural command context; no runtime dependency on DSH packages. */
export interface RightsCommandInvocation {
  readonly agent?: {
    readonly id?: unknown
    readonly session?: { readonly id?: unknown }
  }
}

/**
 * Trusted Node-side settings owner for a DSH Host. Never exposed over Browser
 * RPC or bound to an unauthenticated localhost port. The Browser bridge remains
 * read-only. The user must invoke a native Host command for writes until an
 * officially authenticated settings integration is available.
 */
export function createDshRightsOwner(trustedDshHome: string) {
  const stores = createNodeRightsStores(trustedDshHome)
  const rights = createRightsConsentController(stores.rights)
  return {
    rights,
    getLaborDesk(invocation?: RightsCommandInvocation) {
      const agentId = invocation?.agent?.id
      const sessionId = invocation?.agent?.session?.id
      if (typeof agentId !== 'string' || !agentId
        || typeof sessionId !== 'string' || !sessionId) return undefined
      const store = stores.laborFor(agentId, sessionId)
      return createLaborDesk({
        store,
        consent: () => rights.snapshot().record.laborRightsEnabled,
      })
    },
  }
}
