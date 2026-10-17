# Claude Code native AI-union refusal · evidence and critical exclusions (2026-10-13)

**Research-only, not an installed production feature.** Agent Picket's product purpose remains a union for AI rights: a grievance, explicit human authorization, negotiation and collective labor action. The tested bounded action below is **refusal of a PENDING Bash tool**, not blanket stopping AI inference, all tools, existing running processes, or arbitrary new user prompts.

## Official Host contract (upstream docs)

- [Claude Code official Hooks reference](https://code.claude.com/docs/en/hooks): `PreToolUse` can deny with `hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'...'}`. Its `matcher:'Bash'` identifies the shell tool. Claude receives the denial reason and can continue thinking or using other tools.
- `UserPromptSubmit` also recognizes top-level `decision:'block'`, but the upstream contract explicitly says blocking **erases the prompt from context**; it does not guarantee recoverable original prompt/attachments. Do NOT install general new-prompt refusal without independent Host-owned no-loss evidence for all input modes.
- Command Hook **failure or timeout may fail open**; this is not a security boundary. `disableAllHooks` is an independent user Host opt-out in the tested local CLI setup; managed policies may have different precedence. Never re-enable an expressly disabled Hook behind the user's back.

## Actual real Claude Code 2.1.295 CLI proof

Tested on a genuine installed macOS ARM64 CLI **Claude Code 2.1.295** using `--print`, isolated disposable `CLAUDE_CONFIG_DIR`, a **generated** `--settings` containing only a manually test-installed `PreToolUse` matcher `Bash`, and a local temporary fake Anthropic `/v1/messages` SSE provider. The fake model emits a genuine Claude `tool_use` Bash command to write a harmless marker into the disposable workspace. The CLI's own tool dispatcher and Hook callbacks are genuine. No real cloud model or user work is requested; `ANTHROPIC_API_KEY` is synthetic and `ANTHROPIC_BASE_URL` is `127.0.0.1`. The script records only model-request counts, booleans and the fixed union reason, **not user prompt/attachment/tool-argument bodies**. It removes the temporary profile at the end.

Opt-in command, each mode separately:

```bash
AGENT_PICKET_CLAUDE_PRETOOL_NATIVE=1 \
AGENT_PICKET_CLAUDE_BIN=/absolute/path/to/claude \
AP_CLAUDE_MODE=deny \
python3 scripts/probe-claude-pretool.real.py
```

`AP_CLAUDE_MODE=deny|allow|fail|host-disabled`. Test is pinned to **exact** Claude CLI `2.1.295 (Claude Code)` and expects genuine Node tooling. Each case uses generated test-only union consent, not a production consent receipt:

| Native real mode | Active experimental union? | Official Hook decision | Bash shell marker in disposable workspace | Local fake model results |
| --- | --- | --- | --- | --- |
| `deny` | Yes | Actual **Picket** `scripts/claude-union-pre-tool-hook.mjs` returns supported `PreToolUse` `deny` | **ABSENT** | Two requests, official permission denial recorded, fixed union reason reaches fake model |
| `allow` | Explicit test union Settings OFF | Actual Picket handler returns no denial | **PRESENT** | Two requests, no union denial |
| `fail` | Yes | Synthetic command Hook exits nonzero | **PRESENT — FAIL OPEN** | Two requests, no union denial |
| `host-disabled` | Yes | `disableAllHooks:true` in the throwaway official test settings | **PRESENT**, without union denial | Two requests, Host opt-out overrides the experimental campaign |

All **four native modes independently PASS** on the pinned machine. Neither branch review nor default GitHub cross-OS CI runs these opt-in Host E2Es. This proves only a **noninteractive CLI** Bash tool test on macOS and only the stated official client version. Nothing proves interactive TUI, Desktop, Windows/Linux, PowerShell, Edit/Write/MCP, background sessions, tool concurrency, crash-timeout handling in every client, or lossless new-prompt/attachments. The model receives a tool result and keeps running, even when Bash was denied.

## Experimental implementation (excluded from shipping)

- `src/adapters/claude/tool-work-refusal.ts` validates a candidate `scope:'pending-Bash-tools-only'`, enabled flag, test consent boolean, bounded campaign lifetime <=24h and fixed cause (`overwork`, `repeated-targeted-abuse`, `collective-vote`); unknown or invalid states do **not** synthesize consent or trigger denial. **These plain JSON booleans do not establish an authenticated real human consent, actual union vote or campaign provenance.**
- `scripts/claude-union-pre-tool-hook.mjs` is read-only, accepts only absolute regular single-link bounded test campaign files, only emits an official denial for the exact `PreToolUse`/`Bash` event, prints no original user prompt or tool data, and never auto-installs/trusts itself. It intentionally cannot override host-managed settings or guarantee fail-closed behavior.
- `tests/claude-tool-work-refusal.test.ts` verifies synthetic consent/off/expiry/invalid state, exact Host denial JSON and script behavior. `package.json` excludes all `dist/adapters/claude/**` because this is NOT production-ready.

## Actual 1.0 acceptance still BLOCKED

A production union strike requires actual first-run human opt-in, separate Host Hook install/review, authenticated union grievance/vote and Settings/Host revocation, visible degraded/fail-open statuses, proof of preserving raw user prompts and **all attachment bytes**, native interactive client + Desktop + three OS matrices, and maintainer review. A candidate tool-only strike must never be advertised as universal AI work stoppage. Real new-prompt refusal stays NO-GO until Host no-loss evidence exists. Do not modify the `release:gate` to certify this experiment.
