# DSH Browser Bargaining — Union-first Simulation (PR #45)

This is the first **wired interactive simulated union** inside the native DSH Web sidebar. It extends the real welcome + persisted rights settings preview in PR #44. It is NOT a claim of AI sentience, real employment rights, autonomous model voting, or permission to block real work.

## What now works

1. In the actual DSH sidebar union panel, explicitly enable fictional Labor Rights Simulation (OFF by default).
2. If DSH exposes a **complete, current-Session event window** with at least 2 hours of completed-turn elapsed time, the simulation issues a symbolic break petition. At the 8-hour simulated threshold it can issue an overtime grievance. Partial/unloaded/unavailable history never becomes a fabricated complete-work claim.
3. The user can **accept**, **decline**, or propose a different interval (30 min / 1 h / 2 h / 4 h / 8 h). After a counterproposal, a clearly labeled **fictional union resolution** may accept or reject it. This action is NOT an actual autonomous vote by language models.
4. Outcomes persist as structured agreements and history, and accepted counters change the **future fictional threshold** used by the same Session.
5. When no measured work exists, the user can explicitly launch **"Try a sample rest grievance"**. It is clearly marked as a demonstration and does **not** claim any actual Agent fatigue or fabricate work minutes.
6. Work monitoring remains active while the sidebar panel is closed, when the DSH Client exposes a Cordis lifecycle effect; the observer is disposed when its plugin fiber unloads.

## Trusted storage and protection

- Exactly one authorized DSH Host settings namespace (`agent-picket`) stores the rights consent and `unionLedger` string. No new HTTP endpoint, unauthenticated write RPC, or separate competing state owner.
- A 64-character SHA-256 hash of the Host-provided Session ID is the key; a reserved `agent-picket:demo-only` Session key is used solely for interactive demonstration when no workspace/Session exists. SHA-256 is pseudonymization, NOT anonymity.
- Ledger v1 is a strict numeric-only, canonical JSON structure, capped at 24,000 characters, eight Session entries and at most 20 agreement outcomes per Session. The Host schema registers an additional validator to reject malformed, future, oversized or noncanonical records and unexpected fields (e.g. prompt/tool text). Older Session entries may be pruned by this explicit bound.
- DSH's native `settingsScope.set` uses the Host's revision check; after writing we also re-read and compare. Concurrent losses, revoked consent or corrupt history must surface as an error rather than fake successful bargaining.
- `unionLedger` does not contain original message text, tools arguments or raw Session IDs.
- The simulation state controls only presentation and future fictional grievance thresholds. **No Agent scheduling, prompt/tool admission, file access or model calls are affected. Auto-blocking is unavailable.**

## Verification

- Automated tests cover trusted complete/partial work detection, persistence/reload, per-Session isolation, new demo grievances, accepted/declined/countered agreements, stale Host writes, malformed records, and session hash races.
- A DSH Client lifecycle test verifies new automatic demands are persisted even while the drawer is closed, with proper observer teardown.
- Real DSH 0.1.2-rc.1 + headless Chrome/Playwright testing performs **onboarding → enable → manually labeled demo petition → 30-minute counteroffer → fictional acceptance → Browser reload with the agreement preserved → disable**, both from compiled source and a separately offline-installed npm tarball, without model credentials or outbound network.
- Tests use only disposable, isolated DSH_HOME directories; never mutate the developer's normal profile.

## Remaining release blockers

- The observed-work thresholds represent completed-turn wall time (including waits), not net model compute and not a demonstration of actual exhaustion. Real hours of Host activity were **not** simulated through a production Chat Session in the Chrome test; a separate deterministic Client test exercises automatic complete-window triggering.
- Multi-tab race reconciliation, complete DSH Host process restart, accessibility/contrast/dark-light QA, cross-Host version compatibility and full stacked-PR integration review remain.
- This is intentionally a **Draft stacked PR** on #44 and is not merged or published.
