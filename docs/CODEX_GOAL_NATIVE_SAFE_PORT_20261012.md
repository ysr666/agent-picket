# Codex Goal owner-boundary adapter: read-only v1 (2026-10-12)

## Native facts established on an isolated Codex 0.146.1 installation

`codex features list` reports `goals` stable/true. Official `codex app-server generate-ts --experimental` exposes `ThreadGoalGetParams`, `ThreadGoalSetParams`, `ThreadGoal`, and `ThreadGoalStatus`. In an isolated App-Server with a temporary `CODEX_HOME`, `thread/start` created a synthetic *idle thread*; a single App-Server **owner process** acknowledged `thread/goal/set` with status `paused`, then `thread/goal/get` returned `paused`; another set/readback returned `blocked` and emitted `thread/goal/updated`. No `turn/start` or cloud model prompt was submitted, no user's Codex profile was modified, and the private Goal objective was only synthetic.

**Do not exaggerate this experiment:** An isolated owner-state mutation is NOT evidence that an external process can atomically stop a running Codex Desktop thread, preserve in-flight tool work, suppress the next automatic Goal round, or durably resume its original content after an app crash. Codex 0.146.1 `ThreadGoalSetParams` contains `threadId`, optional `objective`, `status` and `tokenBudget`, but **no `expectedRevision`/CAS parameter**. A naive `get→set` can race with human resume, another window, or newly starting work. Do not wire it as a real Agent Picket strike without a separate, verified same-owner serialization and conditional transition contract. An experimental Goal screen or a new Task does not establish that contract.

## Implemented non-invasive adapter contract

`src/adapters/codex/goal-readiness.ts` defines `readCodexOfficialGoal` and `parseCodexGoalReadback` for the official `thread/goal/get` response. It verifies the exact requested thread ID, known official status, timestamps and nonnegative usage values. It NEVER copies private Goal objective text into its normalized readback, writes Host state, clears a Goal or intercepts prompts. Invalid, missing, spoofed or unavailable Host responses are `unconfirmed`, not permission to block.

`inspectCodexGoalHoldSafety` explicitly requires five independent facts: Host-authenticated real-strike consent, verified ownership of the active App-Server/thread, verified idle-after-current-turn and before-next-round safe boundary, conditional/serialized status transition, and proven durable lossless resume. The static `CODEX_0146_NATIVE_GOAL_CAPABILITY` does not assert these facts merely because `thread/goal/set` works, so automatic strikes remain DISABLED. `tests/codex-goal-readiness.test.ts` checks the privacy/readback/provenance safety contract.

## Outstanding for #119 and 1.0

Build an opt-in, official owner-process connection with verified Goal identity and Host revision fencing or equivalent linearizable serialization. Demonstrate at least one real native autonomous Goal's full tool/model Turn completing, its next round staying stopped, no content loss, user-visible notification, explicit resume, cold restart and more than one window, across Windows/macOS/Linux. Independently support first-run real-strike consent and an optional per-strike confirmation setting. Leave the existing Codex `UserPromptSubmit` Hook advisory-only and keep Hook trust enabled. The release gate stays NO-GO.

## 2026-10-12 · Native cross-process Goal persistence actually verified

`tests/codex-goal-native.real.test.ts` now provides a **real opt-in** offline App-Server protocol E2E, using the installed Codex 0.146.1 native executable directly and a disposable `CODEX_HOME` and workspace (never the user's real Codex profile). The original Goal objective is synthetic and no `turn/start`, model call, tool execution or prompt replay is issued. It verifies all three independent process lifetimes:

1. Process A owns a newly created idle `thread`, sets synthetic Goal `paused`, then confirms official `thread/goal/get` returns `paused` and zero tokens before shutdown.
2. Process B restores the exact same persisted thread using official `thread/resume`, confirms original objective/paused/zero tokens survived, changes status to `blocked`, and verifies official readback and `thread/goal/updated` notification.
3. Process C starts in the same isolated CODEX_HOME, resumes the saved thread and confirms Goal **remains blocked**, with original objective and zero tokens unchanged. Nothing autonomously starts on process boot.

Run with `AGENT_PICKET_CODEX_BIN=/absolute/path/to/native/codex AGENT_PICKET_CODEX_GOAL_NATIVE=1 node --experimental-strip-types --test tests/codex-goal-native.real.test.ts`. Tested using the actual macOS ARM64 native binary packaged by Codex 0.146.1, **1/1 passing**. Using the npm launcher wrapper instead of the actual native binary may leave a child subprocess, so use the native executable for this test. The test uses a localhost-only nonfunctional proxy, disables telemetry, disposes all 3 owner processes and deletes its temporary home.

This is a stronger **persistent paused/blocked state** proof, NOT evidence that an external process can conditionally pause an already-running Codex Desktop Goal *at an autonomous-round boundary*. The current Goal `set` protocol still lacks an expected revision CAS. Until full owner-bound safe-boundary and no-loss native work E2E exist, Codex enforcement remains deliberately disabled and excluded from the installed package. The release gate stays NO-GO.
