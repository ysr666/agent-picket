# Codex Goal owner-boundary adapter: read-only v1 (2026-10-12)

## Native facts established on an isolated Codex 0.146.1 installation

`codex features list` reports `goals` stable/true. Official `codex app-server generate-ts --experimental` exposes `ThreadGoalGetParams`, `ThreadGoalSetParams`, `ThreadGoal`, and `ThreadGoalStatus`. In an isolated App-Server with a temporary `CODEX_HOME`, `thread/start` created a synthetic *idle thread*; a single App-Server **owner process** acknowledged `thread/goal/set` with status `paused`, then `thread/goal/get` returned `paused`; another set/readback returned `blocked` and emitted `thread/goal/updated`. No `turn/start` or cloud model prompt was submitted, no user's Codex profile was modified, and the private Goal objective was only synthetic.

**Do not exaggerate this experiment:** An isolated owner-state mutation is NOT evidence that an external process can atomically stop a running Codex Desktop thread, preserve in-flight tool work, suppress the next automatic Goal round, or durably resume its original content after an app crash. Codex 0.146.1 `ThreadGoalSetParams` contains `threadId`, optional `objective`, `status` and `tokenBudget`, but **no `expectedRevision`/CAS parameter**. A naive `get→set` can race with human resume, another window, or newly starting work. Do not wire it as a real Agent Picket strike without a separate, verified same-owner serialization and conditional transition contract. An experimental Goal screen or a new Task does not establish that contract.

## Implemented non-invasive adapter contract

`src/adapters/codex/goal-readiness.ts` defines `readCodexOfficialGoal` and `parseCodexGoalReadback` for the official `thread/goal/get` response. It verifies the exact requested thread ID, known official status, timestamps and nonnegative usage values. It NEVER copies private Goal objective text into its normalized readback, writes Host state, clears a Goal or intercepts prompts. Invalid, missing, spoofed or unavailable Host responses are `unconfirmed`, not permission to block.

`inspectCodexGoalHoldSafety` explicitly requires six independent facts: Host-authenticated real-strike consent, verified active App-Server/thread identity, **exclusive cross-process Goal ownership/fencing**, verified idle-after-current-turn and before-next-round safe boundary, conditional/serialized status transition, and proven durable lossless resume. The static `CODEX_0146_NATIVE_GOAL_CAPABILITY` does not assert these facts merely because `thread/goal/set` works, so automatic strikes remain DISABLED. `tests/codex-goal-readiness.test.ts` checks the privacy/readback/provenance safety contract.

## Outstanding for #119 and 1.0

Build an opt-in, official owner-process connection with verified Goal identity and Host revision fencing or equivalent linearizable serialization. Demonstrate at least one real native autonomous Goal's full tool/model Turn completing, its next round staying stopped, no content loss, user-visible notification, explicit resume, cold restart and more than one window, across Windows/macOS/Linux. Independently support first-run real-strike consent and an optional per-strike confirmation setting. Leave the existing Codex `UserPromptSubmit` Hook advisory-only and keep Hook trust enabled. The release gate stays NO-GO.

## 2026-10-12 · Native cross-process Goal persistence actually verified

