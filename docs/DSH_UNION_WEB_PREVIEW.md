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

## Tested versus pending

Verified in isolated Node 24.5.0 environment:
- TypeScript compilation of the Client + Host schema files
- DSH browser factory compilation into a self-contained ~40 KB JS artifact and node --check
- Native Host rights settings schema tests (3/3)
- Built Browser module test with fake DSH services: React platform imports, original data privacy, Session stats and both Slot registrations
- Six original Slot component tests and six authenticated settings-scope adapter tests from the corresponding UI branches

**Not verified**: DSH installed-package/Chrome Web E2E, real Host initialization timing, modal focus trapping/a11y on physical browser, interaction persistence across true Host restarts, multi-Host compatibility, and union grievance mutation in Browser UI. The Host settings service is optional; unsupported Hosts remain observation-only. Keep this PR Draft until these checks pass.

## Next user-visible release step

Run the real DSH Chrome test harness against a disposable installed plugin (with all external access blocked), check enabling, decline, restart, dark/light, and unloading. Then review integration of the already-built simulated grievance engine from PR #39 with a narrowly authorized Host action channel. No ad hoc HTTP or scraping.
