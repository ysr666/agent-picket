# Agent Picket — Two real Chrome tabs, one official Goal resume revision

2026-10-13 · P0 test-only continuation of [PR #133](https://github.com/ysr666/agent-picket/pull/133), still strict 1.0 **NO-GO**. No new enforcement power.

## Safety question

If two Web Client tabs both render a durable `phase=blocked`, `picket-work-limit` Goal at the same Host revision and their users simultaneously press the V12 Union HQ “Resume this Goal” button, does the Host progress twice, replay input, or incorrectly leave a stale actionable stop? The answer requires actual browser and official Host evidence, not only a mocked `Promise.all` unit test.

## Procedure

The isolated actual-Host Web E2E already tests one-click consent, actual offline Goal round, test-only synthetic true-format 8h UTC DurableStats and official Host durable block at rev2. New strictly opt-in `PICKET_GOAL_RACE_E2E=1` adds:

1. Start a **second genuine Chromium browser tab** with the same temporary authenticated Host profile, select the **same real existing Session**, and wait for the **real V12 HQ stoppage card** and Resume button in each tab.
2. Issue the two user-facing button clicks through real Playwright interactions with `Promise.allSettled`, after both buttons are visible. The test permits a late second click to fail safely if another tab removes its action first; this is not evidence of two successful Remote RPC writes.
3. Poll the **official Host `goals/get`** from the original tab. Require exact `revision=blocked.revision+1` (not merely greater), `phase=active`, `activation=armed`, `blockedReason` cleared. Require both tabs' stale blocked Goal cards disappear; no plugin input replay.
4. Run optional `PICKET_GOAL_RESTART_E2E=1` first to test the even harder combination: **full official Host process restart followed by two concurrent real tab recovery clicks**. Uses disposable `DSH_HOME`, reauthenticates to the new Host and verifies durable state before either click.

## Actual measured results

| Host | Conditions | Both real-tab user clicks | Official Goal after recovery | Result |
|---|---|---|---|---|
| DSH **0.2.0-rc.2** | One official Host, actual blocked Goal | Both UI clicks fulfilled | Only rev2 → rev3; `active/armed` | **PASS** |
| DSH **0.2.1-alpha.2** | **Cold Host restart**, fresh authenticated Web UI, both tabs | Both UI clicks fulfilled | Only rev2 → rev3; `active/armed` | **PASS** |

The two clicks do not prove that both RPC requests actually reached the server: the Client may recognize a Host projection update and fail closed before attempting a stale write. What **is** proven is that a pair of real, independently rendered UI actions cannot advance the durable official Goal by more than one version in these controlled runs.

Test enablement: `PICKET_GOAL_WELCOME_E2E=1 PICKET_GOAL_RECOVERY_E2E=1 PICKET_GOAL_RACE_E2E=1`, optionally `PICKET_GOAL_RESTART_E2E=1`. Ordinary CI does **not** launch a real DSH process without explicit opt-in. All worktime data are synthetic test fixtures, not a real eight-hour continuous agent run.

## Remaining P0 NO-GO

Two-tab recovery success is not proof of arbitrary numbers of clients, hostile network partitions, alternate account permissions, process kill -9, Windows NTFS crash consistency, general-prompt with raw attachments lossless interception, DSH Desktop, Codex/Claude, human AX or full supported-version attestation. PR #131-134 stack remains Draft; do not automatically merge, tag or publish.
