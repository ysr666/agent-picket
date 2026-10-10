# Agent Picket — Release readiness and manual accessibility gate

> **2026-10-11 当前状态提示：** 本文记录各阶段原始发布门槛与历史测试，不是当前 GitHub PR 状态。#23–#70 既定主线和 #40 宣言已并入 `main`；最终源码树的常规检查为 **228 项 / 204 PASS / 0 FAIL / 24 条件 SKIP**，包仍为 `private: true`、无公开 npm 发行。**真人无障碍 A1–A8 仍 PENDING，因此总体发布状态仍 NO-GO。** 参阅[当前研发状态](STATUS.zh.md)和[人工验收单](HUMAN_ACCESSIBILITY_SIGNOFF.zh.md)。


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

## DSH 0.1.7 Composer menu claim investigation after PR #63

The official slash-menu *keyboard Enter* can visibly dismiss a suggestion but leave Lexical `data-phase=plain`, prior to any Host command request. See [DSH_017_COMPOSER_CLAIM_READINESS.md](DSH_017_COMPOSER_CLAIM_READINESS.md). The separate typed Composer→Host→sidebar contract now selects the **visible official command suggestion by a real UI click**, waits for the actual `claimed` phase and then submits **once** by Enter. Four completely independent DSH 0.1.7 installed profiles all passed that full test; legacy DSH 0.1.2 remained 5/5. This does **not** qualify Enter-only keyboard menu selection: [Issue #62](https://github.com/ysr666/agent-picket/issues/62) remains OPEN and explicitly blocks accessibility release sign-off.

## Dedicated upstream DSH keyboard Enter release gate (after Draft #64)

There is now a **separate opt-in keyboard-only** Chrome test in `tests/dsh-union-composer-sidebar.real.test.ts`, activated only with `PICKET_RUN_DSH_KEYBOARD_E2E=1`. Unlike the normal pointer-picked native-command integration, this test waits for a real visible `role=option` row, uses ArrowDown to highlight `/union` and uses Enter to select it. It then demands the official Lexical `data-phase=claimed` before attempting any command submission. A missing claim **fails immediately** with bounded phase/focus/menu metadata; no injected Host RPC, background replay or fixed sleep.

The repeated independent DSH 0.1.7 run showed **2/3 pass and 1/3 pre-RPC `phase=plain` fail** even with the selected option visible, while one later dedicated opt-in test passed 1/1. This is an **unresolved intermittent upstream keyboard-selection defect**, not a stable release qualification. Default lightweight CI skips this real Host/browser-only test and must never count it as passed. See [DSH_017_KEYBOARD_ENTER_UPSTREAM_REPRO.md](DSH_017_KEYBOARD_ENTER_UPSTREAM_REPRO.md) and local [Issue #62](https://github.com/ysr666/agent-picket/issues/62). Manual screen readers and keyboard-only sign-off remain NO-GO.

**Follow-up actual key-by-key typing:** changing the opt-in keyboard E2E from whole-value fill to actual keyboard select-all/Backspace and typed `/union` still failed in an independently installed DSH 0.1.7 profile (0/1). A previously visible menu option was missing at the actual selection check. This is *not* an argument to auto-repeat a user command; Issue #62 stays open. See [DSH_017_KEYBOARD_ENTER_UPSTREAM_REPRO.md](DSH_017_KEYBOARD_ENTER_UPSTREAM_REPRO.md).


### Upstream escalation and keyboard diagnostic nuance

The keyboard-only 0.1.7 report is published at https://github.com/deepseek-ai/deepseek-harness/discussions/9354. Source review of DSH master d7432673 (input-trigger 0.2.1-alpha.2) confirmed a deliberate pending Enter no-op with an upstream test requiring that the menu remain open. Our different menu-closed + plain-phase observation could instead involve settle() closing the menu before a stale span draft-revision guard refuses beginCommand(); this is still a hypothesis. The real keyboard E2E records only safe before/after menu state and remains an explicit release blocker. Do not infer newer DSH runtime behavior from source inspection.

## Current npm DSH 0.2 keyboard-only matrix, independent real Chrome evidence (2026-10-10)

The official npm tags checked on this date were `@deepseek-ai/dsh` `latest`/`next` **0.2.0-rc.2** and `alpha` **0.2.1-alpha.2**. Earlier fully isolated official-installed keyboard-only E2E samples showed **5/5 passed** on 0.2.0 and **3/5 passed, 2/5 failed** on alpha. A separate four-fresh-profile-per-version matrix after correction of unrelated first-install Preview Notice timing demonstrated **0.2.0: 3/4 passed, 1/4 failed** and **0.2.1-alpha: 3/4 passed, 1/4 failed**. Those two new failures were **before keyboard Enter**, when a once-visible native slash suggestion no longer had any role=option candidates at the next selection check. They are not demonstrated Host RPC failures; no command replay or direct command injection occurred. Consequently **Issue #62 remains OPEN for both current tags**. See [DSH_02_RELEASE_KEYBOARD_MATRIX.md](DSH_02_RELEASE_KEYBOARD_MATRIX.md) and the upstream Discussion #9354.

The real Composer E2E can navigate observable DSH first-run/Preview Continue and provider-Skip controls without assuming they exist on every 0.2 profile. The opt-in `scripts/verify-dsh-keyboard-matrix.sh` creates one isolated Profile per attempt, installs the tarball through the official DSH CLI, counts every outcome and **fails the matrix on any test failure**. Default lightweight GitHub CI intentionally skips the separate real DSH browser keyboard release gate. No human VoiceOver/NVDA, native zoom/OS High Contrast sign-off or parent Draft merge review has been claimed. The initial misconfigured matrix failures caused by an obscuring Preview Notice were **not counted** as keyboard failures.


### DSH 0.2 corrected keyboard-ready qualification — evidence correction

A review of upstream `ui-input-trigger/src/client/MenuView.tsx` revealed that the observed zero `role=option` rows can be a **designed pending-refresh rendering**, not proof of a keyboard bug. The prior E2E sometimes checked candidate count immediately after a separate visible-state check, allowing a transient pending state to trigger a false pre-Enter failure. The isolated corrected E2E now waits for the actual ready candidate before ArrowDown/Enter (no click, Host RPC injection or command replay). **DSH 0.2.0-rc.2: two fresh-profile batches 4/4 and 8/8 PASS; DSH 0.2.1-alpha.2: likewise 4/4 and 8/8 PASS**. Older failing samples remain documented, but only represent the earlier test implementation. Do not classify the latest pre-Enter zero-row observation as a confirmed DSH defect.

An earlier after-Enter unclaimed state still merits investigation, especially if it can be reproduced from a confirmed ready/highlighted candidate. A speculative `settle()`→`beginCommand` stale-span interaction is **not an established root cause**. Upstream Discussion #9354 and local Issue #62 must reflect this corrected evidence and human keyboard accessibility certification remains NO-GO. See [DSH_02_MENU_REFRESH_READY_REVIEW.md](DSH_02_MENU_REFRESH_READY_REVIEW.md).

## DSH 0.2 official-install Rights/Chrome AX release gate (2026-10-10)

The legacy `--patch` test could open a sidebar on 0.2 but had no writable official Host consent service, and incorrectly required an unsolicited first-run welcome in a blank Session. The current real browser test uses an explicitly **installed Web Profile** and accepts no-auto-welcome only on verified DSH 0.2 blank Sessions; actual opt-in still happens solely through a visible UI control. In independent fresh DSH_HOME profiles, **0.2.0-rc.2 2/2 PASS and 0.2.1-alpha.2 2/2 PASS**, local source-built candidate and offline-installed package variants, including real Chrome AX/keyboard focus/CSS-reflow/contrast/forced-colors simulation, rights consent/Host CAS, fictional negotiation, reload, tabs and Host restart. DSH 0.1.2 existing `--patch` cases **2/2 PASS**. See [DSH_02_OFFICIAL_RIGHTS_AX_E2E.md](DSH_02_OFFICIAL_RIGHTS_AX_E2E.md). **Human VoiceOver/NVDA, actual OS High Contrast and native browser zoom remain not tested**.

### Package tarball security: source maps excluded, original 250 KB cap retained

The DSH 0.2 rights/AX draft initially tripped the Ubuntu npm package-size test after adding documentation. It was a distributable artifact-size guard, not a browser failure. The candidate now excludes all development `.js.map` and `.d.ts.map` files from the npm tarball (not from local build outputs), retains the existing **250000-byte** cap and asserts **zero `.map` files** in package-contract tests. Local npm pack became **213962 bytes, 109 files, zero maps**; remote CI is authoritative. No runtime JS, `d.ts`, bundle or Core exports were removed.
