# Agent Picket — Release readiness and manual accessibility gate

**Review date: 2026-10-10. Status: NO-GO / experimental stacked Draft.** Evidence is anchored to [PR #59](https://github.com/ysr666/agent-picket/pull/59) and a subsequent unreleased candidate. Do **not** claim npm availability, installed release, WCAG certification, or permission to merge. No real prompt/tool admission may be vetoed by this plugin; symbolic union, strikes, grievances and agreements are simulations, not evidence that any AI has consciousness or legal personhood.

## Canonical ancestry and branch decision

- PRs **#53 and #54 are siblings** based on #52, not successive increments. Their GitHub heads are divergent; **do not merge both as a linear chain**.
- **#54 is the canonical source** for adaptive styles, forced-color borders and conditional focus recovery. Its focus recovery only occurs when focus genuinely escapes the open dialog; this is deliberately safer than an unconditional focus move after a negotiation event.
- **#55 carries selective #53-inspired browser tests**: real Chrome CDP accessibility tree, welcome/dialog labels, 320×200 CSS reflow and dynamic-action keyboard focus. Tests are *not* user screen-reader reports.
- Current intended parent chain: **#52 → #54 → #55 → #56 → #57 → #58 → #59 → this release-gate Draft**. None of those PRs should be described as merged merely because a descendant passes CI.
- **#57/#58/#59 remain DSH 0.1.7 support experiments until this entire chain is audited**, particularly the package root export change from host-neutral Core to DSH plugin; consumers must switch to `agent-picket/core` for the pure library.

## Verified automated evidence (and its limits)

| Gate | DSH 0.1.2-rc.1 | DSH 0.1.7-rc.2 | What it does NOT prove |
|---|---|---|---|
| Official authenticated consent, version-fenced readback, no blocking | Real Chrome + native Host | Real Chrome + official Bundle | Real human review of disclosures |
| User-typed `/union` → Host → shared negotiation sidebar | Real Chrome, compiled + offline package | Real Chrome, compiled + official installed package | Other Host releases/platforms |
| Real restart, tab mirror and bounded structured ledger | Real Chrome | Real Chrome, real Host malformed-ledger/stale-revision rejection | Power-loss/multihost filesystem behavior |
| Chrome AX tree, 320×200 CSS reflow, forced-color emulation | Automated | Automated | VoiceOver, NVDA, native browser zoom or OS High Contrast |
| Lightweight CI | Ubuntu Node 22.19/24, macOS Node 24 | Same source CI only | Live DSH E2E in shared CI |

The latest predecessor PR #59 CI succeeded 3/3. This release-gate candidate adds: **one shared active Session predicate for auto-invitation in both DSH versions**, and fail-closed handling of malformed or duplicate Host namespace revisions. These changes are covered by independent always-on tests and **must be rerun** with the same isolated real DSH scenarios on the candidate head.

The 23 default conditionally skipped tests are **not passed real-runtime tests**. Every release report must show total, passed, failed and skipped counts separately.

## Mandatory human accessibility protocol — NOT YET COMPLETED

The following are concrete manual sign-off tasks, not claims of results:

1. **macOS VoiceOver, Safari and Chrome.** With a clean test profile, use keyboard only; ensure the first opt-in dialog is announced by *name*, its simulation disclaimer is discoverable, and `Enable Simulation`/`Not Now` have discernible labels. Move focus by Tab and Shift+Tab, use Escape where supported, and confirm focus returns to its launcher.
2. **Windows NVDA with Chrome/Edge.** Repeat the true opt-in, negotiated grievance, counteroffer and resolution flows. Check polite announcement of a new grievance and the focus change to the stable dialog heading. Check the Host write-rejection alert, modal background inertness, and that no notification hijacks an unrelated screen-reader cursor.
3. **Native zoom.** In real browser settings, apply **200% and 400%** (not just Playwright CSS viewport or device pixel ratio), at desktop widths. Confirm no horizontal scrolling is needed to reach consent, Close, actions or select options; ensure both scroll regions and keyboard controls remain usable.
4. **Real Windows High Contrast / forced-color OS setting.** Verify system text, borders and focus indication, on disabled/enabled/pending states, under both high-contrast themes. Automated `forced-colors` CSS emulation does not substitute.
5. **Reduced motion, localization and error states.** Review actual Chinese/English captions (no misleading personhood assertion), keyboard feedback for a rejected Host revision, zoomed overflow, and disconnected/readonly Host fallback; close the dialog and verify full background interaction resumes.
6. **Sidebar-invited first-install focus return.** After an explicit Enable or Not Now selection, confirm that the persistent sidebar launcher regains focus only after Host root inertness is released. If DSH owns a prior modal (root already inert), the plugin must not steal focus. The official settings.onboarding Slot retains its own Host-managed focus lifecycle.

For each sign-off store tester/OS/browser/Host build, scenario, PASS/FAIL, defect link, and screenshots/video if permitted. Never capture auth cookies, prompts, tool payloads or raw Session identifiers.

## Hard security and privacy release gates

- Only **Host-owned settings** authoritatively enable symbolic labor rights; the default is OFF. Browser reads/writes use official authenticated DSH services; no alternative local/remote consent database, custom write RPC, or optimistic enabled state is allowed.
- A Host ledger must be canonical, bounded and structured: no prompt, attachment, raw Session ID, tool args, freeform transcript or arbitrary future fields. Revision CAS must reject stale or malformed writes *in the actual Host*, not merely in mocks.
- Missing/duplicate settings namespaces, invalid revisions, ambiguous selected sessions, and untrusted Host state must fail closed. No global cross-Session grievance or fabricated work time.
- Real Agent tasks must continue uninterrupted under all simulated strike and negotiation states. It is never acceptable to silently discard user prompts or attachments to make a fictional strike feel effective.
- Verify npm pack allowlist and dependency lock, retained `private: true`, read-only telemetry policy and absence of lifecycle install/publish scripts. A valid tarball is **not** an authorization to publish.

## Remaining NO-GO items

Human accessibility sign-off, full canonical parent diff/security audit, end-user consent wording, cross-platform Host/Client testing, root export migration audit, and explicit maintainer merge+release approval. Keep all PRs Draft, no npm publish, no default-on labor simulation, and no real task blocking.

**Evidence anchors:** `docs/DSH_UNION_AX_TREE_REVIEW.md`, `docs/DSH_017_OFFICIAL_CLIENT_WEB_VALIDATION.md`, `docs/DSH_017_COMPOSER_HOST_CAS_VALIDATION.md`, `docs/CI_AND_RELEASE_GATE.zh.md`.

## Welcome keyboard-focus hardening (candidate child of #60)

A review found the sidebar-owned Welcome modal already trapped focus and released Host inertness after consent, but did not explicitly restore focus to the persistent Union launcher when its two action buttons were removed. The candidate adds an optional sidebar-only restoreFocus callback and keeps it in a ref, so React rerenders changing callback identity cannot trigger unintended cleanup. It runs only after restoring the previous Host inert state and never when the Host was already inert.

Added automated coverage: two lifecycle unit tests for inert cleanup/focus ownership; and a real isolated DSH Chrome assertion that the background returns to interactive after Not Now. Human VoiceOver/NVDA, native zoom and OS High Contrast remain mandatory NO-GO gates.

## Candidate Host receipt lifecycle gate (after #61; 2026-10-10)

The DSH 0.1.7 Host settings adapter now validates the full mutation receipt **before** publishing it to the official shared mirror and rejects a late result after disconnect, scope teardown, or a newer revision from another tab. New fault-injection tests cover forged success, stale same-revision change, interrupted connectivity, cross-tab supersession, disposal, and valid no-op. See [DSH_017_HOST_RECEIPT_LIFECYCLE_GATE.md](DSH_017_HOST_RECEIPT_LIFECYCLE_GATE.md). This is not proof the real Host ever emits malformed receipts.

**Known open blocker:** [Issue #62](https://github.com/ysr666/agent-picket/issues/62), intermittent *first typed* DSH 0.1.7 Composer command-response timeout. One fresh isolated E2E failed and two separately installed E2Es passed on the candidate. **Do not describe typed Composer 0.1.7 as reliably green until it is root-caused and repeated qualification passes.** Legacy DSH 0.1.2 5/5 and newer real Web/Host CAS 1/1 passed independently. Human accessibility and parent-stack merge review remain separate NO-GO gates.
