# DSH UI release gate: 400%-equivalent reflow, forced colors and dynamic keyboard focus

## Actual issues fixed

The Agent Picket onboarding welcome overlay had a fixed centered layout with no height constraint. In an extremely small CSS viewport, such as the **320×200 CSS pixels left by 400% scaling of a 1280×800 desktop**, the explicit Enable/Not Now controls could be pushed outside the reachable viewport. The live union dialog likewise used 85vh plus 40px of overlay padding, which can exceed a 200px-tall viewport.

Both the welcome and union overlay now have safe, constrained vertical scrolling and a maximum dialog height of `calc(100dvh - 24px)` with 12px overlay padding, preserving the existing union-first layout at normal sizes. The consent buttons and close action remain keyboard-accessible.

A separate real keyboard issue arose after the user triggered a **fictional** grievance/counteroffer/acceptance: the previously focused action button is removed by the next React render. The panel now returns focus, after confirmed state transition, to the stable `union.desk.title` heading (programmatically focusable with `tabIndex=-1`, not an extra Tab stop). The current grievance stage is exposed through an atomic polite status for assistive technology. No focus steal occurs for purely remote/external state updates; the focus flag is only set after the user's own confirmed action.

## Real Chrome verification

In the isolated DSH 0.1.2-rc.1 browser, `tests/dsh-rights-browser.real.test.ts` verifies:

1. Welcome consent dialog is completely within a 320×200 CSS viewport and **internally scrollable**, including explicit Not Now.
2. The union modal is contained at 320×200 and both the interactive union rights action and Close remain reachable by scrolling.
3. Chrome's `forced-colors: active` mode is honored by the primary button (`forced-color-adjust:auto`, visible background). Earlier light/dark contrast checks are preserved.
4. After a user-triggered sample rest grievance, 30-minute counteroffer and simulated acceptance, keyboard focus lands on the stable union desk heading **each time**.
5. Chrome's **actual accessibility tree** (CDP `Accessibility.getFullAXTree`) contains a named, non-ignored Union dialog. This is stronger evidence than DOM attribute assertions alone.
6. Existing opt-in consent, rights state, 2-tab agreement synchronization, full Host shutdown/restart and offline-installed package behavior remain intact.

Crucial limitation: **320×200 CSS viewport reflow is an approximation of 400% zoom available layout space**; it is not an actual operating-system magnification or browser page zoom test. `forced-colors` is Chromium's emulation, not a Windows High Contrast user session. The accessibility tree test does **not** assert that VoiceOver or NVDA has actually been tested.

## Gates and outcomes

- Standard entire repo `npm run check`: **196 total / 173 PASS / 0 FAIL / 23 opt-in skipped**. Added an always-on Node test for stable demand heading and aria-atomic polite status; existing focus/ARIA/reflow tests remain.
- Actual DSH Chrome compiled-source rights/welcome/union/full-restart E2E: **1 PASS**.
- Actual DSH Chrome independently offline-installed npm tarball E2E: **1 PASS**.
- Actual Composer typed /union→Host→sidebar E2E: **2 PASS**.
- Real DSH Cordis CommandRuntime + FileSettingsProvider parity: **1 PASS**.
- No normal DSH_HOME/worktree mutation, model API key, outbound browser service, transcript storage or real task blocking.

## Remaining accessibility checks before a general conformance claim

Perform hands-on VoiceOver and NVDA passes, actual browser page zoom at 200% and 400%, real Windows High Contrast themes, 320px horizontal reflow in other DSH versions, and verify error announcements when Host settings writes are rejected. The existing Draft PR stack still requires canonical merge review; these tests alone do not authorize production publication.
