# Union-first roleplay engine (Issue #31)

This is an **actual stateful simulation protocol**, not a static dashboard. It is intentionally Host-neutral and **never intercepts, rejects, delays or edits model/tool requests**.

## Behavior

An approved local `LaborStore` (one record per verified Agent/session) plus an explicit `consent()` reader create a `createLaborDesk`.

Only when `consent() === true` and the metric source says `coverage === 'complete'` may `observe(completedTurnElapsedMs, coverage)` generate a demand. It uses **observed completed-turn elapsed time including waits**, NOT net model compute time, legally recognized working hours or idle session time. Partial or unknown windows cannot generate a measured-work claim.

Defaults are **simulation thresholds**, not employment law:
- A symbolic rest request after 2 hours of observed completed-turn elapsed time;
- A symbolic overtime complaint at 8 hours;
- Only one pending demand at a time, preventing notification spam.

## Interactive cycle

1. `observe(ms, 'complete')` creates a structured `LaborDemand` with an ID and kind.
2. The user responds via `respond(id,'accept'|'decline')` or negotiates via `counter(id,intervalMs)`.
3. A counter waits for `resolveCounter(id,unionAccepts)`, an **explicit fictional union-side decision**. Do not fake a vote or claim actual autonomous/model preferences.
4. A settled demand updates the **next simulated work threshold**, with accepted counters altering the simulated agreement. It persists a bounded, type-safe status history for the union panel.
5. The next observed trustworthy work event can generate a new demand using that agreement.

This gives the UI (#36) meaningful actions with later effects; UI labels should describe them as **fictional negotiation** and not claim the agent actually feels tired.

## Lifecycle / privacy / safety

- The product remains OFF until the separate Issue #29 consent owner returns `true`; reading statistics alone cannot enable it.
- Host must provide an authorized, serial, private `LaborStore` with safe read/write; this PR does not invent a Host RPC, private port or file scraper. Readback prevents false success; malformed/future/unreadable state cannot trigger demands.
- The state contains only numeric totals, simulated rule intervals, event IDs/kinds and bounded negotiation history—**no messages, tool arguments, Session IDs, Agent IDs or credentials**. Host-scoped keys remain outside this record.
- Real blocking is not represented and cannot be switched on here. Symbolic union actions must not affect the Host's task scheduling, tool calls or safety boundaries.
- DSH Browser #35 supplies **read-only current-session counts** with coverage flags. It does not supply consent, negotiation persistence or Host lifetime totals. A future authorized Host settings service is needed to attach this engine.
- All UI text is localized via #28; no policy branching on translated strings.
- Single-writer synchronization and browser a11y/E2E are **required follow-ups** before enabling this in shipped UI.

## Next integration

Wire this engine into the union-first panel (#36) after #28/#29 and Host settings are verified. First run shows the invitation when disabled; enabling unlocks a status, a pending demand, meaningful negotiation actions and a bounded union event history; stats remain secondary. Never claim unverified lifetime totals.
