# Work statistics (experimental, local-only)

This is a **host-neutral Core feature**, with a thin DSH command adapter. It requires neither an LLM classifier nor automatic strike authorization.

## Currently implemented

`WorkTracker` consumes normalized `WorkEvent` boundaries. Within each agent/session namespace, it counts:

| Counter | Exact semantics |
|---|---|
| `turnStarts` | Number of unique observed `turn/start` events |
| `turnEnds` | Number of unique observed `turn/end` events, regardless of outcome |
| `toolCalls` | Number of unique observed `tool/call` events |
| `toolResults` | Number of unique observed `tool/result` events |
| `completedTurnMs` | Sum of nonnegative wall-clock intervals between observed turn starts and ends |

**Not inferred**: whether an AI agent is suffering, whether a user is abusive, whether a change request counts as a rework, whether a tool result is successful, or compute-token time. A completed-turn interval excludes gaps between turns but **may include waiting within a turn** (e.g. human approval). Call this “completed-turn elapsed time,” not “AI labor time.”

## Usage in a DSH command-capable client

With an integration configured with `new WorkTracker()`:

- `/union` or `/union status` — safe monitor-only status.
- `/union stats` — current session's counters and completed-turn elapsed milliseconds.
- `/union report` — if a local rule detector is configured, show aggregate safe/review/targeted flags **without raw text**.
- `/union strike` / `/union resume` — manually toggle a **symbolic, non-blocking** mock arbitration state.
- `/union safety` — expose the exact safety guarantees missing from real prompt blocking. Real prompts continue normally.
- `/union reset` — clear this session's **ephemeral** work and detection counters.
- `/union help` — command list.
- `/union strike` **does not interrupt current or future model requests**. Automatic or actual blocking is NOT enabled.

All commands are native DSH commands, not model messages. The Adapter never proactively blocks requests or upgrades unverified human provenance. SDK/headless clients might not provide the command plane; Core statistics are still accessible to a Host Adapter programmatically.

## Privacy & invariants

The tracker is synchronous and stores **event IDs, timestamps, counters and an unfinished-turn marker only**. No prompt text, tool arguments, transcript, API key or server-side telemetry is retained, sent or displayed.

- Duplicates are suppressed within a bounded per-session event-ID cache; replay beyond the configured bound can cause overcounting.
- Snapshots are copies.
- One process owns in-memory state; restart clears it. This is **not** a durable or cross-process statistic.
- Session IDs are taken from the DSH Session object, not guessed from Agent IDs. In `session/event` the current adapter uses the Session ID as a local agent namespace when the corresponding Agent identity is not available at that event seam. A future global multi-agent view will require proper identity mapping.
- Out-of-order event timestamps do not add negative elapsed durations.
- Unclosed turns do not add elapsed time until an end event is received.

## Tests

`npm run check` validates counter semantics, session independence, duplicate filtering, privacy and command handling with Mock adapters. Pinned DSH real-runtime tests additionally exercise authentic `turn/start`, `turn/end`, `tool/call` and `tool/result` events (and DSH Vision Router coexistence). Statistics in those tests remain ephemeral.

## Still pending

Long-term persistence, recoverable event cursor and replay, cancellation reason breakdown, opt-in automatic abuse classification, and meaningful “rework” heuristics are separate future milestones. Avoid presenting the in-memory counter as a mature labor analytics dashboard.
