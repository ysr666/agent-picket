# DSH Desktop · Windows native installed artifact safety audit (2026-10-16)

**Verdict: scoped negative evidence, NO-GO for ordinary human pre-submit refusal.** This does **not** certify a live Desktop human UI flow or replace full four-client × three-OS acceptance.

## Official native artifact and source of truth

- Tested actual installed **DeepSeek Harness.exe** on Windows build **26200**; EXE FileVersion **0.2.0-rc.2**. Desktop installer `version` file contains **44.0.0** (separate installer metadata, not the DSH protocol version).
- Read **only** `%LOCALAPPDATA%\\Programs\\DeepSeek Harness\\resources\\app.asar`; SHA-256: `983CA71114E6DFD353FC79AF5A1F9481A250EE64C2A3C757673029B811B23BC2`.
- Its embedded official `dsh/desktop-runtime.json` declares **DSH 0.2.0-rc.2**, protocol **4**, Windows x64. The **actual embedded** `dsh-desktop-host`, `dsh-client-ui-conversation`, `dsh-api-session-controller` package versions all match `0.2.0-rc.2`.
- Parsed with a separately installed `@electron/asar` reader in a disposable temp directory. **No user `.dsh` profiles, user prompts, files, credentials, account stores, or native settings were read or mutated. No custom Host hooks were installed.**

## Native bundled code facts (not speculative Web parity)

1. Desktop Host `lib/index.js` uses its official `async function apply(ctx, config)` and `workspaceDependencies`; this establishes a real bundled Desktop Host plugin assembly.
2. Desktop's **actual bundled** Conversation Client `lib/client.js` computes `disabled = ... || blocked !== void 0 || ...`, but its independent `async send(text)` invokes `this.scopedSession("send").prompt(..., "queue")`. A blocked Composer affordance **cannot be treated as the authoritative admission boundary**.
3. Desktop's bundled Session Controller `lib/client.js` has `beginSubmission(input)` and transient `pendingSubmissions`, but there is no identified `holdCurrentAttempt` / `holdSubmission` / `resumeHeldSubmission` / `resumeOnce` Host receipt in those inspected Client send contracts. An echo/abandon path is **not** a durable original payload and ordered-attachment hold/resume protocol.
4. **Static inspection cannot prove the absence of every possible internal Host entry point.** It also cannot prove genuine human provenance, byte-exact original attachment retention, mandatory refusal notice, crash recovery, or exactly-once resume. None of those unverified properties can be promoted to `verified` by finding an API name.

`scripts/inspect-dsh-desktop-asar.mjs` is a portable **read-only and fail-closed** audit; `--require-safe-hold` intentionally returns exit code **1** for this installed build.

## Tested code and independent release barrier

- On this actual Windows installation, **8/8 Node tests pass, 0 fail**: three Desktop asar audits (including native bundle) and five release-gate tests. Standalone `inspect-dsh-desktop-asar.mjs` returns `officialDesktopHostPlugin=true`, `composerBlockOnlyUi=true`, `directConversationSend=true`, `transientSubmissionEcho=true`, `identifiedAtomicPreSubmitHoldReceipt=false`, `verifiedSafeHold=false`, `releaseDecision="NO-GO"`.
- `scripts/check-first-release.mjs` now requires **exact Desktop Host version per Windows/macOS/Linux** plus **per-OS real Host-owned pre-submit hold** and **exactly-once ordered attachment recovery** attestations. The known Windows installed **0.2.0-rc.2** is explicitly rejected even if a synthetic/optimistic release manifest were otherwise complete, paralleling the known-buggy Codex 0.146.1 safeguard.
- `release/first-release-evidence.json` records the **exact Windows Desktop 0.2.0-rc.2** and keeps the two new safety guarantees **not verified**; macOS/Linux native Desktop versions remain unspecified/unverified rather than guessed.
- The synthetic future-version `9.999.0` positive test validates **evidence-shape logic only**. It is not an assertion that any real DSH build is safe.

## Still required

**Issue #117/#80**: live native Windows Desktop no-loss pre-submit user text + ordered image/file E2E with **zero model/tool calls while held**, visible host-owned notice, original-byte retention through crash/cold restart, exactly-one resumed submission, cross-tab conflict and revoke/OFF. Repeat genuine Desktop acceptance on macOS and Linux; investigate whether newer official Desktop packages ship a verified atomic Host hold. Do not reuse Web tests as Desktop approval.

**No merge/release authorization.** PR #177 remains Draft and the 1.0 gate stays NO-GO.

## 2026-10-16 · Actual isolated Windows Desktop renderer / plugin manager smoke

The same **genuine Windows 11 Desktop 0.2.0-rc.2** was launched as a new native Electron child process with **both `DSH_HOME` and `--user-data-dir` under two new disposable test-only directories**. Local-only Chromium CDP was bound to `127.0.0.1`; Playwright attached to the real `dsh-app://app/` window, **not** a Web site or mocked HTML. After the official shell initialized, the test actually clicked the native **插件 / Plugins** button and **添加插件 / Add Plugin**, and verified the accessible **包名或地址 / Package name or address** field, **安装源 / Installation source** selector, and **来源可信 / trusted-source warning**. No plugin was installed, no API key entered, no model/tool request, and no existing user account or profile was used.

The reproducible opt-in executable test is `scripts/verify-dsh-desktop-native-ui.mjs`. It requires `PICKET_DESKTOP_NATIVE_UI_E2E=1`, an explicit official EXE path and a separately installed `playwright-core/index.mjs`. It creates a fresh per-run DSH home and Electron userData, dynamically allocates a loopback port, waits for the native renderer, exercises the official plugin manager, and terminates **only its own child process tree** before clearing disposable directories. A separate `tests/dsh-desktop-native-ui.test.ts` proves that ordinary CI/test invocation **without explicit opt-in fails closed before launching Desktop**.

**Native Windows results:** once the earlier disposable manual Desktop test instance was closed, two **serialized** fresh native GUI invocations completed successfully in approximately **7.5 seconds each**, proving the real plugin-manager and installer-dialog interaction. With a separate disposable Desktop process concurrently alive, a new fresh instance could remain at **HARNESS · Loading plugins…** and did not expose the plugin button within 15–60 seconds. This is **not yet conclusive evidence** of a general Host concurrency bug; the observed setup requires dedicated investigation before filing an upstream defect. It cannot be waved away as a successful cold boot either.

**Scope restriction:** this is **only real Desktop shell / plugin installer UI smoke**, *not* an Agent Picket UI test: the latest private Picket tarball was not available on the Windows machine, so it was **not installed** into this Desktop test profile. It does **not** prove Picket's first-run consent, union HQ, dignity hearing, human text+attachment atomic hold, model-not-called invariant, or exactly-once recovery on Desktop. The native artifact's `verifiedSafeHold:false` and the release **NO-GO** gate from the previous sections remain unchanged. Never equate official plugin manager availability with real-strike safety.
