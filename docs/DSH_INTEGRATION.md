# AgentPicket × DeepSeek Harness — Integration Spike

**Status:** partial, evidence-backed integration completed. **Issue #2 stays open** until real end-to-end rejection / feedback and cold-recovery behavior are validated.

**Scope:** Host-neutral Core from [Issue #1](https://github.com/ysr666/agent-picket/issues/1), Cordis/DHS adapter entry and three real-runtime tests. The adapter is **observe-only**. This is NOT a production installable AI abuse detector or an enabled strike policy.

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

The isolated Host installation is a **development/test prerequisite**, **not** a production dependency of the Core or a plugin package dependency.

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
- **Only real Cordis event dispatch with synthetic SessionEvents was tested.** Real DSH AgentLoop emissions, cancellation/retry ordering and cold-resume reconstruction have **not** been verified; do not claim production-grade work statistics yet.

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
```

When the two variables are absent, the three real-runtime tests are skipped. They are always opt-in; the standard Core tests stay runnable without DSH. Tests do not contact an LLM provider.

**Verified locally:** Core/Mock/DSH-contract suite **41/41 passed**, real-runtime suite **3/3 passed**, TypeScript `tsc --noEmit` passed. Runtime exercised on Node v24.5.0 only; Node 22 and DSH 0.1.x compatibility remain unverified.

## Outstanding Issue #2 work (not complete)

- [ ] True `AgentLoop` `user/message` → `agent/pre-step` → `step/start` / `llm/stream` end-to-end test with a local offline fake LLM, no external requests.
- [ ] Verify that `reject` prevents a model call **and** returns a clear user-facing explanation in Web/CLI; test next normal submission and explicit resume / resubmission.
- [ ] Test actual human provenance guarantee (or continue treating all events as unverified and permanently disable automatic block).
- [ ] Test real DSH tool events, concurrency/retries, cancellation, session reload and cold startup/recovery.
- [ ] Prove coexistence with installed `dsh-vision-router` in a disposable shared profile and lifecycle order, without modifying its repo.
- [ ] Validate compatibility across relevant DSH releases and Node versions.

**Next safe change:** Build real offline AgentLoop/UI rejection characterization tests. Leave `registerDshIntegration` observe-only until the missing invariants are resolved. Do not close #2, merge this as release-ready, or start automatic strike behavior on the basis of these smoke tests alone.

Sources: [DSH lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/agent-lifecycle.md), [DSH commands](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/interaction/commands/README.md), [DSH architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md).
