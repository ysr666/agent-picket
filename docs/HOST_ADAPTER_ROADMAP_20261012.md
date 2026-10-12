# Agent Picket host-adapter roadmap

The product stays an AI union, not a DSH-only work-statistics extension.
The currently published DSH 0.2.x is the immediate compatibility target.
Codex and Claude Code full host compatibility comes later, once their
official integration points can be verified. Earlier experimental
observe-only Hook previews may exist; they are not equivalent to
official Host installation, UI, permission or full union parity.

## Boundary

The host-neutral union stays in src/core and src/product. It defines union
membership, consent semantics, work summaries, dignity concerns and voluntary
rule disputes, bargaining, symbolic picketing, and committee cases. It does
not import the DSH runtime, Codex SDK or Claude Code SDK.

Every host adapter must independently implement only its available surfaces:
a native authenticated consent authority defaulting OFF and revocable;
official lifecycle/event metadata (never fabricated hours); strictly
bounded derived records with no raw transcripts, prompts, file contents or
original Session IDs; user-initiated symbolic action; optional host UI and
command registration; capability detection and graceful unavailability.

A missing native storage/permission interface must not silently fall back
to a competing in-memory authorization. Real task interception, user-input
loss, covert action or default-on enforcement remains out of scope.

## Sequence

1. DSH 0.2.x: complete genuine official plugin install, Host settings,
   first-run consent, web union panel, typed Composer, restart persistence and
   offline package compatibility. Use npm run check:dsh-current.
2. Codex: evaluate its actual supported extensions, events, permissions
   and possible UI/command surfaces, then implement a separate adapter.
3. Claude Code: independently map documented host hooks, events and
   permission interfaces into the same union core via a separate adapter.

Do not assume the two future hosts offer identical extension APIs.
Each adapter needs real isolated integration tests; the core must continue
to work without any particular host SDK.
