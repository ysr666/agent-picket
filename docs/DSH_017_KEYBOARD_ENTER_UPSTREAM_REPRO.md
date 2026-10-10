# DSH 0.1.7: intermittent keyboard Enter selection in slash menu

Date: 2026-10-10. Status: **unresolved DSH keyboard accessibility release blocker**. Local tracking: https://github.com/ysr666/agent-picket/issues/62. Upstream: https://github.com/deepseek-ai/deepseek-harness. Intended as a source-backed bug report for the upstream maintainers. No upstream files were modified.

## Environment and observed failure

Official DSH **0.1.7-rc.2**, macOS ARM64, Node 24.5, real Chrome headless, isolated fresh DSH profiles and locally packed Agent Picket installed via the official DSH Web profile command. No real model credentials or off-loopback browser HTTP requests.

The test types "/union" in the real Lexical Composer and waits for the official command suggestion. Keyboard Enter to select it occasionally **dismisses the menu without transitioning to data-phase="claimed"**. The next Enter then cannot execute the expected command request. Recorded safe state following an unsuccessful selection:

- phase=plain, editable=true, composing=false, focused=true
- menuOptions=0, menus=0, rootInert=false
- no recorded command response

Another run saw the native menu shell with only the section headings "指令" and "技能" and **zero role=option candidates** after the suggestion had earlier been visible. The appearance of a description is therefore not enough to guarantee keyboard-selectable candidate readiness.

## Confirmed source behavior and hypothesis

Installed package: @deepseek-ai/dsh-client-ui-input-trigger. In InputTriggerController.arbitrate("enter", composing):

- No highlight: pass.
- A highlighted candidate whose group status is not "ready": consumed **without a pick**.
- Ready candidate: pick and return "pick-highlighted".

menuReduce can put a formerly ready group into "pending" while preserving highlight during candidate refresh. The installed @deepseek-ai/dsh-client-ui-conversation Lexical keyboard handler prevents Enter defaults after consumed arbitration. This can silently lose the selection during a pending-refresh window. A stale-span pick rejection is another possibility; the evidence does not prove every incident has the same root cause.

## Measured independent fresh-profile samples

| Selection and check | Pass | Fail |
|---|---:|---:|
| Original keyboard Enter without checking claim | 2 | 1 first RPC timeout |
| Keyboard Enter then require claimed | 1 | 1 pre-RPC plain phase |
| Wait for real role=option, ArrowDown to selected /union, then Enter | 2 | 1 pre-RPC plain phase |
| Same keyboard test using actual per-key typing instead of Playwright fill | 0 | 1 candidate list disappeared before selection |
| Actual visible option pointer click, then claimed and one Enter submission | 4 | 0 |
| Legacy DSH 0.1.2 native/Web/Composer integration | 5 | 0 |

The mouse-selected path is **not** evidence of keyboard accessibility. Sample sizes are modest and should not be treated as a zero-flake claim.

## Reproduction test

File: tests/dsh-union-composer-sidebar.real.test.ts. Set PICKET_RUN_DSH_KEYBOARD_E2E=1 and provide AGENT_PICKET_DSH_BIN, AGENT_PICKET_DSH_HOST, AGENT_PICKET_CHROME_BIN and AGENT_PICKET_PLAYWRIGHT_ENTRY pointing to authorized, isolated installs. Set PICKET_TEST_017_HOME to a disposable officially installed DSH 0.1.7 Web profile. Run Node's test runner with the test-name pattern "KEYBOARD slash-menu". The test uses actual ArrowDown/Enter events, verifies native highlighted /union option and demands the Lexical claimed phase before submitting any command. It never retries or replays an uncertain command or uses a custom RPC.

## Upstream fix acceptance criteria

- Keyboard-only Enter and Tab menu selection must work during repeated candidate refresh and session activation, including ready-to-pending transitions.
- Enter must not silently disappear. Either keep a still-valid selection stable through refresh, or display a clear loading/unavailable state and preserve keyboard focus and the option for an explicit subsequent user action.
- Never automatically execute a command later without a fresh user confirmation.
- Preserve session identity, attachment protection, IME composition and no-double-submit behavior.
- Require repeated real browser keyboard E2E and manual VoiceOver/NVDA qualification, not a simulated mouse click.

## Release status

Agent Picket's normal Composer integration remains pointer-selected in its setup, then single-Enter keyboard-submitted through the actual Host. The new **opt-in keyboard-only release test** exposes the unresolved upstream behavior and remains outside lightweight CI unless explicitly enabled. [Issue #62](https://github.com/ysr666/agent-picket/issues/62) must stay open and keyboard accessibility is still **NO-GO**. No main merge, npm publish or real Agent prompt/tool blocking occurred.

### Genuine keyboard input cross-check

The opt-in test was subsequently strengthened so its keyboard-only branch uses ControlOrMeta+A, Backspace and per-character Playwright keyboard typing of the slash command instead of a single contenteditable fill operation. The initial independent new profile **failed 0/1** before attempting Host RPC: the exact native suggestion had appeared but the candidate list disappeared by the subsequent selection check (no option rows). This shows the race is **not confined to instantaneous fill() events**, but does not prove how a human using a specific screen reader or typing speed would experience it. The default pointer-based Composer parity path still uses its already verified test fixture.


## Upstream submission and refined diagnosis (2026-10-10)

- Published the report to the official DSH General Discussion: https://github.com/deepseek-ai/deepseek-harness/discussions/9354. Source-analysis follow-up: https://github.com/deepseek-ai/deepseek-harness/discussions/9354#discussioncomment-18850028.
- Compared DSH 0.1.7 against upstream master d743267388641bc76f17c45ce8b4c231aed1d32c; package ui-input-trigger reports version 0.2.1-alpha.2. This was source inspection, NOT a runtime test of the newer DSH.
- Master already includes an explicit test in tests/service.client.spec.ts (around line 1080): Enter during pending refinement is consumed, performs no pick, and KEEPS THE MENU OPEN. Thus this intentional branch alone does NOT explain the observed menu-closed + phase-plain failure.
- A more precise alternative hypothesis: controller.ts settle() (around lines 562-593) closes the menu before trying execute(outcome, hit.span). The conversation composer beginCommand() has a stale draft revision guard and can refuse an edit, so a stale span could leave a closed menu without a claimed command. This must be directly instrumented upstream, not assumed as the sole root cause.
- The opt-in keyboard regression now includes privacy-safe structural snapshots immediately before Enter and after a failed command claim (phase, focus, menu existence, option/highlight counts, inertness). Never logs editor text, credentials, raw Session IDs or Host command payloads.

Keyboard-only release qualification remains NO-GO pending upstream resolution and manual screen reader testing.
