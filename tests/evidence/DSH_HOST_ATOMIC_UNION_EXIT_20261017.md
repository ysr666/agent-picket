# Official DSH Host atomic Union exit and Goal consent revocation

2026-10-17 · Agent Picket Draft PR #177 · 1.0 release NO-GO

## Safety gap and fix

The old client rights choice flow revoked real Goal consent first and left the Union second, even where modern official DSH SettingsScope supported a single authenticated revision-fenced batch. Its final readback checked only Union membership, while the derived UI snapshot hides underlying Goal grants whenever membership is OFF. A competing or broken writer could leave an unobserved authorized-v1 value, later reactivated by a normal Union rejoin.

The repair is entirely within the existing official DSH settings API. On modern Hosts with setMany, Union opt-out and real Goal grant revocation now commit together in exactly one settings.mutate CAS operation: welcomeDecision=not-now and realGoalStrikeConsent=off. Both raw Host values are checked after the write, not only the derived UI state.

For legacy single-field Hosts, the plugin revokes Goal consent FIRST, reads it back OFF, then leaves the Union, and requires a final Host readback of both fields. A stale OFF-union / ON-Goal record cannot be silently reactivated by an ordinary Union rejoin; it is cleared first. Only the separately disclosed versioned chooseFirstRun goal-safe-boundary-v1 route can issue a new real Goal consent.

## Evidence

- Full Mac npm run check: 609 tests, 535 pass, 0 fail, 74 conditional skips.
- Four new positive/negative settings-scope proofs: one-CAS revocation, stale-Grant rejoin, legacy revoke-first, dishonest modern receipt and competing legacy writer. The official remote.settings.mutate fixture also checks revocation increments exactly one revision and requires both values.
- Genuine published DSH 0.2.1-alpha.4 installed Host with Chrome and OFFLINE installed Picket UI/consent regression: 1/1 PASS.
- Genuine Windows Desktop 0.2.0-rc.2 official .tgz installed Picket with the new code. Verified cross-Mac/Windows artifact SHA-256: 97536021d315c9dd39b6248f42f92d1d744dd6f0b5857d97cc227c0a8ce19aaa. Native install, activation, join, HQ, dignity hearing, bargaining, exit, and official Desktop process cold-restart still showing exited membership: 1/1 PASS. Isolated Host and Electron user-data directories; real Goal physical preview OFF; no account/model/tool requests.
- npm package is 242,328 bytes / 113 files; release gate remains NO-GO.

## Limitations

The real Windows Desktop test did not receive an authorized-v1 physical Goal token because that Host capability was not offered in the isolated run. It proves membership exit persisted, not independently a Windows physical Goal token revocation under a live multi-owner race. The Host authenticated CAS negative/positive tests and published alpha.4 Chrome checks support the narrower write protocol guarantee. Human ordinary text/image/file lossless pre-submit hold (#80), full Desktop Host × OS matrix (#117) and Codex multi-process Goal ownership (#169) remain release blockers. No main merge, tag or publish, and no general-message refusal enabled.


## Follow-up: real issued Goal grant revoked by browser click (2026-10-18)

The PICKET_GOAL_EXIT_E2E=1 extension to the existing **real official DSH Web + Chrome** first-run test proves a stronger boundary than the prior isolated Windows Desktop "not offered" case:

1. The **actual informed first-run UI click** issues and persists realGoalStrikeConsent=authorized-v1 with welcomeDecision=enabled via the official Host namespace.
2. The user opens the real Union HQ's cause room and clicks **Leave the union**, not a direct test API mutation. The authenticated official settings/describe readback reports realGoalStrikeConsent=off and welcomeDecision=not-now in exactly **one** Host CAS revision.
3. After terminating and cold-restarting the **entire disposable official DSH Web Host process** with the exact same isolated DSH_HOME, both settings remain off/not-now.
4. A normal **Join the AI union** UI click restores welcomeDecision=enabled but must leave the real Goal strike grant **off**, without replaying the informed first-run consent dialog.

The test uses a locally npm-packed Agent Picket archive installed through the official DSH plugin manager, plus a separately installed offline fixture. No user profile, credentials, online model or live user prompt is involved. Its Host readbacks, revision and cold-start are not inferred from displayed UI state. The existing Web Goal recovery E2E remains intact (authorized synthetic prior work, native Goal block, cold restart human file SHA-256 proof and two-tab resume).

- Actual published **DSH 0.2.1-alpha.5 + macOS Chrome** with all Goal/restart/file/race options AND new physical-grant exit option: **1/1 PASS**, including REAL_HOST_ATOMIC_UNION_EXIT and REAL_HOST_REVOKED_GOAL_COLD_REJOIN.
- Actual published **DSH 0.2.1-alpha.4 + macOS Chrome** with new exit/rejoin option: **1/1 PASS**.
- Actual published **DSH 0.2.1-alpha.3 + macOS Chrome** with new exit/rejoin option: **1/1 PASS**.
- Actual published **DSH 0.2.0-rc.2 + macOS Chrome** with new exit/rejoin option: **1/1 PASS**.
- Mac TypeScript/build/unit npm run check: **610 tests / 536 PASS / 0 FAIL / 74 conditional SKIP**, package dry-run **242,327 bytes / 113 entries**.
- Existing GitHub CI on safety-fix SHA fcabbab was **7/7 SUCCESS**; any later commit that enables this browser regression requires its **own exact-SHA CI verification**.

PICKET_GOAL_EXIT_E2E=1 is enabled in the two **existing**, not duplicated, GitHub official Web E2E workflows. This proves the observed Web official Host versions; **Windows Desktop's live issued token revocation and the release-wide Host/OS matrix are still not attested**. No ordinary human pre-submit atomic hold (#80), Codex cross-process exclusive Goal ownership (#169), or general real strikes are claimed. Release remains **NO-GO**.
