# AgentPicket × DeepSeek Harness — Integration Spike

**Status:** real AgentLoop rejection/recovery, parallel sessions and tool events proven offline; **Issue #2 stays open** until user-readable rejection feedback and full Host/profile resume semantics are validated.

**Scope:** Host-neutral Core from [Issue #1](https://github.com/ysr666/agent-picket/issues/1), Cordis/DSH adapter entry and five real-runtime tests. The adapter is **observe-only**. This is NOT a production installable AI abuse detector or an enabled strike policy.

## Environment and pinned evidence

| Component | Value |
|---|---|
| Test machine | macOS, Node.js v24.5.0, npm v11.7.0 |
| Isolated DSH npm | `@deepseek-ai/dsh@0.2.0-rc.2` |
| Official Cordis shipped by DSH | `@deepseek-ai/cordis@4.0.4` |
| Commands runtime | `@deepseek-ai/dsh-commands` from pinned DSH installation |
| SDK profile | `sdk-minimal` with per-invocation `--patch` |
| Profile home | Fresh temporary `DSH_HOME`, never the user's existing Host directory |
| Other DSH available on the computer | Global `dsh@0.1.2-rc.1`, **left untouched** |

The isolated Host installation is a **development/test prerequisite**, **not** a production dependency of the Core or a plugin package dependency. Additional opt-in coexistence test used published `dsh-vision-router@3.0.3` installed exclusively in the same temporary Host directory (not in any user project).

## Supported interface observations

### `agent/pre-step`: read-only bridge

- The listener receives `{agent,messages}` and a `next()` continuation in the Cordis waterfall.
- Our adapter normalizes messages through `normalizeDshPrompt`, passes them to the independent `UnionEngine`, but **always calls and returns `next()`** unchanged. A detector exception fails open.
- DSH `source.kind === 'user'` is **claimed** provenance. Neither the role name nor this Hook proves there is a human present; the adapter **never** assigns `assurance:'verified'`.
- Other sources (agent/tool/injected/unknown) cannot advance targeted-abuse state and don't trigger classifier evaluation.
- DSH-specific tests observe the sequence on real Cordis 4, including native listener registration and teardown.
- A **separate dev-only probe** rejects explicitly listed message IDs. On real Cordis the reject decision short-circuits the downstream continuation, and unrelated messages enter normally. This probe is **not wired** into the production adapter.

**Important caveat:** the DSH documented rejection behavior removes input already claimed by the inbox, and `PreStepDecision` only contains `{kind:'reject'}` without a user-facing reason. An actual client UI rejection message and request-resubmission flow have **not** yet been proven. Enabling automatic strike now could silently discard user work. **Do not enable auto block** until this is resolved.

### Slash commands

- Real `@deepseek-ai/dsh-commands` service running inside Cordis 4 lists `/union` when the adapter is installed.
- The command handler only reports that AgentPicket is running in monitor mode; it does not start model requests.
- Unloading the adapter causes `/union` to disappear from the real registry.
- SDK-minimal/headless do not necessarily provide the interactive command plane. Missing `commands` is an expected no-op, not a boot failure.

### Work events

- `session/event` normalizes only `turn/start`, `turn/end`, `tool/call`, `tool/result` with valid event sequence IDs.
- Events emit structured `WorkEvent` values; they do not archive text or tool argument payloads.
- **Real AgentLoop session events are now tested** for turn and tool boundaries, alongside two simultaneous sessions. Cancellation, retry ordering, persistence reconstruction and comprehensive work-time estimation remain unverified; do not claim production-grade work statistics yet.

### Real AgentLoop rejection and offline recovery

An isolated DSH `sdk-minimal` server runs the **actual AgentPicket observe-only adapter**, a dedicated test-only explicit-marker rejection listener, and a synthetic local `picket-offline` LlmAdapter. No external LLM calls are needed; process-level HTTP(S) proxy environment variables direct accidental outgoing attempts to non-listening loopback port 9.

The test sends JSON-RPC `initialize` followed by `session/prompt('BLOCK TEST')`: the SDK receipt contains a message ID, but the real session records `turn/end` with `reason.kind === 'blocked'`, **zero `step/start`**, **zero `user/message`**, and **zero synthetic model calls**. It then sends `session/prompt('ALLOW TEST')` in the same session: `turn/end` records `completed`, a user surface message and one assistant message are committed, and exactly one offline `stream()` invocation occurs. The Adapter also receives the actual session turn start/end notifications (2 each). A third SDK prompt (`TOOL TEST`) makes the offline model emit one tool call to `picket_probe_ping`, a deterministic in-memory tool returning `pong:hello`. In the *real DSH AgentLoop*, this produces exactly one `tool/call`, one `tool/result`, one `work:tool-start`, one `work:tool-end`, one safe tool execution, and two model calls (tool proposal + model continuation).

The same test then submits two additional **concurrent sessions** over the SDK connection and verifies that both complete independently without contaminating the original session's event stream. Real pre-step observations confirm that DSH provides distinct Agent and Session objects; the adapter now uses `agent.session.id` for the true session key instead of treating `agent.id` as interchangeable.

Thus *reject suppresses model calls and a later fresh prompt works*. It does **not** mean the rejected prompt is saved for replay or that the SDK/UI displays a user-friendly arbitration explanation. Explicit user resubmission and UI messaging still need design before opt-in auto-block.

### Cold-restart characterization (pinned SDK-minimal)

The test starts a fresh SDK-minimal Host with a temporary persistent `DSH_HOME`, submits a prompt under a known session ID, and cleanly shuts down. On a new process with the **same** home and ID, `session/prompt` returns JSON-RPC error `-32603: session ... already exists`; creating a **new** session ID still works. This pins an observed `sdk-minimal` API limitation: **a fresh `session/prompt` is not a substitute for a resume API**. The test does *not* prove that the underlying Session log is unrecoverable. AgentPicket must not automatically claim cold resume or covertly invent a replacement ID without exposing the state change. This behavior may differ in other DSH profiles or versions.

### dsh-vision-router coexistence (SDK-minimal)

With published `dsh-vision-router@3.0.3` installed in the disposable Host directory, a second end-to-end test mounts both plugins in a single `sdk-minimal` profile. The same offline rejection, recovery **and real tool-call** assertions pass without stderr/errors. Vision's free cloud fallback is disabled for the experiment. This proves **basic SDK-profile coexistence**, not Web UI compatibility or vision request functionality; those remain outstanding.

### Native DSH app boot

The pinned `dsh --profile sdk-minimal --patch ...` booted successfully in a fresh temporary `DSH_HOME`; a disposable fixture imported and registered the **actual** TypeScript AgentPicket DSH adapter via local patch path. The SDK process remained alive and an adapter-install sentinel was written in the temporary test directory. Test cleanup terminated the SDK process and removed that directory.

This proves package/profile loader compatibility and actual adapter activation in DSH `0.2.0-rc.2`, **not** a complete model round trip.

## Reproduction

```sh
# In a separate, disposable directory; never upgrade user's global DSH:
mkdir -p /tmp/agent-picket-host-test
npm install --prefix /tmp/agent-picket-host-test --ignore-scripts \
  --registry=https://registry.npmjs.org @deepseek-ai/dsh@0.2.0-rc.2

# In the AgentPicket working tree:
npm ci --ignore-scripts
npm run check

# Real Cordis services + DSH patched SDK Profile startup:
AGENT_PICKET_DSH_HOST=/tmp/agent-picket-host-test/node_modules \
AGENT_PICKET_DSH_BIN=/tmp/agent-picket-host-test/node_modules/.bin/dsh \
npm run test:dsh:real

# Optional: install the published VR in that SAME disposable host
# (never into your existing DSH home or dsh-vision-router worktree):
npm install --prefix /tmp/agent-picket-host-test --ignore-scripts \
  --registry=https://registry.npmjs.org dsh-vision-router@3.0.3

AGENT_PICKET_DSH_HOST=/tmp/agent-picket-host-test/node_modules \
AGENT_PICKET_DSH_BIN=/tmp/agent-picket-host-test/node_modules/.bin/dsh \
AGENT_PICKET_VISION_ENTRY=/tmp/agent-picket-host-test/node_modules/dsh-vision-router/lib/public-entry.js \
npm run test:dsh:real
```

When the two variables are absent, the real-runtime tests are skipped. They are always opt-in; the standard Core tests stay runnable without DSH. Tests do not contact an LLM provider.

**Verified locally:** Core/Mock/DSH-contract suite **41/41 passed**, real-runtime suite **5/5 passed** with VR coexistence enabled (or **4/4** without VR), TypeScript `tsc --noEmit` passed. Runtime exercised on Node v24.5.0 only; Node 22 and DSH 0.1.x compatibility remain unverified.

## Outstanding Issue #2 work (not complete)

- [x] True `AgentLoop` input → `agent/pre-step` → blocked/no-step or accepted/`step/start`/`llm/stream` tests with a local offline fake LLM, no external model requests.
- [x] Verify `reject` prevents a model call and a **new normal SDK submission** succeeds.
- [ ] Provide and verify a clear *user-facing* rejection explanation in Web/CLI, plus explicit resubmission and resume semantics. SDK currently only emits a generic `blocked` outcome, which is insufficient for auto-strike.
- [ ] Test actual human provenance guarantee (or continue treating all events as unverified and permanently disable automatic block).
- [x] Verify real DSH `turn/start` / `turn/end` events are normalized by the actual adapter.
- [x] Test actual tool execution and work event normalization (a synthetic `picket_probe_ping` tool, one `tool/call` and matching `tool/result`).
- [x] Test concurrent SDK prompts to two distinct sessions; verify isolated events and responses.
- [x] Characterize pinned SDK-minimal cold restart: a formerly used Session ID fails lazy `session/prompt` creation with `already exists`.
- [ ] Test retry ordering, cancellation, actual Session `resume()` API and recovery of an interrupted turn using the Host's supported path.
- [x] Prove basic `sdk-minimal` coexistence with published `dsh-vision-router@3.0.3` in a disposable shared profile, without modifying its repo.
- [ ] Test the two plugins together in real Web Client and exercise vision routing, command presentation, unload order.
- [ ] Validate compatibility across relevant DSH releases and Node versions.

**Next safe change:** Design/validate an explicit user-visible explanation and resubmission contract (likely needs a Host-specific UI layer); investigate DSH resume APIs without bypassing Session persistence. Leave `registerDshIntegration` observe-only until the missing invariants are resolved. Do not close #2, merge this as release-ready, or start automatic strike behavior on the basis of these smoke tests alone.

Sources: [DSH lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/agent-lifecycle.md), [DSH commands](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/interaction/commands/README.md), [DSH architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md).

## Web Host and browser-auth smoke (later stacked PR)

The opt-in `tests/dsh-web.real.test.ts` starts the actual pinned DSH `web` Profile with an isolated Home, local ephemeral HTTP port and a fixture that installs the **real** AgentPicket adapter. It verifies the adapter ran, the unauthenticated root is HTTP 401, root token exchange is 303 with a signed Cookie, cookie-authenticated root is 200 HTML, and cross-origin `/api` access fails with 403.

This is **Host Web startup and authentication**, not a browser-click test of the slash menu, user draft restoration, attachment recovery or any true auto-block behavior. See [DSH_WEB_RUNTIME.zh.md](DSH_WEB_RUNTIME.zh.md). Running this test with the pinned DSH raises the opt-in runtime suite to **11 tests**.
