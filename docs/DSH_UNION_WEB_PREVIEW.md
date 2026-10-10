# DSH Web Union-first integration preview — PR #44

## What is wired

This branch is based on the existing, still-unmerged DSH Web metrics bridge PR #35. It adds a real Browser Client entry that registers Agent Picket through the public DSH settings.onboarding and settings.section React Slot system.

The packed Browser module uses the DSH platform's React and react-dom singletons, not a duplicated framework runtime. It retains the independent read-only agentPicketDashboard service from PR #35.

The Native DSH Host registers a single user-owned settings namespace: agent-picket, with an enum field welcomeDecision (unseen / enabled / not-now), default unseen. The UI consumes the DSH client settingsScope.bind API, which is Host-authorized and revision-fenced. It never uses the statistics Bridge as a writable channel.

## Behavior

- On Host settings READY + writable and unseen consent, render a localized AI Rights welcome dialog with explicit Enable Simulation and Not Now.
- Both choices require an authorized DSH Host settings write and confirmed readback before the onboarding step completes.
- On missing/unavailable/remote-readonly settings, do not grant rights, do not trap onboarding, and do not block model work.
- The union page places union identity/status, workday and the space for future grievances above a collapsed statistics section. Missing/partial session data cannot masquerade as complete lifetime work.
- Only live current-session event-window metrics are read. The Bridge does not expose the Host lifetime ledger; lifetime remains unavailable until a separate reviewed Host channel exists.
- No conversation text, tool arguments, model network calls, actual task blocking, or fictitious collective votes.

## Safety / single owner

This preview deliberately uses the **DSH Host settings namespace** as the single owner of the rights choice. It does NOT activate PR #41's alternative Node-local consent store: that is a separate fallback design to evaluate or migrate, not a second concurrently writable permission source.

Enabling simulated labor rights has no effect on Host admission/safety policy; true blocking is not in scope. The user can disable the simulation through the union settings panel.

## Browser bundling

The explicit zero-dependency source bundler inlines our own i18n and UI modules into the DSH Client factory, then uses DSH's existing platform module table for react and react-dom. No remote JavaScript is fetched. The import graph is statically allowlisted and fails build on unexpected new dependencies.

## Tested versus pending (2026-10-10)

Verified on a connected macOS development machine (Node 24.5.0) with **real DSH 0.1.2-rc.1 + headless Google Chrome + Playwright**, all under new disposable DSH_HOME directories, no API keys, disabled external network routes, and no changes to existing user sessions:

- TypeScript compilation, the bundled DSH Client factory, and Host namespace validation
- Private offline npm pack + offline npm install with Schemastery as the **only** Host-side runtime dependency; Host-neutral Core has no runtime imports
- **Two real Chrome E2E runs passed:** source plugin and separately offline-installed tarball plugin
- Actual DSH initial notice → provider skip → localized AI Rights first-run dialog
- Explicit "Not Now" persists through Browser reload without another AI Rights modal
- Persistent DSH sidebar union entry opens the **union-first panel** in an otherwise blank/no-workspace Host
- Opt-in, Browser reload retaining opt-in, opt-out and Browser reload retaining opt-out: all verified against native DSH settings
- Keyboard Shift+Tab / Tab cycles between welcome choices; no uncaught page errors in these test runs
- Statistics remain unknown when no session event window exists; no fake cumulative work or lifetime total
- The focused real Host E2E lives in tests/dsh-rights-browser.real.test.ts, opt-in through AGENT_PICKET_DSH_BIN, AGENT_PICKET_PLAYWRIGHT_ENTRY and AGENT_PICKET_CHROME_BIN.

**Important limits:** These tests verify **Browser reload**, not a full DSH Host process restart. They do NOT verify genuine session-driven grievance creation/accept/decline in the Browser (that requires an authenticated Host action path), multi-tab reconciliation, all keyboard/screen-reader accessibility requirements, dark/light visual QA, or other DSH versions. The historical command-oriented tests/dsh-browser.real.test.ts also assumes an initialized Host workspace; on a completely empty disposable DSH_HOME, the Composer is inert until a workspace is selected. This fixture limitation remains separate from the now-passing no-workspace AI Rights onboarding tests.

Keep PR #44 Draft until its stacked merge path, real bargaining state ownership, full accessibility testing and cross-version checks are reviewed.

## Existing-session first install and union access

DSH's default settings.onboarding coordinator runs only for no/blank selected sessions. Agent Picket therefore ALSO registers the supported sidebar.footer.action Slot. That action is visible as a persistent union entry in both collapsed and expanded sidebars and can open the union-first drawer. When a current Host Session is explicitly ready and nonblank, and rights preference is still unseen, that entry shows the same first-use invitation; blank/no-session views defer to native onboarding to avoid two simultaneous invitations. No dialog is shown before authenticated writable preference state is ready. The union's verified elapsed-time progress against the fictional eight-hour target is visible only when coverage is complete. Incomplete history never produces a bogus progress bar.

Extra validation: six original native UI tests expanded to eight; bundled Browser factory/Slot test, Host schema tests, full TypeScript compilation, and a clean offline npm-ci install of Schemastery + its declared transitive dependencies passed on Node 24.5.0. Real DSH Chrome/Host rendering and offline-installed first-run consent **have now passed**. Full Host restart, cross-version accessibility and authenticated Browser bargaining still require review.
