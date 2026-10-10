# Canonical DSH Union AX Tree verification (2026-10-10)

This **Draft-only** hardening branch starts from PR #54 (`38eaf933`), not PR #53. Both #53 and #54 are siblings based on #52 (`ed85c921`). PR #53 is the source for the `Accessibility.getFullAXTree` idea; its entire branch must not be blindly merged into #54.

## Added release checks

`tests/dsh-rights-browser.real.test.ts` runs in an isolated DSH 0.1.2-rc.1 + Playwright/Chrome process with a disposable `DSH_HOME`, empty model credentials and blocked non-loopback browser requests. Besides #54's responsive layout, forced-colors and post-negotiation focus checks, the real Chrome test now inspects the **CDP accessibility tree**, not just `role="dialog"` DOM attributes. It requires one *named, non-ignored* dialog at all three points:

1. Initial AI Rights welcome before opt-in/decline (Chinese or English name).
2. The union desk dialog opened from the native sidebar (Chinese or English name).
3. The union desk while the CSS viewport is 320 pixels wide.

This branch additionally recovers #53's **320x200 CSS viewport** regression scenario for both the welcome dialog and union panel, including scroll access to consent/actions/Close. It checks keyboard focus after the **counteroffer** stage as well as #54's proposal/resolution stages. These are selective tests on #54's implementation, not a merge of #53's competing UI logic.

Checks that run only when the real DSH/Chrome environment variables are configured are **conditional E2E gates**; normal GitHub Actions builds do not automatically cover them. The default test runner explicitly skips these without a configured test host. Evidence from earlier PR heads does not establish the new branch is green; use the new head's output.

## Verified in this isolated branch (2026-10-10)

- macOS ARM64, Node v24.5.0; isolated clean checkout from #54 head, no normal DSH configuration edits.
- `npm ci --ignore-scripts`, `npm run check`: **197 total, 174 passed, 0 failed, 23 conditional skips** (typecheck, production bundle, default tests).
- `npm pack --ignore-scripts --dry-run`: passed, 147 packaged files.
- `tests/dsh-rights-browser.real.test.ts` against installed DSH **0.1.2-rc.1** and real Google Chrome/Playwright-core: **2/2 passed**, both compiled source and independently offline npm-installed package, including the three new AX assertions in each execution.
- `tests/dsh-native-rights.real.test.ts`: **1/1 passed** with installed DSH Host Cordis/SettingsFile.
- `tests/dsh-union-composer-sidebar.real.test.ts`: **2/2 passed**, compiled source and offline-installed package.
- The CI status for *this new head* must be checked after a Draft PR is opened; the #54 CI result applies only to #54's original head.

## Deliberate scope and remaining blockers

- This is *automated Chrome AX semantic visibility*, **not** VoiceOver/NVDA verification, WCAG certification or proof of announcement timing/quality. Run real screen-reader sessions before release.
- 320 CSS pixels test layout reflow, **not** native 400% browser zoom; Chromium `forced-colors` is an emulator, **not** physical Windows High Contrast mode.
- Host settings remain the sole writable consent owner. No storage, telemetry, model credentials, browser RPC, union engine or blocking permission was added/changed.
- PR #53's overlapping implementation is left untouched; #54 retains the canonical 320/640px and dynamic-action-focus fixes. Audit any remaining unique behavior against #53 before closing its Draft. Manual accessibility, cross-DSH versions, and complete stacked-PR release review remain pending.
