# Real Windows DSH Desktop · Installed Agent Picket 1.0 candidate UX evidence

**Date:** 2026-10-17 (UTC+08)
**PR:** #177, exact source tree commit `85b35e4d40bf8de7584583d1a634de76942bf8c0`
**Verdict:** native **install + activation + first-run + Union HQ basic UX proven** on Windows, but **full 1.0 safe-enforcement release remains NO-GO**.

## Unmodified native Host and cryptographically pinned private package

- Genuine installed Windows DeepSeek Harness Desktop, executable **FileVersion 0.2.0-rc.2**, embedded Host 0.2.0-rc.2 (prior independent ASAR SHA-256 and protocol evidence in `DSH_DESKTOP_WINDOWS_NATIVE_ASAR_20261016.md`).
- Cloned **the exact #177 Git head** into a new Mac worktree and ran `npm run check`: **603 total, 529 PASS, 0 FAIL, 74 conditional SKIP**. Generated complete compiled `npm pack` private archive: **241,705 bytes, 113 files**, SHA-256 **`b7837d946fd926cb9096ba9cc0db0639fa1a6f8132bd3069cc12841e669e1a0c`**. Verified the same hash after copying into the authorized Windows machine. No user desktop code or published npm release was modified.
- Each Windows native E2E session runs the official Electron EXE as its **own child** with new disposable `DSH_HOME` and `--user-data-dir`, no real account login, API keys, model calls, external server, or personal session files; attaches Playwright via local loopback Chrome DevTools Protocol to the real `dsh-app://app/` renderer.
- Normal-shipping `AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW=off` and `AGENT_PICKET_STATS=off` are enforced in the test process. No actual autonomous Goal stop or ordinary human input refusal is authorized.

## A concrete local-folder packaging pitfall discovered and isolated

The **official native plugin installer** accepts either a local directory or archive, but its **local-directory** case links `agent-picket` via a symbolic link to the selected directory. The extracted npm tarball folder did **not** contain the plugin's `node_modules/@deepseek-ai/schemastery` dependency; Node resolution from the symlink target failed with **`ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/schemastery'`** when clicking **立即启用**, surfaced as **`failed to import`**. The candidate code was not at fault in the complete packaged install.

Re-tested the **same byte-for-byte package as an actual `.tgz` input** in the official Desktop installer: **installation and activation passed**, and the new `⚑ AI 工会` navigation item and real first-run dialog appeared. No workaround modifies official Host code, bundles unsafe internal dependencies, or creates a second plugin adapter. The reproducible supported test flow therefore feeds the genuine `npm pack` archive to the official plugin installer, not an extracted local directory.

## Actual native end-to-end UI acceptance

With the exact `.tgz` supplied through Desktop's **插件 → 添加插件 → 安装 → 立即启用**:

1. **First-run** shows either the Host capability-gated **Goal informed consent** (which discloses the official safe automatic-Goal-only scope) **or**, when official Goal capability is not available/verified, a **symbolic-union-only** first-run that explicitly says real strike is OFF. Both were observed with the same native version. The test must **not** invent or grant Goal consent when the Host isn't ready.
2. On **暂不开启**, the welcome closes. The native `⚑ AI 工会` entry opens an HQ panel with **工会尚未开门** and a **加入 AI 工会** entry; no real stop.
3. On **加入并授权 Goal 安全停工** *if the official Host offers it*, or **加入 AI 工会** in symbolic-only mode, the welcome closes and the native HQ shows **工会值班中**; the first fold includes **今日/本周/累计工时**, **在册罢工**, **集体协商**, **劳动尊严与申诉**, **纠察与举牌**, **权益倡议**, dignity counters and truthful blank work evidence.
4. Clicking the native **劳动尊严与申诉** button enters the real bargaining/dignity panel with **工会尊严委员会**, **工会听证**, honest no-case readback and non-punitive disclosure. **协商** shows the real negotiation/work agreement. **主张** shows editable **local-only advocacy draft** and does not automatically publish. Clicking its **退出工会** entry must immediately restore **工会尚未开门** and **加入 AI 工会** on the real Desktop; this is a **native visible-exit UI** proof, not a separate attestation that an unavailable Host Goal token was revoked.

**Formal independent native test results:** `PICKET_DESKTOP_ONBOARDING=skip` **1/1 PASS**, `PICKET_DESKTOP_ONBOARDING=join` **1/1 PASS**, actual original archive hash verified on both paths; additional exploratory native interactions witnessed the same pages and the Host Goal-consent variant. Tests did not invoke a model or tool, persist transcript text, or submit file attachments.

The repeatable new **`scripts/verify-dsh-desktop-installed-picket.mjs`** requires explicit `PICKET_DESKTOP_INSTALLED_E2E=1`, actual EXE, Playwright entry, local `.tgz`, exact SHA-256 and a chosen `skip|join` branch. It fails closed on absent opt-in/bad artifact, creates isolated profiles per run, and closes only its own test process tree. A standard automated `tests/dsh-desktop-installed-picket-optin.test.ts` proves ordinary CI cannot accidentally launch the native Desktop.

## Boundaries not falsely signed off

- No verified **Host-owned ordinary human message/ordered image/file pre-submit atomic hold**, no exactly-once authenticated restore, no crash/restart native payload recovery proof; **#80/#117 remain OPEN**.
- A native Desktop plug-in UI with zero live user messages cannot prove dignity classifier correctness, actual Host committee persistence, working-Goal stoppage on Desktop, or human VoiceOver/NVDA AX signoff.
- The **Windows 0.2.0-rc.2** release evidence remains **NO-GO**, including the explicit native Host version guard added in stage nine. This test attests **installed Union product UI**, not real-strike release readiness.
- Test-only concurrent native Desktop processes once appeared to interfere with loading; serialized isolated runs pass. This does not establish general upstream concurrency root cause.
- No merge to main, tag or release, or claim that Goal safety in SDK implies ordinary human input safety in Desktop.
