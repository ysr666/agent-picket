# DSH 0.2 current-version real keyboard qualification

**As of 2026-10-10, experimental Draft release gate, NOT a release.**

This is the tested boundary behind [Agent Picket Issue #62](https://github.com/ysr666/agent-picket/issues/62) and upstream [DSH Discussion #9354](https://github.com/deepseek-ai/deepseek-harness/discussions/9354). The upstream Discussion was **corrected** from an old 0.1.7-only claim after independent current-version real-browser testing.

## Current tested npm tags (2026-10-10)

- npm `@deepseek-ai/dsh` `latest` / `next`: **0.2.0-rc.2**.
- npm `alpha`: **0.2.1-alpha.2**.
- Older comparison: **0.1.7-rc.2** (and historical 0.1.2-rc.1).

In the initial DSH 0.2 full keyboard-only matrix (fresh isolated npm prefix per DSH version, fresh DSH_HOME for every case, Agent Picket installed with official DSH `plugin --profile web add`, real Chrome, no model credentials, off-loopback browser requests blocked):

| DSH release | Genuine keyboard-only Composer → Host → Union sidebar | Conclusion |
|---|---|---|
| **0.2.0-rc.2** | Earlier **5/5 passed**; new independent matrix **3/4 passed, 1/4 failed** | **Current npm latest ALSO reproduces candidate disappearance before Enter** |
| **0.2.1-alpha.2** | Earlier **3/5 passed, 2/5 failed**; new matrix **3/4 passed, 1/4 failed** | Confirmed current alpha regressions (after-Enter plain phase and before-Enter missing options) |
| 0.1.7-rc.2 | Earlier 2/3, 1/2 and 2/3 samples with failures | Historical predecessor evidence; not a substitute for latest-version verification |

The earlier two 0.2.1-alpha.2 failures happened **before the Host command RPC**, after Enter failed to produce a claim: the editor remained `phase=plain`, with zero option/highlight rows in bounded snapshots. In the newer 4-profile matrix, **both 0.2.0-rc.2 and 0.2.1-alpha.2 each failed once before Enter** because the suggestion candidate list became empty after the target description was visible. These are related observations but **not proven to be one root cause**. Never log draft text, cookies, user prompts, credentials, raw Session IDs or tool arguments.

## Version-aware real Client bootstrap

DSH **0.1.x** and **0.2.x** sometimes render a visible Union launcher behind official first-run onboarding or Preview Notice overlays. A naive wait for a visible launcher can incorrectly select that obscured control. The real Composer E2E now waits for actual visible **Continue → Skip provider** controls and activates them if they are present, instead of assuming the wizard exists or does not exist based on version. Both versions still grant fictional labor rights through **explicit visible UI**, not direct Host settings RPC or default-on simulation. The separate matrix runner records the actual DSH executable version but does not guess onboarding state from it.

## Repeatable matrix runner

Run from the Agent Picket checkout containing the candidate code:

```bash
export AGENT_PICKET_DSH_BIN=/absolute/path/to/isolated/node_modules/.bin/dsh
export AGENT_PICKET_DSH_HOST=/absolute/path/to/isolated/node_modules
export AGENT_PICKET_PLAYWRIGHT_ENTRY=/absolute/path/to/playwright-core/index.mjs
export AGENT_PICKET_CHROME_BIN=/absolute/path/to/Google-Chrome
export PICKET_DSH_MATRIX_RUNS=4
bash scripts/verify-dsh-keyboard-matrix.sh
```

The script:
- Obtains the actual DSH executable version, rather than assuming npm tags or silently changing the user's existing installation.
- Packs only the local private experimental candidate, installs into **a separate temporary DSH_HOME per run** via official `dsh plugin`, and uses the true **keyboard-only** Chromium E2E with `PICKET_RUN_DSH_KEYBOARD_E2E=1`.
- Requires real per-character `/union` typing, ArrowDown/Enter menu selection, Lexical `claimed`, then a **single** keyboard Enter per native Host command.
- Reports the **entire** pass/fail count and exits **nonzero if any run fails**, preserving bounded per-run local diagnostic logs. It never replays a user command after an uncertain Host admission.
- Does **not** run in the lightweight default GitHub Actions CI. A green lightweight CI is not a successful real keyboard qualification.

The script needs existing authorized Chrome and Playwright paths and an isolated DSH npm installation; it **does not** automatically download or switch your installed DSH version. Its deliberately bounded 1–16 iterations and isolated Profiles are meant for manual release qualification, not continuous background testing.

## Upstream analysis caution

Master `d7432673` with `ui-input-trigger` version 0.2.1-alpha.2 contains an **intentional** `arbitrate('enter')` `pending → consumed` branch, and a unit test asserting that *pending Enter keeps the menu open*. That alone does not explain the distinct **menu closed + still plain** real-browser event. `settle()` closing the menu **before** a stale-span revision check fails in `beginCommand()` is a more precise candidate, **not yet a confirmed sole root cause**. Upstream has been informed in Discussion #9354.

## Release blockers

A fail-closed upstream keyboard Enter fix or independently validated accessible alternative; repeated tests on the exact proposed shipping DSH release; physical NVDA/VoiceOver, native 200%/400% browser zoom and Windows OS High Contrast; full canonical stacked Draft PR review and package-root import compatibility; and explicit maintainer approval. No merge to `main`, npm publish, new Host RPC, real Agent task blocking or optimistic consent.
