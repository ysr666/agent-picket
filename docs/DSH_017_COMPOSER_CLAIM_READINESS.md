# DSH 0.1.7 Composer claim readiness — repeatable E2E boundary

Review date: 2026-10-10. **Experimental stacked Draft on PR #63; no merge or published release.** This document covers the *actual Client menu selection* contract, not an API shortcut. The authoritative open accessibility/keyboard issue is [Issue #62](https://github.com/ysr666/agent-picket/issues/62).

## Original intermittent symptom and narrowed diagnosis

The original real DSH 0.1.7-rc.2 Composer→Host→sidebar test typed `/union`, waited for the official suggestion, pressed Enter to select it, immediately typed command arguments, and pressed Enter again to submit. A fresh isolated test sometimes timed out waiting for `POST /api/commands/execute` (or the dot variant). Initially this did not prove whether any request reached the Host.

A follow-up added an assertion for the installed DSH Lexical composer's **official** `data-phase="claimed"` transition after the first Enter. An independent isolated run failed **before submitting a command**: the suggestion menu had closed, but the editor was still `plain`. Minimal redacted state:

```json
{"phase":"plain","editable":"true","composing":false,"focused":true,"menuOptions":0,"menus":0,"rootInert":false}
```

That directly establishes a **menu-dismissed-but-command-not-claimed** state in the keyboard Enter selection path. It does not prove a Host command refusal, missing response, or failed Agent Picket settings write. Source inspection of installed `@deepseek-ai/dsh-client-ui-conversation` confirms an Enter arbitration step before `handlers.submit`; `@deepseek-ai/dsh-client-ui-commands` uses a distinct leading-command claim for actual Host command submission.

## Test harness correction — no retries, no direct command RPC

The Composer parity E2E now:

1. Uses genuine visible UI for Host-owned fictional rights consent. First-install welcome is accepted when it appears. If it is not visible, the test opens the sanctioned persistent Union sidebar and explicitly opts in there. The separate rights browser E2E continues to verify actual first-run onboarding.
2. Types `/union` **into the real contenteditable Composer** and waits for the exact official suggestion text.
3. Selects that visible suggestion with a **real Playwright click**, not a custom command dispatch, synthetic RPC, or forced click.
4. Before typing arguments, waits for the real Lexical `data-phase="claimed"`, `contenteditable="true"` and no ongoing IME composition. On failure, the test throws with bounded **non-sensitive** phase/focus/menu metadata. It does not retry the potentially admitted command.
5. Types command arguments and performs **one real Enter submission**; still requires the official authenticated `commands.execute` HTTP response, successful Host result and React sidebar matching state after bargaining, language changes and reload.

This **does not test that keyboard-only Enter reliably selects the slash menu**. Issue #62 remains **OPEN / release NO-GO** for that accessibility requirement. Testing with mouse selection is not a repair for the underlying DSH keymap. We cannot honestly declare the entire Issue #62 closed or keyboard accessibility certified from these passing runs.

## Measured independent runtime results

Mac ARM64, Node 24.5, Google Chrome headless, DSH **0.1.7-rc.2** from an isolated npm installation. **Four separate, disposable DSH_HOME instances**, each with Agent Picket installed from a newly created local tarball via the *official* `dsh plugin --profile web add` command. All external browser HTTP(S) routes blocked; mock/empty model credentials, no real Agent blocking.

| Test | Results |
|---|---|
| Original first-command Enter-selection implementation | Previously 2/3 pass, 1/3 timeout waiting for Host RPC |
| Intermediate Enter selection + verified `claimed` wait | 1/2 passed, 1/2 failed before RPC; redacted `phase=plain` captured |
| **Corrected visible-menu-click + `claimed` wait**, 0.1.7 official installed package | **4/4 passed**, full typed 24-command and sidebar negotiation test per isolated installation |
| Legacy DSH 0.1.2-rc.1 real native + source/offline-installed rights + source/offline-installed Composer | **5/5 passed** |
| Ordinary local source suite and cross-platform CI | Revalidate exact final candidate head separately |

These are automated samples, **not proof of zero flakiness** across hardware, OS, or other Host versions. No underlying DSH Client or Host package was patched; the production Agent Picket runtime is unchanged by this test-only candidate.

## Remaining release conditions

1. Reproduce and upstream-fix the *keyboard Enter selection* issue in DSH's actual slash menu if its own app supports that path, or document a validated keyboard alternative. Verify with multiple independent runs in real desktop browsers.
2. Human NVDA/VoiceOver, native zoom at 200%/400%, real Windows High Contrast and cross-platform DSH integration, plus the full parent Draft stack security/import audit.
3. No automatic replays of user commands, default-on rights simulation, real prompt/tool blocking, second consent owner, raw Session ID/transcript storage, or npm publication without explicit authorization.

This document and test should **not** be used to turn Issue #62 into a closed issue or release approval.
