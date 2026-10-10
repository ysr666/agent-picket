# DSH slash-menu readiness vs actual keyboard admission

**2026-10-10.** Experimental release verification only. This does **not** patch DSH or certify its keyboard accessibility.

Tracked investigation: [Agent Picket Issue #62](https://github.com/ysr666/agent-picket/issues/62) and [upstream DSH Discussion #9354](https://github.com/deepseek-ai/deepseek-harness/discussions/9354).

## Why the previous real E2E could falsely fail

The installed DSH input-trigger Client is asynchronous and refreshes candidate sources after a slash token changes. DSH upstream `packages/client/ui-input-trigger/src/client/MenuView.tsx` deliberately renders **a loading indicator and no `role=option` rows** when `group.status === 'pending'`, and renders buttons with `role=option` only in the **ready** branch. The menu reducer's `hit` transition marks groups pending. This is an **expected intermediate render state**, not by itself proof of a user-visible keyboard selection defect.

The prior keyboard-only E2E:

1. Typed `/union` into real Lexical, waited until its official suggestion description appeared.
2. Waited for an option row to become visible.
3. Immediately made a **separate** `options.count()` call and threw if zero.

An asynchronous group refresh between steps 2 and 3 can legitimately produce a temporary **zero-row** list before Enter is pressed. In one previous four-profile matrix, this produced **1/4 pre-Enter failures on 0.2.0-rc.2 and 1/4 on 0.2.1-alpha.2**. Those assertions demonstrate a **test sampling race**, not an independently verified Host rejection or keyboard Enter defect.

## Corrected, fail-closed real browser gate

The test still types `/union` with actual per-character keyboard events. Before ArrowDown/Enter, it now waits (bounded 12 seconds) for a **real, ready rendered DOM option row belonging to the exact official `/union` suggestion**. That observation is **not a retry or replay**: no command was submitted or picked while the input-trigger was pending.

Only after a real option is present can it try ArrowDown navigation. It requires `aria-selected=true` on the intended row, captures privacy-safe pre-Enter state, sends **one** actual keyboard Enter for selection, and demands native Lexical `data-phase=claimed` before typing any command arguments or submitting one keyboard Enter. It does not use pointer fallback, direct command RPC, synthetic Host consent, arbitrary fixed sleeps or an automatic redo of an uncertain submission.

If a ready option never returns before its deadline or a highlighted Enter still does not produce a claim, the keyboard gate **fails** with only phase/focus/menu counts. Those would require distinct upstream investigation and cannot be silently treated as passing.

## Historical samples vs new corrected samples

Do not aggregate unlike test versions into a single success rate. The earlier **0.2.0-rc.2 5/5 PASS**, **0.2.1-alpha.2 3/5 PASS, 2/5 FAIL after Enter with no claim**, and later pre-Enter zero-row samples are preserved in the repository's release history. The post-Enter failures remain unresolved; this test correction only addresses the transient pre-Enter zero-row sampling.

The first independently installed correction run passed **4/4 on 0.2.0-rc.2 and 4/4 on 0.2.1-alpha.2** through the full real keyboard-only Composer→Host→Union sidebar route. Further independent samples should be recorded separately, **including every failure**. A finite successful test sample is not proof that intermittent keyboard issues no longer exist.

## Release scope

- Real official DSH and browser test is **opt-in** through `scripts/verify-dsh-keyboard-matrix.sh` and `PICKET_RUN_DSH_KEYBOARD_E2E=1`; the default lightweight CI still deliberately skips it.
- DSH itself is not modified in this Agent Picket branch. The user's actual installed DSH environment is not upgraded; all qualifications use isolated npm prefixes and disposable `DSH_HOME`.
- Real Agent prompts/tools remain untouched. No key/token, prompt text, tool args or raw Session ID recording. A Host setting only represents a simulated opt-in union feature.
- Upstream Discussion #9354 should explicitly **correct any prior claim** that temporary zero candidates before Enter independently prove a bug on `npm latest`. It may continue tracking separately captured menu-closed/no-claim events if source-level root cause is still unknown.
- Physical VoiceOver, NVDA, true browser zoom and Windows High Contrast, stacked Draft audit and release authorization all remain outstanding.
