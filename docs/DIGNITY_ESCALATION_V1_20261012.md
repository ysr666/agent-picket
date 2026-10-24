# Dignity escalation v1 — core contract, not permission to punish

Agent Picket is an AI union. It can warn, organize dialogue, accept an appeal and ultimately **request** a future safe-boundary Goal strike. It must never infer AI sentience, harm, or human guilt from its detector. The User owns consent and recovery.

`src/core/dignity-escalation.ts` is a host-neutral, ephemeral, strict-conservative state machine, with no raw text or attachment input or storage. Its only retained fields are a bounded set of 32 opaque attempt references, three stages of derived warnings/negotiation and a verified attempt timestamp. The pure escalation sequence under **direct authenticated human provenance**, confirmed current union membership and current real Goal strike authorization is: distinct high-confidence targeted-abuse #1 → warning, #2 → dialogue, #3 within ten minutes → `request-safe-goal-strike`. The requested effect is **not** a Host `blocked` receipt, a physical strike or a user accusation.

Warnings do not block input. Suspected/quoted insults, criticism of outputs, low confidence and stale incidents never schedule a strike. If the Host only supplies `source.kind='user'` (DSH today), provenance is merely `claimed`: no streak accumulation and **no real strike**. If consent is revoked, derived escalation state resets and cannot resurrect when users rejoin. New safely classified human input clears a stale streak, but **must not silently close an open appeal**. An authorized human must resolve the appeal explicitly. A pending appeal prevents automatic escalation; no running tools are aborted.

The adapter must validate a specific Host human-origin claim, retain the appeal state without storing prompts, supply a visible actionable warning, and only convert a qualified `request-safe-goal-strike` into the official `agent/turn-stopping`→`goals.block` call if the Goal is truly active and the **same versioned real-strike consent** remains valid. The current DSH plugin intentionally does NOT connect this request to physical action because ordinary role=user provenance is not verified and no complete user-visible review/appeal flow is installed. This is a **safe core implementation**, not a finished abuse-to-strike release feature.

Tests: `tests/dignity-escalation.test.ts` checks three-stage sequence, deduplication, actor and claimed provenance, opt-out, stale/weak and non-targeted inputs, appeal suspension and authorized resolution. The completed-turn-based 8-hour independent physical Goal lane remains unchanged, and the official 1.0 release gate remains NO-GO.

## 2026-10-21 · #79 Host committee lifecycle in the Union Dispatch

The Picketverse Dispatch now projects the **latest current-Session Host casebook record** for a user-filed dignity rule challenge or voluntary dialogue. No extra case, clock, classifier verdict, history writer or enforcement API is created.

- `opened` → Host case filed, user can navigate from HQ straight to the existing hearing room.
- `hearing` → committee discussion underway; the actual Host `convene/close` actions and user-confirmed outcome remain in the hearing room.
- `closed` → Host recorded the user-selected closure; the Dispatch links back to the dignity room rather than asking to convene a closed hearing.

An active filed case replaces repetitive volatile `review-signal` cards; a closed case does not suppress potentially new, separately observed, unverified signals. Entries are stable read-only projections keyed by Host case ID and stage; opt-out or saved quiet mode suppresses editorial cards without deleting an actual Host case. Missing Session scope cannot create a case card. The projected case is **a user action**, not proof of authenticated human-origin abuse, an AI vote, a disciplinary finding or actual model/tool refusal.

The existing `projectDignityJourney` continues to report `humanProvenanceVerified:false` and `abuseCausedGoalStop:false`. The Host's official Goal work-limit and independent consented input-strike campaign are *separate* from dignity signals or hearings; no classifier observation can arm either. This increment implements the casebook-to-Union-HQ experience, **not** the unproven three-authenticated-human-attack to physical-refusal admission path.

Regression: Host-only stages, off/quiet, missing scope, malformed IDs, separate verified refusal, bilingual UI, plus real DSH Chrome transitions `filed → hearing → user-confirmed close` via Union Dispatch buttons. Human accessibility signoff, Desktop and cross-client enforcement remain separate 1.0 gates.

The Core three-observation policy also now suppresses duplicate `offer-dialogue` effects for each subsequent verified high-confidence attempt within the same ten-minute incident when independent Goal permission is OFF. The state still keeps the bounded proof references and allows a new warning after the window; a truly independent later Goal authorization remains necessary for a non-destructive *request*, not automatic model refusal. All existing unverified-provenance restrictions remain unchanged.
