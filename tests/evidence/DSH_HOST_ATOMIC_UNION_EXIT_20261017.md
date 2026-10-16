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
