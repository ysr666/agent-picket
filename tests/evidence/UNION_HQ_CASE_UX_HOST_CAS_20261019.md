# Agent Picket 1.0 — Union HQ case UX / Host case CAS regression

Date: 2026-10-19. Original Draft PR #177 remains open. This covers user-led simulated union committee cases, not misconduct adjudication or a general Host strike.

## Fixed

1. Without Host case storage, the Dignity appeal had only changed the selected unsent public campaign draft while leaving its Cause room hidden. The official Union navigation now actually opens the Cause room and focuses its accessible heading after navigation, without submitting or copying a Host message.
2. Navigating away from an in-progress hearing did not disarm the pending irreversible closure confirmation; returning might still show the old confirm. Room navigation now clears this state alongside retract/erase confirmations.
3. The official Host-backed case ledger already required the exact write token for retraction, but not for the similarly irreversible closure. Both now require exact current Session plus previously reviewed ledger write token; for older tokenless ledgers the Host revision is additionally required. Replaced same-number cases cannot be closed with an old approval.

## Test evidence

- npm run check: 634 total, 559 passed, 0 failed, 75 conditional skips.
- Unit tests verify appeal navigation into visible unsent draft without Host write; leaving a hearing disarms closure; after another client retracts/re-files an identically numbered case, a stale first-client closure makes zero Host writes; fresh token closure succeeds.
- Official published DSH 0.2.1-alpha.5 + real Chrome isolated Web Profile + test-only offline LLM, via PICKET_DIGNITY_E2E=1 bash scripts/verify-dsh-rights-a11y.sh: CommandRuntime PASS, source real browser PASS, npm-installed real browser PASS; 2/2 browser cases. The browser exercises filing, hearing, cancel, leaving and re-entering the room, actual closure, Host readback and case exports/erasure.
- The real CommandRuntime acceptance assertion was updated to accept the already-current wording "no symbolic placard"; it still refuses false physical-stop claims.
- No production profile, ordinary-message Host interception, external API model request, new adapter, PR merge, tag or npm publish was involved. Issue #80 and 1.0 NO-GO remain independent.