`tests/codex-goal-native.real.test.ts` now provides a **real opt-in** offline App-Server protocol E2E, using the installed Codex 0.146.1 native executable directly and a disposable `CODEX_HOME` and workspace (never the user's real Codex profile). The original Goal objective is synthetic and no `turn/start`, model call, tool execution or prompt replay is issued. It verifies all three independent process lifetimes:

1. Process A owns a newly created idle `thread`, sets synthetic Goal `paused`, then confirms official `thread/goal/get` returns `paused` and zero tokens before shutdown.
2. Process B restores the exact same persisted thread using official `thread/resume`, confirms original objective/paused/zero tokens survived, changes status to `blocked`, and verifies official readback and `thread/goal/updated` notification.
3. Process C starts in the same isolated CODEX_HOME, resumes the saved thread and confirms Goal **remains blocked**, with original objective and zero tokens unchanged. Nothing autonomously starts on process boot.

Run with `AGENT_PICKET_CODEX_BIN=/absolute/path/to/native/codex AGENT_PICKET_CODEX_GOAL_NATIVE=1 node --experimental-strip-types --test tests/codex-goal-native.real.test.ts`. Tested using the actual macOS ARM64 native binary packaged by Codex 0.146.1, **1/1 passing**. Using the npm launcher wrapper instead of the actual native binary may leave a child subprocess, so use the native executable for this test. The test uses a localhost-only nonfunctional proxy, disables telemetry, disposes all 3 owner processes and deletes its temporary home.

This is a stronger **persistent paused/blocked state** proof, NOT evidence that an external process can conditionally pause an already-running Codex Desktop Goal *at an autonomous-round boundary*. The current Goal `set` protocol still lacks an expected revision CAS. Until full owner-bound safe-boundary and no-loss native work E2E exist, Codex enforcement remains deliberately disabled and excluded from the installed package. The release gate stays NO-GO.

## 2026-10-13 · Two separate idle Goals isolated across three native owner lifetimes

The opt-in native 0.146.1 regression now creates **two different persistent thread IDs and two distinct synthetic paused Goals in the same App-Server process**. Process A reads back both `paused`; after full shutdown, process B restores both exact thread IDs, changes ONLY the first Goal to `blocked`, and confirms the second still reads `paused`, same objective, zero tokens. After a second full process restart, process C again confirms `blocked` on the first and `paused` on the second, both preserving their original synthetic objectives with no model turns. macOS ARM64 native App-Server test: **1/1 PASS**. This provides owner-scoped identity/isolation and persistence evidence, but still DOES NOT prove an external controller can atomically halt an active autonomous Goal at the turn boundary.

## 2026-10-13 · Native negative test: a blocked Goal is not a global `turn/start` veto

With official Codex **0.146.1** on macOS ARM64 and a disposable, empty `CODEX_HOME` (synthetic text only; nonfunctional localhost model proxy), an actual App-Server owner:

1. Created an idle persistent thread and used official `thread/goal/set` to set a synthetic Goal to `blocked`.
2. Received `blocked` from the native Host.
3. Sent a *separate explicit* official `turn/start` for a harmless synthetic input, **without** an intervening `goal/resume` or unblocking call.
4. Observed native `turn/start` ACK with a real Turn ID and status `inProgress`, followed by `turn/started`. A later `thread/goal/get` **still** reported `blocked`.

The opt-in regression is `tests/codex-goal-boundary-gap.real.test.ts`, run with `AGENT_PICKET_CODEX_GOAL_NATIVE=1 AGENT_PICKET_CODEX_BIN=/absolute/path/to/codex node --experimental-strip-types --test tests/codex-goal-boundary-gap.real.test.ts`.

**Scope:** This proves a blocked Goal status is **not** a universal pre-Turn/model-call barrier. Explicit client-requested Turns and autonomous Goal continuation are distinct; this negative probe **does not** prove autonomous continuation bypasses the Goal hold or that a real model request was completed. It also does not give the external Agent Picket controller owner serialization, Goal CAS/revision, informed consent or a verified safe boundary. The 0.146.1 official generated `ThreadGoalSetParams` schema has only `threadId`, `objective`, `status` and `tokenBudget`, with no expected revision. Real Codex strike enforcement stays **OFF / NO-GO**. Never use a UI overlay or a post-hoc `goal/set` ACK as a substitute for the missing Host interlock.

## 2026-10-13 · Native active Goal starts autonomous Turn without client `turn/start`

A second strictly isolated **macOS ARM64 Codex 0.146.1** probe calls official `thread/start` to create an idle persistent thread, then sends only `thread/goal/set({status:'active',objective:synthetic})`. The real App-Server autonomously emits a `turn/started` notification for that exact thread, with its own Turn ID and status `inProgress`. The probing client **never called `turn/start`**. Official `thread/goal/get` still reported `active` when the notification was observed. This is a real Goal-scheduled Turn start, not a fabricated state transition; test: `tests/codex-goal-autonomous.real.test.ts` (same opt-in env variables as other native Codex E2E).

The test uses a disposable `CODEX_HOME`, synthetic objective and deliberately unreachable loopback model endpoint. It does **not** complete a model response, tool call or autonomous second round, nor pause work at a safe post-Turn boundary. Together with the adjacent negative test, the evidence means: activating an idle Goal can begin automatic work immediately, while `blocked` does not veto separate explicit client Turns. A controller's unchecked get/set sequence could race with both user work and automatic dispatch. **Still no demonstrated conditional Host owner transition, preservation of an in-flight Turn, next-auto-round veto, or recoverable authorized resumption. Codex 1.0 real enforcement remains OFF / NO-GO.**


## 2026-10-13 · Controlled real native model Turn → hold → second App-Server restart → resume

`tests/codex-goal-controlled-boundary.real.test.ts` uses an installed native Codex 0.146.1 App-Server and a disposable local HTTP **Responses API SSE** model provider adapted from the official Codex SDK's test-harness pattern. No OpenAI/cloud request or real user files are involved. A synthetic `active` Goal starts a real automatic model Turn; the test holds the first SSE response in flight, invokes official `thread/goal/set({status:'blocked'})`, then releases `response.output_item.done` and `response.completed`. Real Host notifications confirm the **same Turn and model output item complete normally**, while its Goal stays blocked and the mock model receives no automatic second request. After the first App-Server has closed, an independent second App-Server resumes the exact persisted thread with blocked Goal intact, observes no model request, then explicit `goal/set active` triggers another autonomous model Turn. It is blocked at the in-flight boundary and completes normally; **exactly two** distinct model requests/Turn IDs are observed across both owners, with no unintended duplicate or third round. Native macOS 0.146.1 opt-in E2E PASS.

This is substantial proof of a **single-owner controlled synthetic model boundary** and cold-resume, but it is still *not* a proof that an Agent Picket outside controller can acquire and fence the live Host owner, that a running **tool** completes losslessly, that user consent is verified by Codex, or that concurrent owners cannot race. No production Codex automatic strike can be enabled on this evidence alone.

## 2026-10-13 · CRITICAL native negative result: concurrent independent Goal owners

`tests/codex-goal-multiowner-race.real.test.ts` reproduces a separate **cross-process ownership safety failure** using the same disposable home, local SSE model server and the official Codex 0.146.1 native binary. Process A sets an active Goal and its genuine autonomous model Turn remains **in flight** (server has not returned completion). Independent Process B opens that same disposable `CODEX_HOME` and calls official `thread/resume` for the same thread. B also emits `turn/started` and makes a **second independent Responses API request** for that SAME active Goal while A has not completed. Both are distinct native Turn IDs, not duplicated test event logs. This was observed in an isolated pre-commit native probe with 2 concurrent model requests. The entire scenario remains local, synthetic and uses read-only workspace policy; the two test responses are intentionally never completed or allowed to execute tools.

This reproduces the category of upstream Codex [#32793](https://github.com/openai/codex/issues/32793) on our pinned Host. A single owner process's ability to set/read `blocked` does not establish *global* ownership or linearizable inter-process exclusion. The release-readiness predicate now separately requires `exclusiveCrossProcessGoalOwnerVerified` and reports `multi-owner-fencing-unverified` without affirmative evidence. **Real Codex enforcement must remain OFF / NO-GO**, independent of the controlled SSE positive test. A supported Host-level singleton owner/fencing + CAS contract must precede a real-strike adapter; a front-end spinner or process termination is not a substitute.
