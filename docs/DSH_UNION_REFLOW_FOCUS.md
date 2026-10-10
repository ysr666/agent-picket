# Union release QA: high zoom reflow, forced-colors and dynamic keyboard focus (PR #53)

**Scope:** Follow-up to #52's keyboard modal, light/dark contrast and screen width work. No new Host settings authority, automatic blocking, model decision-making or bargaining algorithm. Fictional union demands remain clearly distinguished from observed work.

## Changes

1. **320 CSS-pixel reflow equivalent:** Fixes the modal's content-box width (`min(96vw,800px)` plus border and padding) that could overflow the viewport during 400% zoom. Uses `box-sizing:border-box`, `width:min(100%,800px)`, adaptive overlay padding, maximum vertical height and internal scrolling. Cards use `min-width:0` and `overflow-wrap:anywhere`. The onboarding welcome dialog also caps height and allows vertical scrolling.
2. **Windows forced-colors:** Ensures primary actions have a real 1px border when the OS applies high-contrast colors. No `forced-color-adjust:none` is introduced; the system remains free to substitute its own accessible foreground/background palette.
3. **Dynamic negotiation focus:** A successful user bargaining action may remove the button that held keyboard focus when a demand changes stage or resolves. The union negotiation heading is now a stable, programmatically focusable (`tabIndex=-1`) recovery target. A React effect restores focus **only after a successful local bargaining action**, **only when the same modal is still open**, and **only when the active element has fallen outside the modal**. Passive cross-tab changes do not steal focus.
4. **Announcement semantics:** Pending fictional demand text now uses a targeted `aria-live=polite` and `aria-atomic=true` announcement. The entire bargaining form is not made live, preventing unnecessary screen-reader verbosity.

## Real DSH/Chrome checks (2026-10-10)

`tests/dsh-rights-browser.real.test.ts` now verifies, for the independently compiled source and privately offline npm-installed plugin:

- **640px and 320px CSS viewports:** the union dialog and close control stay on-screen; there is no horizontal overflow within the dialog's scroll region. This models WCAG 1.4.10's 200% and 400% desktop reflow CSS widths without claiming to fully emulate every browser zoom behavior.
- **Forced-colors: active:** Chrome's emulated OS high-contrast mode is active, the system color adjustment stays enabled, and the primary button has a discernible border.
- **Real focus recovery:** after a demo petition replaces its launcher and after simulated negotiation acceptance removes the response buttons, focus remains on a stable union heading rather than falling to the document body.
- Existing modal focus trap, Escape, dark/light computed contrast and 390px narrow screen assertions, plus full Host restart and cross-tab bargaining, continue to pass.

Two new always-on Node UI contract tests check the accessible dynamic demand, stable focus heading, and border-box scrolling. Standard isolated Node test run: **197 total, 174 pass, 0 fail, 23 conditional real-Host skips**.

## Nonclaims / release gates

This is **not** full WCAG certification. Screen-reader testing with real VoiceOver and NVDA, actual OS forced-color palette review, 200–400% zoom in real browsers beyond CSS viewport equivalence, high-density mobile layouts, broader DSH version compatibility and canonical stacked merge review remain pending. No test uses real model credentials, transmitted conversation text or production DSH files.

This is an unmerged, unpublished Draft branch on #52.
