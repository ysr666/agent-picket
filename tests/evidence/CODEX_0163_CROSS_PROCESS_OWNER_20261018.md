# Codex 0.163.0: independent App-Server Goal writer ownership (2026-10-18)

## Actual change versus the pinned negative baseline

The original official Codex 0.146.1 two-process reproduction remains a **negative** safety proof: separate native App-Servers in one disposable CODEX_HOME can each start a live automatic Goal turn and call an offline synthetic Responses server concurrently. Passing that old test is NOT safe Host admission.

The official Codex 0.163.0 published package changes the observed behavior in the exact same topology. The focused **positive** native test is tests/codex-goal-exclusive-owner.real.test.ts in the existing Codex official Host CI workflow. It runs on **Windows, macOS and Ubuntu**, alongside (not instead of) the existing 0.146.1 positive/negative probes. It uses a disposable home, shared synthetic local Responses endpoint, no real credentials, model-network activity or tools.

1. App-Server A starts an active Goal and remains in a pending offline Responses request.
2. Independent App-Server B shares A's CODEX_HOME and attempts thread/resume. The official Host must return a **writer conflict**, emit zero extra started turns and leave model request count at **one**.
3. After A's process terminates, B retries thread/resume. It must succeed, with exactly **one** resumed Goal turn and one subsequent model request.
4. Both native Host processes, the isolated HTTP server, and test-owned files are closed; Windows transient file handles have bounded retries. Existing Windows watchdog independently kills the entire child tree and fails the job on timeout.

Upstream official merged single-writer changes:
- https://github.com/openai/codex/pull/34986
- https://github.com/openai/codex/pull/36389

Original upstream report: https://github.com/openai/codex/issues/32793

## Observed scope

- Windows native official Codex 0.163.0 local independent-host run: **1/1 PASS, 0 FAIL**, including CODEX_CROSS_PROCESS_GOAL_DUPLICATE_DENIED (one model request), followed by CODEX_CROSS_PROCESS_GOAL_COLD_TAKEOVER_PASS (two total after owner release).
- Official GitHub Actions run https://github.com/ysr666/agent-picket/actions/runs/39063952178 verifies the **0.163.0 positive ownership test across Windows/macOS/Ubuntu (3/3 PASS)**. Exact commit carrying tested source: a8733683a144538c3cde708d90e1a55093fa7e64.
- The original 0.146.1 negative race test remains in the official three-OS matrix; its success is not reinterpreted as safety.

## Remaining independent blockers — NO-GO

Cross-process writer exclusion is **not** an API for a remote union plugin to atomically mutate a running Goal. A conditional/version-fenced update of stop/consent state was not proven, nor Host-issued human consent, lossless ordinary prompts with ordered attachments, nor a live tool boundary stop across every client. An acknowledged thread/goal/set write alone is not a guaranteed strike transition.

Keep inspectCodexGoalHoldSafety conditionalCommitVerified=false and durableLosslessRecoveryVerified=false until separate genuine official Host E2E proves them. The Agent Picket 1.0 release gate remains NO-GO; no production physical strikes, no removing the old version's known-bad guard, no main merge/tag/npm publish.
