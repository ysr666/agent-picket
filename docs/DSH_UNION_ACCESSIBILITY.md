# DSH union dialog accessibility and light/dark QA

## Scope

Release-hardening of the existing union-first DSH React modal, with no additional data owner, model calls, automatic work blocking, or changes to fictional bargaining.

## Fixed

The sidebar union dialog was visually modal but had no robust focus trap, Escape dismissal, background inertness, or return-to-opener behavior. Opening now focuses Close, makes the Host root inert, wraps Tab and Shift+Tab among enabled controls, closes on Escape, restores the former root inert state and returns focus to the launcher. The launcher advertises aria-haspopup=dialog, aria-expanded and aria-controls; the dialog retains its localized accessible name. The ON/OFF state exposes a polite live status.

A second concrete defect: a hard-coded white label against the official DSH dark-theme brand-primary background (also near white) had poor contrast. Primary actions now use the Host's paired button-primary-fill and label-primary-foreground theme variables. Error alerts use state-error-primary so red also adapts to the dark palette.

## Verified on real DSH 0.1.2-rc.1 Chrome/Playwright

- Actual source build and a separate offline npm-installed package, each running through the complete welcome/consent, live union panel, demo bargaining, cross-tab update and full Host restart flow.
- Real keyboard focus at opening, Tab wrapping in both directions, Escape dismissal, restoration of Host interaction and keyboard focus.
- Actual computed button foreground and background luminance in both official Host light and dark CSS themes, with each primary action meeting WCAG AA 4.5:1 text contrast.
- Phone-sized 390 x 680 viewport keeps both the modal and Close button inside visible bounds.
- Original Composer /union command-to-sidebar tests and real DSH Cordis CommandRuntime regression still pass.
- Isolated repository npm run check: 193 tests, 170 pass, 0 fail, 23 opt-in skips. Actual Host/Chrome suites were enabled and passed separately.

## Important remaining accessibility and release checks

Focused keyboard and contrast tests do not establish full WCAG conformance. Still to do: actual VoiceOver and NVDA manual screen-reader passes, meaningful focus placement after a dynamic grievance resolves, high-zoom reflow, forced-colors/high-contrast and comprehensive visual QA, plus other DSH versions. All verification uses disposable DSH_HOME profiles and no model credentials. This branch remains Draft/unmerged; no npm publication.
