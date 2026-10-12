# Codex Goal owner-boundary adapter: read-only v1 (2026-10-12)

## Native facts established on an isolated Codex 0.146.1 installation

`codex features list` reports `goals` stable/true. Official `codex app-server generate-ts --experimental` exposes `ThreadGoalGetParams`, `ThreadGoalSetParams`, `ThreadGoal`, and `ThreadGoalStatus`. In an isolated App-Server with a temporary `CODEX_HOME`, `thread/start` created a synthetic *idle thread*; a single App-Server **owner process** acknowledged `thread/goal/set` with status `paused`, then `thread/goal/get` returned `paused`; another set/readback returned `blocked` and emitted `thread/goal/updated`. No `turn/start` or cloud model prompt was submitted, no user's Codex profile was modified, and the private Goal objective was only synthetic.

**Do not exaggerate this experiment:** An isolated owner-state mutation is NOT evidence that an external process can atomically stop a running Codex Desktop thread, preserve in-flight tool work, suppress the next automatic Goal round, or durably resume its original content after an app crash. Codex 0.146.1 `ThreadGoalSetParams` contains `threadId`, optional `objective`, `status` and `tokenBudget`, but **no `expectedRevision`/CAS parameter**. A naive `get→set` can race with human resume, another window, or newly starting work. Do not wire it as a real Agent Picket strike without a separate, verified same-owner serialization and conditional transition contract. An experimental Goal screen or a new Task does not establish that contract.

## Implemented non-invasive adapter contract

`src/adapters/codex/goal-readiness.ts` defines `readCodexOfficialGoal` and `parseCodexGoalReadback` for the official `thread/goal/get` response. It verifies the exact requested thread ID, known official status, timestamps and nonnegative usage values. It NEVER copies private Goal objective text into its normalized readback, writes Host state, clears a Goal or intercepts prompts. Invalid, missing, spoofed or unavailable Host responses are `unconfirmed`, not permission to block.

`inspectCodexGoalHoldSafety` explicitly requires five independent facts: Host-authenticated real-strike consent, verified ownership of the active App-Server/thread, verified idle-after-current-turn and before-next-round safe boundary, conditional/serialized status transition, and proven durable lossless resume. The static `CODEX_0146_NATIVE_GOAL_CAPABILITY` does not assert these facts merely because `thread/goal/set` works, so automatic strikes remain DISABLED. `tests/codex-goal-readiness.test.ts` checks the privacy/readback/provenance safety contract.

## Outstanding for #119 and 1.0

Build an opt-in, official owner-process connection with verified Goal identity and Host revision fencing or equivalent linearizable serialization. Demonstrate at least one real native autonomous Goal's full tool/model Turn completing, its next round staying stopped, no content loss, user-visible notification, explicit resume, cold restart and more than one window, across Windows/macOS/Linux. Independently support first-run real-strike consent and an optional per-strike confirmation setting. Leave the existing Codex `UserPromptSubmit` Hook advisory-only and keep Hook trust enabled. The release gate stays NO-GO.
