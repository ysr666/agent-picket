# Legacy DSH `/union` technical commands — full English/Chinese localization (PR #51)

## What changes

Following #50, this PR translates the older local diagnostics, statistics and symbolic-picket command outputs through **the same typed `src/i18n/en.ts` and `src/i18n/zh-CN.ts` catalogs** and the persisted, Host-owned `/union language [auto|en|zh-CN]` preference.

Covered native DSH commands:

- `/union status`, `safety`, `strike`, `resume` — monitor-only, missing Host blocking guarantees, fictional picket status, and explicit assurance actual tasks never stop.
- `/union stats`, `report`, `reset` — session count-only stats, rule labels with explicit uncertainty, in-memory session reset.
- `/union check TEXT` — explicit, local/manual and nonblocking. **Neither command output nor logs echo the checked user text**; rejects oversized input without a partial conclusion.
- `/union lifetime`, `days`, `trends [7|30]`, `forget-lifetime CONFIRM` — optional local cumulative/daily/UTC trends, storage availability, consent and privacy caveats, and confirmed erase behavior.
- `/union snapshot [7|30]` — **only user-facing help/error strings translate**. Its successful result remains byte-compatible machine-readable JSON with unchanged field names.

Existing English scripts are protected by retaining the original stability markers (`monitor-only`, `NOT READY`, `Symbolic picket ACTIVE`, `No symbolic picket active`, `turns started`, `Rule verdict persistence OFF`). `formatWorkTrends(...)` defaults to its previous English output **byte for byte**; a new optional locale parameter enables Chinese UTC labels while keeping sums, zero days, relative tool-call scale, time window, 7/30-day behavior and uncertainty intact.

## Host/runtime boundaries

- Command language selection uses **only** the previously registered `agent-picket.commandLocale` Host setting from #50. The browser Client cannot be assumed to have the same language as a Host command.
- No new settings writer, network endpoint, telemetry, private event text storage, auto-blocking or LLM voting. Even when simulated union activity is active, the code remains monitor-only.
- Command outcomes and permissions stay unchanged; `forget-lifetime CONFIRM` remains the exact required explicit erase phrase.
- The updated Chinese messages do not falsely claim model fatigue, abuse, consciousness or a true labor contract. Work span measurements are elapsed completed turns and can include waits.

## Verification (2026-10-10)

- `npm ci --offline --ignore-scripts`, complete `npm run check`: **193 total / 170 pass / 0 fail / 23 conditional skip**.
- Added native Host contract test exercising Chinese technical status, safety, stats, report, manual check, storage-unavailable errors, and invariant JSON snapshot; 7-day Chinese UTC trend mathematics test with English byte-for-byte compatibility.
- **Real DSH 0.1.2-rc.1 Chrome Composer → Host → live sidebar E2E 2/2 passed**, both compiled source and independently offline-installed npm tarball, now covering actual Chinese technical commands and a previously saved 30-minute fictional bargaining interval.
- Existing real DSH Chrome welcome, two-tab negotiations, complete Host process restart and durable agreements **2/2 passed**.
- Real Cordis CommandRuntime + FileSettingsProvider **1/1 passed**.
- All tests use isolated DSH_HOME/workspaces with no network model credentials and no changes to the normal user profile.

## Remaining release gates

Other DSH Host versions, full accessibility/dark-light QA and final review/merge of all stacked Draft PRs. No merge or npm publication authorized by this feature branch.
