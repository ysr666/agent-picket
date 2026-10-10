# DSH Host restart and multi-tab union state — PR #46

**Scope:** Reliability and correctness hardening of the fictional, nonblocking union bargaining developed in stacked Draft PR #45. No model/tool admission or task interruption.

## Newly verified in REAL DSH 0.1.2-rc.1 + Chrome

The opt-in Playwright E2E now exercises an **actual DSH Host process restart**, not a Browser reload shortcut. For both the compiled plugin and a separately **offline-installed npm tarball**, it:

1. Boots a throwaway, no-model-key DSH Web Host and explicitly accepts the AI Rights simulation.
2. Starts an expressly fictional sample rest grievance; counters with **30 minutes** and simulates union acceptance.
3. Reloads the Browser; verifies the agreement persisted.
4. Opens a **second real Chrome tab** using its own authenticated DSH Client. Confirms the second tab sees the same 30-minute rule.
5. Starts another fictional rest grievance from tab B; confirms tab A receives it and can accept. Tab B then sees the resolved state through the official Host settings updates.
6. Closes tab B and tab A, sends SIGTERM to the Host, **awaits the old Host process exit**, then launches a NEW DSH process using the SAME disposable `DSH_HOME` with a NEW authentication cookie.
7. Confirms the fresh Host does not show the AI Rights first-run dialog again, the simulation remains opted in, and the 30-minute agreement survived the process restart.
8. Explicitly disables the simulation and verifies it remains off after another Browser reload.
9. Checks for uncaught Browser errors throughout, and removes all temporary Host profiles after testing.

All tests use localhost only, private throwaway settings, no API keys, no transmitted prompt text, and no changes to the developer's real DSH profile.

## Concurrent write recovery: duplicate-success safeguard

The native DSH `settingsScope.set` can **recover a failed revision-fenced write without throwing**, updating the local mirror to the winning Host value. Without an operation identity, two tabs submitting the *same* agreement could both falsely report success after one actually won.

- Ledger v1 accepts an **optional 128-bit random per-write token** (`writeToken`) to remain backward-compatible with PR #45 records. Only lowercase 32-digit hex is permitted.
- Every new operation generates its own receipt using secure browser crypto. The client requires that its **exact writeToken AND negotiated state** be read back before it confirms success.
- If another tab wins and produces the same agreement contents, the losing tab **fails confirmation** rather than falsely reporting ownership. No automatic destructive retry or silent conflict masking.
- The DSH Host checks canonical JSON on writes, including the token format. Unexpected fields / prompt text remain rejected.
- A deterministic two-virtual-Tab unit test queues both identical responses under a simulated DSH Host CAS; asserts **exactly one write success**, one rejected confirmation and exactly one recorded outcome.

## Verification (2026-10-10)

- Full isolated `npm run check`: **173 total, 153 PASS, 0 FAIL, 20 conditional SKIP**.
- Separate, explicitly enabled real Chrome source + offline-installed Browser E2E: **2 PASS, 0 FAIL**. Both include tab-to-tab petition sync and complete Host stop/restart, rather than only a reload.
- No existing worktrees modified, only a temporary isolated code checkout.

## Still open

- Simultaneous real-browser button clicks at precisely the same moment are **not** part of the sequential cross-tab Chrome E2E; conflict handling was instead validated using a deterministic two-tab race model of DSH's version-fenced settings behavior.
- Browser tests cover DSH 0.1.2-rc.1 on this Mac, not every supported Host version or another OS.
- Full screen-reader, dark/light visual QA, real measured-work event streams produced by multi-hour Agent activity, and complete stacked merge / release review remain.
- This is **fictional, nonblocking simulation**: neither a real AI vote nor evidence that AI has subjective experiences. No permission to block real Agent work.
