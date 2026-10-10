# DSH 0.1.7 Composer, session and real Host CAS validation

Status: experimental follow-up on Draft PR #58; **not approved for release or merge**. Tested 2026-10-10 with DSH 0.1.7-rc.2, Mac Node 24.5.0, local headless Chrome, disposable `DSH_HOME`, official local tarball installation (`dsh plugin --profile web add`). No model credentials or third-party network requests, no real task blocking and no modifications to a normal user profile.

## Verified root cause: new DSH session identity

DSH 0.1.2 exposed the active Session as `ctx.sessions.list.getSnapshot().current`. DSH 0.1.7's official UI finds the current main Session in `byId` by its `retainedBy.mainView > 0` (confirmed directly in installed UI workspace, layout and session packages). Prior to this fix, the typed Composer `/union` command wrote a fictional negotiation to the real Host Session hash while the React sidebar subscribed to `agent-picket:demo-only`; therefore the command result and sidebar could disagree.

`currentDshUnionSession()` preserves the legacy `current` behavior, and on new DSH resolves the **single** session with valid positive main-view retention. Zero or multiple candidates return `undefined`, so no unrelated Session can be accidentally credited with another's fictional grievance. The fallback demo key remains used only when the Host has no selected Session. Separate unit tests check legacy behavior, unique new Session, missing Session and ambiguous/tampered retention.

## Real Composer-to-React parity

The typed Composer `/union` flow was directly exercised in **real Chrome against an officially packed/installed DSH 0.1.7 plugin**. The existing test, `tests/dsh-union-composer-sidebar.real.test.ts`, invokes 24 actual commands (no synthetic command dispatch), covering opt-in/off, petition, counteroffer, resolution, Host state and sidebar agreement parity, language persistence through page reload, status/stats/safety commands, and malformed inputs. Real `POST /api/commands/execute` traffic and Host results were observed during private diagnostic runs. **Final clean source E2E passed 1/1 without injected diagnostic delays or console tracing.**

The earlier timeout waiting for the command response was intermittent fixture timing; response transport was never actually removed by DSH 0.1.7. Existing test already permits both slash and dot forms but final observed transport was `/api/commands/execute`. No response was retried, replayed or simulated to force success.

## Real Web, full restart, multi-tab and native Host write validation

The existing official-install DSH 0.1.7 browser E2E was re-run with the new session resolver, **1/1 PASS**, including consent, Client/UI reflow/AX checks, fictional bargaining, second-tab Host mirror agreement updates and a **full DSH Host process restart** with fresh login token/cookie. A blank retained Session now correctly displays `0 小时 0 分钟` rather than claiming no Session is loaded; the test allows only zero or unavailable, never fabricates positive work hours.

Additional version-gated **real Host** verification in the same browser E2E tests the actual authenticated `/api/settings/describe` and `/api/settings/mutate` API, not mock settings or exported JSON Schema:

1. Read `agent-picket` namespace and current revision after verified consent.
2. Make a legitimate, harmless `commandLocale` change with the current revision; verify Host accepts it and **advances** the revision. A write of the same value is not a useful stale-CAS control because a no-op may not increase revision.
3. Attempt a malformed `unionLedger` carrying an extra `prompt` field: **Host refuses** the write.
4. Attempt to turn consent OFF using the **old revision**: **Host refuses** the stale write.
5. Describe again: consent, ledger and revision are unchanged by either rejected operation. Restore the original `commandLocale` through an authorized, revision-fenced Host write and verify restoration.

This is a **test-only** call to official authenticated Host endpoints in a throwaway profile, **not a new production RPC, permissions escape, or settings writer**. The production Client remains constrained to its existing single Host namespace, official mirror and authenticated revision-fenced settings transport. No sensitive settings contents or login tokens are logged.

Legacy DSH 0.1.2-rc.1 real integration suite remains **5/5 PASS** (native SettingsFile + commands, browser source/offline-installed package, Composer source/offline-installed). Normal typecheck/build/test **214 tests / 191 pass / 0 fail / 23 conditional skips** on this branch, subject to final-head CI confirmation.

## Still blocking a merge or published release

- Human VoiceOver/NVDA screen reader coverage, native browser zoom at 200%/400%, actual OS-level high contrast, keyboard/small viewport manual usability, accessibility audit
- Multi-OS, multi-version real runtime qualification including future DSH API updates
- Full stacked Draft PR security/privacy/code review, canonical sibling #53/#54 merge strategy, explicit project release approval
- Deliberate pre-release package root import behavior change from `agent-picket/core` to `agent-picket` Host entry must be audited and documented

No npm publish, default-on behavior, real Agent task blocking, hidden telemetry, raw transcript storage, or merge to main occurred.
