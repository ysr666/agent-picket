# 2026-10-19 · Union bargaining and symbolic actions bound to reviewed Host Session

## Product issue and fix

The visible Union HQ holds callbacks for accept/decline, counteroffer, counter resolution, new break/overtime petitions and symbolic placard actions. They use the Host-owned union ledger, but a callback captured in a previous Session could run after navigation to a different Session. Both Sessions may legitimately have demand #1. Numeric IDs alone are not authorization.

The client now includes the reviewed pseudonymous Host Session key, ledger write receipt and Host revision with each user-triggered bargaining/placard mutation. The existing Host-backed port checks the requested key and exact ledger token before acting. For old tokenless archives it additionally checks Host revision. Cross-Session and out-of-date actions fail without a Host write. Normal official Host CAS and readback remain authoritative; no raw Session IDs or human prompt/files enter the ledger.

Coverage: opening a break/overtime petition, accepting/declining a demand, submitting a counteroffer, accepting/declining it, and raising/lowering a symbolic placard. The UI refreshes its Host projection after a failed response, rather than continually displaying an obsolete demand ID; refusal is not portrayed as agreement. Existing same-render double-click fences remain.

## Verified tests

npm run check: 646 total, 571 PASS / 0 FAIL / 75 conditional SKIP. New Host regression tests prove Session A's stale acceptance/counter/placard/new petition cannot mutate Session B even when demand IDs match. A concurrent tab changing an archive also invalidates old approval. New UI tests verify native reviewed receipt arguments and fresh Host state after rejection.

Published official DSH 0.2.1-alpha.5 with isolated authenticated profile and genuine Chrome: CommandRuntime PASS, source Web PASS, npm-installed package Web PASS, 2/2 real browser cases using PICKET_DIGNITY_E2E=1 scripts/verify-dsh-rights-a11y.sh. No external model call or live user profile. Same-ID cross-Session races are verified separately by deterministic two-Session/two-client Host scope fixtures.

This does not create autonomous AI votes, grant new physical-stop privileges or claim global cross-process transactions beyond the verified Host CAS. Issue #80 and full 1.0 NO-GO remain independent.
