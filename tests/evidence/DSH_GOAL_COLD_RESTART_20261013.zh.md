# Agent Picket — official DSH Host cold-restart Goal stoppage/recovery E2E

2026-10-13 · test-only follow-up to [#132](https://github.com/ysr666/agent-picket/pull/132); **Draft/NO-GO**.

## Why this test exists

Previous 1.0 P0 browser checks confirmed official Host Goal CAS and UI recovery during a single Host process lifetime. They did **not** prove that a genuine blocked Goal persisted across a whole DSH Web Host process exit/restart, or that the Union HQ could recover it through the official service after reconnecting. A browser page reload is not a Host cold restart.

## What was executed

The existing strictly opt-in test `tests/dsh-goal-welcome.real.test.ts` now accepts `PICKET_GOAL_RESTART_E2E=1` together with `PICKET_GOAL_WELCOME_E2E=1` and `PICKET_GOAL_RECOVERY_E2E=1`. In a freshly created system-temp `DSH_HOME` it installs the actual npm package through the official DSH CLI plus a local offline test provider. The eight-hour UTC completed-turn fixture is **synthetic** but stored in the real DurableStats writer format.

1. Launch official DSH Web Host and authenticate the temporary browser. In a real Session, one explicit V12 click writes both Host-owned consent fields through one CAS. One actual offline Goal round completes and the Goal is blocked by the production `picket-work-limit` safe boundary at Revision 2.
2. **Terminate the original DSH process with SIGTERM** and wait for it to exit. Launch a fresh official DSH process with exactly the same disposable DSH_HOME; do not reuse the previous process, fake the Goal projection, or skip real authentication.
3. Exchange the new process's genuine login token for its auth cookie. Verify persistent `welcomeDecision=enabled` and `realGoalStrikeConsent=authorized-v1` from the new **official settings/describe** endpoint. Re-read `goals/get` from the new process, assert actual `phase=blocked`, `blockedReason.code=picket-work-limit`, `revision=2`, `roundsStarted=1`.
4. Reopen the native Chrome Web Client on the new Host origin, select the exact existing Session, navigate to real V12 Union HQ, click “恢复此 Goal 的自动工作”, then read official `goals/get` again. Require `phase=active`, `activation=armed`, `revision=3`, blocker cleared, and the visible stoppage card removed. No raw user prompt replay by Agent Picket.
5. Close Chrome and the restarted Host, remove the disposable profile. External web origins are disallowed.

### Actual results

| Official pinned Host | Real block before exit | Authorization + blocked Goal survived process restart | V12 manual official Goal resume after restart | Test |
|---|---|---|---|---|
| **0.2.0-rc.2** | rev 2, blocked | rev 2 blocked + authorized-v1 | rev 3 active, armed | **PASS** |
| **0.2.1-alpha.2** | rev 2, blocked | rev 2 blocked + authorized-v1 | rev 3 active, armed | **PASS** |

**Important Host nuance discovered:** the official settings revision number itself is **not guaranteed to be globally monotonic across full process restarts** in these pinned Host implementations. The initial test's assumption that the new settings revision must exceed the prior process's revision was false. Correct assertion: validate the new Host's *actual persisted authorization values* and valid local CAS state; separately assert the Goal's actual durable revision and identity. Do not fabricate a cross-process monotonic settings CAS guarantee.

## Boundary / NO-GO

This is one explicit clean process exit/relaunch in a disposable macOS DSH **Web/Chrome** profile on two pinned DSH versions. It is **not** proof of process kill -9/power-loss recovery, Windows NTFS crash consistency, concurrent writers, multi-tab stale recovery, DSH Desktop, Linux, Codex, Claude Code or real general-chat lossless holding. The eight-hour work fixture is synthetic; real Host and browser interfaces are used. User must still opt in, and new incoming prompts are not rejected. Tests are **gated**, not part of ordinary CI, to avoid installing a real DSH process on public runners.

No release approval. `release:gate` remains **NO-GO**.
