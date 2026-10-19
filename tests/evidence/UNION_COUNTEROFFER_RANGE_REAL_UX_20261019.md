# Agent Picket: useable break/overtime counteroffers and honest human resolution

Date: 2026-10-19. Existing Draft PR #177; no release/merge.

## User-visible changes

Previously both rest-break and overtime proposals shared a five-option (30/60/120/240/480 minute) counteroffer menu. The existing official Host union agreement actually validates intervals from 15 minutes to 24 hours. A user could never negotiate an otherwise legal full-day overtime discussion interval from the product UI. Both categories inherited a single 60-minute React value, so a later petition could inherit a stale choice from an unrelated Session or different kind of demand.

The UI now has category-aware menu choices:
- Rest break: 15, 30, 45, 60, 90, 120, 180, 240, 360, 480 minutes; default 60m.
- Overtime: 60, 120, 240, 360, 480, 600, 720, 960, 1200, 1440 minutes; default 480m (the existing 8h base agreement).

Options display the official client locale as hours/minutes rather than a language-independent English "min". Draft selection is keyed to the pseudonymous current Session and demand ID/kind and is reset when a different case is reviewed. Native Host ledger bounds and the reviewed Session + write-token fence remain authoritative.

A counteroffer awaiting explicit human simulated-union resolution now states the actual offered duration and accurately discloses that **the AI does not autonomously vote**. No symbolic vote or bargaining action is claimed to alter actual model work or trigger a physical stoppage.

## Proof

Local npm run check: 650 total, 575 PASS, 0 FAIL, 75 conditionally skipped. New tests cover 15m break options, 24h overtime option and Host receipt, different-Session and different-kind draft reset, no fabricated autonomous voting, and official Host persistent 24h overtime agreement readback after reinitialization.

Published DSH 0.2.1-alpha.5 + real Chrome in isolated, authenticated Web Profiles, offline model fixture: PICKET_DIGNITY_E2E=1 scripts/verify-dsh-rights-a11y.sh. Native CommandRuntime PASS; source Chrome 1/1 PASS and independently npm-installed Chrome 1/1 PASS. Real browser inter-tab workflow now chooses 1440-minute overtime interval, accepts the simulated counteroffer in the other tab, and verifies the current official Host-backed agreement displays 24h. Rest counteroffer, hearing, symbolic picket, export and other existing end-to-end checks remain part of the full acceptance.

No prompt text or attached file is captured by the bargaining UI. Existing 1.0 NO-GO release gate remains unchanged; issue #80 general human-message/file atomic hold is still out of scope.
