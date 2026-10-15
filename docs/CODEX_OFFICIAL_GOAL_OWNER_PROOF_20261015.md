# Codex official Goal owner-safety proof — 2026-10-15

## Decision

**Codex CLI 0.146.1 is NO-GO for Agent Picket autonomous real-strike admission and automatic Goal enforcement.** An official `thread/goal/get` readback or acknowledged `thread/goal/set` is not a global ownership lease, and persistence of a paused/blocked Goal across restarts does not prove safe live execution.

This is an **exact-version, cross-process safety finding**, not a general claim that official Codex Goals never work or that any later release is safe/unsafe without evidence.

## Official APIs and test scope

We use the unmodified **official Codex CLI 0.146.1 App-Server** through `thread/start`, `thread/goal/set`, `thread/goal/get`, and `thread/resume`. The test runs in an isolated temporary `CODEX_HOME`, with a synthetic loopback-only model endpoint, no real user data, live model inference, installed user Hooks, or tool actions.

- **Positive, narrowly scoped:** paused/blocked *idle* Goal state, two threads' separation and readback after **two full App-Server restarts**, on Windows, macOS and Ubuntu: [#167](https://github.com/ysr666/agent-picket/pull/167), [official native CI run 38736104012](https://github.com/ysr666/agent-picket/actions/runs/38736104012), **10/10 PASS** across the whole native matrix.
- **Negative, release-blocking:** two independent native App-Server instances sharing one disposable `CODEX_HOME` each begin a distinct **automatic Goal Turn** for the same active Thread, while the first model request remains incomplete. Reproduced on **Windows, macOS and Ubuntu**: [#168](https://github.com/ysr666/agent-picket/pull/168), [official native CI run 38737460809](https://github.com/ysr666/agent-picket/actions/runs/38737460809), **11/11 PASS** across the whole matrix. A passing *negative* regression means the bug was reproduced, **not** that the Host is safe.
- The three-OS native reproduction was submitted to the already-existing [official upstream Codex Issue #32793](https://github.com/openai/codex/issues/32793#issuecomment-6192556466), instead of opening a duplicate bug.

Both test results are real official Host observations. The tests do **not** demonstrate actual simultaneous shell tools on Windows; they prove two distinct automatic Turns and two loopback model requests before either is completed.

## 1.0 release evidence contract

`release/first-release-evidence.json` retains the existing 4-client × 3-OS requirements. For each Codex OS, it now also records:

- `officialHostVersion`: the exact tested CLI version, not merely a GitHub Actions runner type or a package range;
- `exclusiveLiveGoalOwnership`: **verified independent positive** evidence that two native owners cannot execute a Goal concurrently and cannot race after crash/restart;
- `atomicGoalStateTransition`: **verified independent positive** evidence of revision-fenced/conditional updates that cannot override a newer stop/consent state.

The current 0.146.1 cells remain **not verified**, and the release script explicitly rejects that exact known-unsafe build even if a manifest has been manually set to `verified` or signed off. The release checker does not treat the negative test success as either positive guarantee. A later Host version needs actual, per-OS proof; changing a version string alone does not satisfy the additional proof fields.

These constraints complement, rather than replace, existing human provenance, informed consent, UI notice, no-loss text-and-attachment recovery, and accessibility gates. **Real enforcement stays OFF**, and `npm run release:gate` intentionally returns NO-GO.

## Future official Host remedy to verify

Prefer an upstream **single mutation-capable owner / cross-process lease**, atomic Goal state CAS with a monotonic consent/stop epoch, and a tested owner transfer/recovery protocol. A single managed app-server with attached clients can be an operational workaround, **not** evidence of safety for arbitrary independent App-Servers. Test genuine Windows/macOS/Linux process competition, crash/restart, and queued input/recovery before updating this manifest.

No private prompts, file paths, account IDs or raw input are attached to the upstream report.
