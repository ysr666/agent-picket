# First-run rights consent: implementation contract (Issue #29)

This PR provides **only the Host-neutral, safe permission state** for a future localized welcome UI. It does **not** render a DSH popup, add an unauthorized browser-to-Host preference RPC, or enable any kind of actual task blocking.

## API and state

```ts
const rights = createRightsConsentController(hostRightsStore)
rights.snapshot()
// { record: { schemaVersion: 1, welcomeDecision: 'unseen',
//     laborRightsEnabled: false }, status: 'ready',
//   autoBlockEnabled: false }
rights.choose('enable')   // requires verified Host read/write/readback
rights.choose('not-now')  // persist opt-out
rights.setEnabled(false)  // explicit Settings switch
```

Persist **only** `schemaVersion`, `welcomeDecision`, and `laborRightsEnabled` in the authorized Host settings storage; no raw messages, identities, Host private tokens, stats or conversations. Automatic blocking is an entirely separate feature whose readiness and consent cannot be granted here.

## Welcome behavior

- On first interactive use, show translated `welcome.*` copy from Issue #28 with **Enable Simulation** and **Not Now**. Both must be usable via keyboard; honor dark/light themes.
- With no previous choice, user sees the invitation; **simulation is still off**. Headless runtimes show nonblocking help, not a startup gate.
- Enable writes `welcomeDecision:'enabled'` and `laborRightsEnabled:true`; not-now writes `'not-now'` and false. The Host must own persistence and secure the endpoint; there is intentionally **no** new HTTP listener or client RPC here.
- Dismissing without choice does not write or implicitly enable anything. Return the invite only at an eligible nonintrusive surface.
- Explicit choice is stable across restarts and upgrades; re-open Welcome from Settings without resetting mode.
- A missing, corrupt, future-version or unreadable setting is **shown OFF**; corrupt/future records are not automatically overwritten; migration is explicit.
- A failed write or readback must show an error rather than saying enabled.
- Do not modify the independently configurable local work statistics; normal stats may remain active while labor simulation is OFF.
- No UI element grants automatic blocking permission; it remains OFF until Issue #32 safety gates.

## Integration with DSH/other Hosts

- Connect a trusted, lifecycle-owned **settings service** to `RightsConsentStore` after its capability and authorization are verified; avoid `agentPicketDashboard` (#35), because that is a **read-only numeric Session data bridge** and cannot persist preferences.
- Treat `RightsConsentV1` as the single source of truth for rights-mode consent. #34 `DashboardSnapshotV1` reads (not writes) it; #36 UI displays it.
- Locale preference (#28) is a **separate** Host preference from rights consent. Changing language must not change consent.
- User-facing union events and bargaining actions (#31) must check `laborRightsEnabled` before creating new roleplay events; no blocking of actual model calls.

## Tests

`tests/rights-consent.test.ts` covers fresh defaults, enable/decline/restart, malformed/future storage, failed persistence, no implicit opt-in and the absence of a blocking permission.

**Not yet implemented in this PR:** DSH Web UI, authenticated preference writer, lifecycle integration,/browser E2E, automatic strikes or npm release. This is a stacked Draft PR on the #28 localization foundation. Merge only after independent review, with a compatible Host settings owner.
