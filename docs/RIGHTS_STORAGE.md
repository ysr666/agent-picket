# Private Host-owned Rights Storage (DSH handoff)

Development preview on Issues #29 and #31. Adds durable consent/fictional union records, NOT a browser settings RPC or an installed welcome modal.

## Host-side integration
On trusted Node/Cordis, createDshRightsOwner(trustedDshHome) returns rights and getLaborDesk(invocation). Pass those into registerDshIntegration as rights and laborDeskFor. The DSH_HOME is a trusted Host setting, never supplied by a browser message.

Native commands become functional after the DSH plugin actually installs the owner. Commands include /union welcome, /union rights on|off|status, /union grievances, /union accept N and /union decline N. Do NOT claim working installed DSH integration until the separate stacked Host plugin is tested.

## Private storage
- DSH_HOME/agent-picket/rights-v1/consent.json: explicit opt-in (defaults OFF; malformed/future/unreadable settings fail closed).
- DSH_HOME/agent-picket/rights-v1/sessions/{sha256 JSON(agentId,sessionId)}.json: per-Agent/session structured fictional negotiation status. No literal user/Agent/session IDs, prompt text, API credentials, or tool arguments inside records. Hashing is pseudonymization, not anonymity.
- Owner-only mode 0700 dirs and 0600 files on POSIX; size bounds, exclusive per-record lock, atomic temp file + rename, fsync. Unexpected locks are not deleted automatically.
- Session revisions reject a stale bargaining update while holding the writer lock. Read/write errors cannot silently invent successful opt-in or interrupt real Host tasks.
- No custom HTTP port, raw conversation storage, model calls, Host Composer mutation or blocking authorization.
- Filesystem power-loss durability and multi-process lifecycle behavior remain platform-dependent; do not overstate coverage.

## Why the UI still needs a separate Host capability
DSH provides sanctioned settings.onboarding and settings.section Client UI Slots. Actual first-run welcome and union-first panels should use those, not inject unsupported DOM into the conversation Composer.
The read-only agentPicketDashboard Bridge (PR #35) provides numeric current-session data with coverage flags. It cannot save rights settings, access authorized lifetime stats, or hold a persisted union bargaining state.
A safe browser-to-Host settings transport must be verified separately before shipping writable Web UI.

## Validation
Eight isolated Node tests exercise private persistence, restart, state separation, symlink refusal, corrupt state failure, lock contention and stale revisions. This file does not certify a live DSH/Chrome/Web Host.
