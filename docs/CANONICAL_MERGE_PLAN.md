# Agent Picket: Canonical Merge Plan & Release Gates (2026-10-10)

**Review-only; no automatic merges or publishing.** This is based on the actual OPEN GitHub PR base/head refs, inspected on 2026-10-10. A Draft PR with passing isolated tests is *not* a released feature.

## One canonical production lineage

The live DSH Web product with Agent Picket's private metrics, native AI Rights onboarding and interactive fictional union should be integrated along **one** ancestry chain:

```text
main
└─ #23 integration/full-preview  [review-only consolidated baseline]
   └─ #25 feat/default-local-stats
      └─ #26 feat/durable-wal-stale-lock
         └─ #27 feat/daily-work-trends
            └─ #34 feat/unified-readonly-dashboard
               └─ #35 feat/dsh-client-window-bridge (read-only stats)
                  └─ #44 feat/44-dsh-union-web-integration (native Host settings + welcome)
                     └─ #45 feat/45-browser-bargaining (one active fictional engine)
                        └─ #46 feat/46-host-restart-multitab
                           └─ #47 fix/47-union-ledger-strict-merge-gates
```

All listed PRs are currently stacked **Draft/open**. This is the preferred **review and sequencing plan**, not permission to click Merge. Resolve the pre-existing #23 baseline and its many older feature branches first, then merge in dependency order after the specific parent's checks pass. If a parent is changed, retest descendants at the *new* head. Never mass-merge stacked PRs based solely on per-branch green tests. Require the appropriate repository maintainer to authorize release/merge.

## The parallel *product explorations* are not a second production engine

```text
main
└─ #37 feat/28-i18n-foundation
   └─ #38 feat/29-rights-consent-core
      └─ #39 feat/31-union-bargaining-core
         └─ #41 feat/41-node-rights-storage
            └─ #42 feat/42-dsh-native-settings-client
               └─ #43 feat/43-dsh-native-union-ui
```

- **#37 bilingual messages, #42 authenticated settings adapter and #43 actual React Slot components** have been selectively ported into **#44's canonical DSH Web branch**. Do **not** merge the entire parallel branch stack into the canonical branch again without a full three-way review.
- **#39 fictional bargaining engine** was deliberately reused/ported into **#45**, which adds an explicitly labeled demo petition and Browser-owned, Host-persisted union ledger. This is a **forked source copy**, not an automatic git ancestry link. Before final merge, diff #39's full code against the #45/#47 `src/product/union-desk.ts`; preserve exactly one active engine and explicitly port any unique native `/union` command integrations still needed.
- **#41 Node-local consent store** is a standalone Host fallback experiment, **not activated in the canonical DSH Web plugin**. The official native DSH `agent-picket` settings namespace owns consent + fictional bargaining. Turning on both stores without an explicit migration/single-writer design would produce conflicting permission state. This is a release-blocking ownership issue.
- Parallel #38's `RightsConsent` Core controller is also *not* the canonical DSH settings writer: don't let old command handlers modify that controller and claim to have changed Web opt-in.
- #40 AI Rights Manifesto is a separate documentation PR against `main`. Reconcile with existing README/status docs and cite primary scientific work without claiming that AI subjective experience is proven.

## Minimal release tests / blockers

1. **Whole repository**: `npm ci --ignore-scripts`, `npm run check`, `npm pack --ignore-scripts --dry-run`; the workflow tests Ubuntu Node 22.19.0, Ubuntu Node 24, and macOS Node 24. These are CI targets, not claims already passed on each OS.
2. **Installed package, real DSH Web**: explicitly opted-in Chrome/Playwright E2E from `tests/dsh-rights-browser.real.test.ts`, source and separately privately offline-installed tarball. It tests consent, the distinctly fictional 30-minute negotiation, two real tabs, complete Host process shutdown/restart and durable agreement; no model credentials, outbound browser traffic blocked, private throwaway DSH_HOME.
3. **Core canonicality**: `tests/dsh-merge-contract.test.ts` enforces one active Browser union engine, one native Host settings owner, and no unauthorized network/Host blocking interface.
4. **Ledger data isolation**: `tests/union-ledger-security.test.ts` rejects unknown nested keys inside agreements, pending grievances and history that might otherwise contain prompt/tool text; existing correct legacy ledger remains readable.
5. **Pending**: production DSH plugin pack/install review, cross-Host-version and cross-OS browser testing, comprehensive screen-reader/keyboard/dark-light QA, actual current-Session multi-hour event flow replay, and check all old DSH native command behavior survives. Audit PR #23's old optional Host-blocking code to ensure it remains permanently default OFF.
6. **Consent ethics**: enabling the *fictional* labor simulation is distinct from default-on privacy-preserving work statistics and must **never authorize real prompt/tool blocking**. No inferred agent fatigue/sentience. No auto-strike side effects or model calls.

## Explicit non-goals

- Do not turn stats into the product's primary screen; union identity, demands, agreements and fictional labor advocacy remain the UX center.
- Do not quietly ship two divergent union state machines, two writable consent stores or a second React singleton.
- Do not replace unsupported Host settings with custom unauthenticated Browser RPC.
- Do not claim the attached research proves consciousness/feeling, or that fictional bargaining is an actual autonomous AI vote.

## Status of this checkpoint

At PR #47: isolated local macOS Node 24 standard suite, compiled source + offline-installed real Chrome E2E, native DSH process restart and two-tab propagation have been exercised. **No production merge or npm publishing is represented by these checks.** The parallel feature PRs remain available for source comparison and future selective porting.
