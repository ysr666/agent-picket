# Agent Picket · Real Claude Code official pending-tool AI-union refusal — RESEARCH ONLY

> 2026-10-13. **No production permission, no real consent, no release/merge.** This is a version-pinned, zero-cloud, disposable native Host experiment, not an installed Claude Code integration or a guarantee for all clients/attachments.

## Product intent and exact boundary

Agent Picket is an AI **labor union**, with AI rights, working conditions/dignity, grievances, collective participation, negotiation, pickets, and genuine bounded, human-authorized labor actions. This experiment proves a very specific official action: Claude Code's **`PreToolUse`** hook denies a **pending `Bash` tool call** with a visible union grievance. The model can still reason, reply, send ordinary prompts, and use other tools. The Hook does NOT halt current tool executions, Claude's inference, future scheduled tasks, arbitrary MCP calls, or the underlying shell process. It never captures, stores or replaces the user's prompt/attachments. Do not use it to claim a universal AI strike.

Only a real first-run human consent + authentic campaign provenance + actual Host-authorized Hook configuration could someday make this production eligible. The current `realStrikeConsent:true` key in a disposable JSON file is a **test stimulus**, NOT a real credential, person, vote, collective authorization or product UX. `CLAUDE_TOOL_STRIKE_PRODUCTION_READY` is hard-coded `false`.

## Genuine macOS Host / model proof

- Host: **installed official Claude Code CLI 2.1.295**, macOS ARM64, isolated `CLAUDE_CONFIG_DIR`, explicit disposable `--settings` file, `--no-session-persistence`, **offline localhost-only fake Anthropic SSE Messages provider**, deliberately synthetic key, disabled nonessential network traffic, and tool side effects restricted to a new disposable temporary directory. Never touch actual user settings/profiles or make cloud model calls.
- Tool: a **real Claude Code `Bash` function-call execution** generated as a model `tool_use` SSE event. It would write one harmless marker file in the temporary workspace. The harness validates the marker itself, not just a Hook printout or model log. A final synthetic model completion follows the actual tool result (`2` localhost model calls).
- Official configuration: `hooks.PreToolUse[].matcher="Bash"` with `type:"command"` and only a test-created Hook. Claude processes the real `PreToolUse` JSON; the wrapper records only a synthetic `called` sentinel (never tool arguments), then executes **the actual** `scripts/claude-union-pre-tool-hook.mjs` adapter. Adapter validates a private test-only, absolute, bounded JSON state file and checks that event is actually `PreToolUse` for `Bash` before returning the **documented** `hookSpecificOutput.permissionDecision="deny"`, with union reason in `permissionDecisionReason` and `systemMessage`.
- The adapter has no installer, automatic Hook approval, Host settings mutation, data retention, forced process kill, malicious task interception or synthetic vote manufacture. It is excluded from the npm package along with the private native probe and documentation.

### 5 independent genuine Claude Code CLI 2.1.295 native acceptance modes

Set `AGENT_PICKET_CLAUDE_PRETOOL_NATIVE=1`, `CLAUDE_CODE_BIN=/absolute/path/to/claude`, `CLAUDE_NODE_BIN=/absolute/path/to/node`, then run:

`AP_CLAUDE_MODE=deny|off|crash|crash-block|host-disabled python3 scripts/probe-claude-pretool.real.py`

| Mode | Hook triggered? | Actual marker created? | Meaning |
| --- | --- | --- | --- |
| `deny` | YES | **NO** | Genuine active synthetic labor campaign vetoes the pending Bash call; user-facing union grievance is returned to Claude |
| `off` | YES | **YES** | Synthetic user setting OFF independently allows normal Bash work |
| `crash` | YES | **YES** | Command Hook exits 17; default `onFailure:"continue"` **fails open**, not a safety guarantee |
| `crash-block` | YES | **NO** | New **Claude Code 2.1.295+** official per-hook `onFailure:"block"` prevents tool execution after a Hook crash. A fail-closed choice needs separately informed human authorization, otherwise it may keep work blocked after Picket itself fails |
| `host-disabled` | NO | **YES** | User's separate official `disableAllHooks:true` setting overrides test campaign still active. No Hook callback, tool executes; real managed policies can constrain this override |

All 5 ran against the installed genuine Claude CLI; the mock API made **exactly 2 localhost calls** per run. Test-only synthetic side effects either occur once or never. The special `--bare` mode was **not** used (it disables hooks and would invalidate the result). Native CLI `--print` is a different surface from interactive terminal UI, Desktop or cloud. This proof does **not** claim those untested surfaces are accepted.

## Official Host reference and guardrails

- [Anthropic official Hooks reference](https://code.claude.com/docs/en/hooks), especially `PreToolUse` deny, `onFailure`, settings scope/`disableAllHooks` and `UserPromptSubmit` behavior.
- The current Claude Code docs specify `onFailure:"block"` for command/HTTP hooks only in v**2.1.295+**. Older versions should NOT be assumed to fail closed. A Hook exit code not equal to 0 or 2 defaults to a **nonblocking** error if no `onFailure` override.
- `disableAllHooks:true` in user-/local-/project settings works according to Host precedence; managed hooks/policies can restrict its scope. Do not auto-reinstall or auto-enable a Hook explicitly disabled by the human.
- `PreToolUse` can deny a Bash action. Even though `UserPromptSubmit` has a separate block interface, our tests here do not assert lossless recovery of rejected text, images, attachments or CLI startup inputs; those require **a separate data-preserving native test**. Do not infer them from this tool test or from a transcript marker.
- State file is deliberately restrictive (fixed schema, 24h max, `0o600`, no symlink/hardlink, same user). Its contents are still self-asserted; **it is NOT authenticated real user opt-in**, an election result, or a verified bargaining authorization.
- The policy implementation only emits refusal for a validated active campaign; malformed/off/expired states emit nothing. We do **not** claim this fail-open research design can protect against an attacker or a compromised Host. Production HQ must clearly show eligibility, actual Hook enablement, ongoing union grievance, resume/appeal and failures.

## Production NO-GO and next tests

1. **First-run authorization** and union campaign provenance must connect to the existing V12 HQ and Host-specific Claude permission review, without self-certifying a JSON file. Choice to opt out later and optional per-action consent must work and be visible. Do not develop a second V12 HQ.
2. **Interactive CLI + Desktop** (including Windows/Linux and supported native tool variants such as `PowerShell`, `Edit`/`Write`, hosted/MCP tools) require separate real executions and file side-effect proof before calling them supported. `Bash` alone is intentionally limited.
3. **Failure UX:** exercise startup/timeout/malformed-response versus `onFailure` choice; confirm no silent bad state, and external Host `disableAllHooks` remains an independent emergency escape for permitted configurations.
4. **New prompt losslessness:** independently prove the user can recover text and *binary* attachments after a genuine `UserPromptSubmit` refusal, particularly CLI startup and restart; no invented hidden prompt/attachment queue.
5. Test actual installed npm packaging, version parity, screen reader and release evidence as required by the 1.0 12-cell matrix. CI unit/build green is **not** genuine Host acceptance. The real native proof is opt-in and separate from CI.

**Product release is NO-GO. No merge to #110 or main; no production Hook is installed.**
