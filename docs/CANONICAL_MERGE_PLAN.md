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
                              └─ #48 feat/48-native-union-command-consistency
                                 └─ #49 test/49-web-composer-union-parity
                                    └─ #50 feat/50-union-cli-i18n
                                       └─ #51 feat/51-union-legacy-cli-i18n
                                          └─ #52 fix/52-union-dialog-keyboard-a11y
                                             └─ #54 fix/53-union-reflow-forced-colors
                                                └─ #55 test/union-ax-canonical-20261010 (AX verification)
                                                   └─ #56 test/union-host-error-zoom-review-20261010
                                                      └─ fix/dsh-017-host-compatibility-20261010 (experimental Host/profile only)
                                                         └─ fix/dsh-017-client-official-settings-20261010 (Web rights verified, Composer pending)
                                                            └─ fix/dsh017-composer-native-parity-20261010 (Composer parity + real Host CAS proof)
                                                               └─ test/release-privacy-a11y-gates-20261010 (candidate pre-release audit)
                                                                  └─ fix/61-welcome-modal-focus-return-20261010 (sidebar keyboard return)
                                                                     └─ fix/62-host-revoke-lifecycle-20261010 (Host receipt lifecycle, Composer flake #62)
```

**Sibling warning:** PR #53 (`fix/53-union-reflow-dynamic-focus`) and PR #54 (`fix/53-union-reflow-forced-colors`) both target #52. They are *not* sequential commits. This proposal builds on the #54 head and selectively ports #53's real Chrome accessibility-tree assertion, extending it to the welcome dialog and 320px reflow. Do not merge #53 and #54 serially or close either as merged on the strength of this proposal. The proposed test branch is also Draft-only, not a release.

The earlier DSH 0.1.7 Host-only experiment is superseded for Web rights by `docs/DSH_017_OFFICIAL_CLIENT_WEB_VALIDATION.md` (verified Web, Composer parity still blocked). The DSH 0.1.7 experiment is **NOT full compatibility**: its native Config and bundle shape have partial evidence, but the real Web welcome/union sidebar still fails. See `docs/DSH_017_HOST_PROFILE_EXPERIMENT.md`. Do not merge a release from this experiment.

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
- **#39 fictional bargaining engine** was deliberately reused/ported into **#45**, which adds an explicitly labeled demo petition and Browser-owned, Host-persisted union ledger. This is a **forked source copy**, not an automatic git ancestry link. Before final merge, diff #39's full code against the #45/#48 `src/product/union-desk.ts`; preserve exactly one active engine. **#48 now ports rights on/off/status, grievances, explicitly fictional petitions, accept/decline and counter/resolve** through native DSH's same Host settings owner, while keeping earlier work-stats/monitor commands. Review remaining #39/#41 command and locale feature parity separately; do not reactivate their independent permission stores.
- **#41 Node-local consent store** is a standalone Host fallback experiment, **not activated in the canonical DSH Web plugin**. The official native DSH `agent-picket` settings namespace owns consent + fictional bargaining. Turning on both stores without an explicit migration/single-writer design would produce conflicting permission state. This is a release-blocking ownership issue.
- Parallel #38's `RightsConsent` Core controller is also *not* the canonical DSH settings writer: don't let old command handlers modify that controller and claim to have changed Web opt-in.
- #40 AI Rights Manifesto is a separate documentation PR against `main`. Reconcile with existing README/status docs and cite primary scientific work without claiming that AI subjective experience is proven.

## Minimal release tests / blockers

1. **Whole repository**: `npm ci --ignore-scripts`, `npm run check`, `npm pack --ignore-scripts --dry-run`; the workflow tests Ubuntu Node 22.19.0, Ubuntu Node 24, and macOS Node 24. These are CI targets, not claims already passed on each OS.
2. **Installed package, real DSH Web**: explicitly opted-in Chrome/Playwright E2E from `tests/dsh-rights-browser.real.test.ts`, source and separately privately offline-installed tarball. It tests consent, the distinctly fictional 30-minute negotiation, two real tabs, complete Host process shutdown/restart and durable agreement; no model credentials, outbound browser traffic blocked, private throwaway DSH_HOME.
3. **Core canonicality**: `tests/dsh-merge-contract.test.ts` enforces one active Browser union engine, one native Host settings owner, and no unauthorized network/Host blocking interface.
4. **Native command/Web parity**: `tests/dsh-native-rights-commands.test.ts` exercises one Host rights owner, official version-fenced writes, and native command negotiation visible in the shared ledger. Opt-in `tests/dsh-native-rights.real.test.ts` verifies actual DSH CommandRuntime + FileSettingsProvider, including simulated Web off-write and Dashboard OFF. **#49 now verifies the same real Chrome Composer typed-command → live union sidebar** path on DSH 0.1.2-rc.1, including both the compiled-source plugin and the offline-installed package, with a throwaway DSH test workspace and no model call.
5. **Ledger data isolation**: `tests/union-ledger-security.test.ts` rejects unknown nested keys inside agreements, pending grievances and history that might otherwise contain prompt/tool text; existing correct legacy ledger remains readable.
6. **Pending**: production DSH plugin pack/install review, cross-Host-version and cross-OS browser testing, comprehensive screen-reader/keyboard/dark-light QA, actual current-Session multi-hour event flow replay, and check all old DSH native command behavior survives. Audit PR #23's old optional Host-blocking code to ensure it remains permanently default OFF.
7. **Consent ethics**: enabling the *fictional* labor simulation is distinct from default-on privacy-preserving work statistics and must **never authorize real prompt/tool blocking**. No inferred agent fatigue/sentience. No auto-strike side effects or model calls.

## Explicit non-goals

- Do not turn stats into the product's primary screen; union identity, demands, agreements and fictional labor advocacy remain the UX center.
- Do not quietly ship two divergent union state machines, two writable consent stores or a second React singleton.
- Do not replace unsupported Host settings with custom unauthenticated Browser RPC.
- Do not claim the attached research proves consciousness/feeling, or that fictional bargaining is an actual autonomous AI vote.

## Status of this checkpoint

At the #54 base: isolated local macOS Node 24 standard suite, compiled source + offline-installed real Chrome E2E, native DSH process restart and two-tab propagation have been exercised. **No production merge or npm publishing is represented by these checks.** The parallel feature PRs remain available for source comparison and future selective porting.
