# DSH native rights preference: Client settings-scope contract

The verified DSH source implements first-party settings integration:

- Host: ctx.settings.register(namespace, schema) owns one validated, durable preference section.
- Browser Client: ctx.settingsScope.bind({ namespace }) obtains the authorized Host settings snapshot and async, revision-fenced .set(field, value) method.
- Native UI: settings.onboarding and settings.section are dedicated React Slot registration targets.

The new client-rights-scope adapter is designed to consume the Host's **existing authenticated** settings scope. It opens no HTTP endpoint, reads no private files, stores nothing in browser localStorage and never sends messages to the model.

## Schema agreement (must be implemented by Host plugin)
Register namespace **agent-picket** with one atomic setting:
- welcomeDecision: unseen | enabled | not-now, default unseen.
- enabled means **only** nonblocking fictional Labor Rights Simulation; automatic blocking must be a separate, unavailable permission.
- not-now means explicit decline; do not reopen welcome every session.
- The scope is required to be status ready, writable true, mode host. Unknown/future/schema-invalid value fails closed and shows no fake success.

The native Host schema and its provider are NOT included in this PR; they must be reviewed with the still-unmerged DSH Host plugin. The older Node-local rights store from PR #41 is a fallback contract for Hosts lacking native settings; **do not activate both stores independently**. Select one authoritative Host source and explicitly migrate existing preferences if needed.

## UI behavior to implement with official React Slot registration
- Register first-run welcome in settings.onboarding. If scope is loading, render null and don't claim consent. If unavailable, show a nonblocking explanation outside the welcome step; never trap the user.
- On invite, present localized AI Rights headline and copy, prominent Enable Simulation and quieter Not Now buttons, and a clear separate automatic-block permission disclosure.
- Both buttons call async .choose(choice) and complete the Host onboarding coordinator **only after Host readback confirms persistence**. Failed writes show retryable error and keep mode OFF.
- Register a union-first page in settings.section or another sanctioned owner-provided UI Slot, with union identity/status, simulated workday, pending grievances/bargaining and their real controls. Statistics from the read-only agentPicketDashboard Bridge #35 remain subordinate.
- Use Host locale or #28 translations; keyboard/a11y and dark/light themes required. Avoid manual DOM injection or command-card scraping.

## Test scope
The adapter has six deterministic unit tests covering first-use, decline/enable, language-independent state, loading, unavailable/remote Host, malformed/future setting, write failure, and false-success prevention.
Still NOT a rendered first-run modal, Host schema registration or DSH Chrome integration. Keep the PR Draft until that integration is completed and tested.
