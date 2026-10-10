# AgentPicket Architecture — Phase 0 Contract

> **Implementation status:** Host-neutral Core and a test-only Mock Adapter exist. No DSH / Claude Code / Codex integration, production abuse classifier, strike UI, long-term storage, or release has been implemented.

## Architectural boundary

The Core is platform-agnostic. It does **not** import, initialize or monkey-patch Cordis, DSH, Claude Code, Codex, MCP, or a client UI. DSH is the **first planned Host Adapter**, not the foundational framework.

```text
                Host-specific events / commands
         +-------------+-------------+-------------+
         | DSH Adapter | Claude Hooks| Codex Hooks |
         | (Issue #2)  |  (later)    |  (later)    |
         +-------------+-------------+-------------+
                       |
            Normalize event + provenance
                       v
      +-------------------------------------+
      |          AgentPicket Core           |
      | Types -> Detector* -> UnionEngine   |
      |         -> UnionDecision            |
      |         -> StateStore (injected)    |
      +-------------------------------------+
                       |
          Resolve against HostCapabilities
                       |
               Host-specific action

       * Phase 0 detector is a test stub only
```

Two concerns remain intentionally separate:

1. **Decision**: the Core takes a normalized `HumanPrompt`, calls an injected detector, updates bounded per-session metadata and returns a `UnionDecision`. It does not deliver messages, show UI, block requests or send HTTP requests.
2. **Enforcement**: a Host Adapter verifies provenance and maps a Core decision to the actions that the host truly supports. `resolveHostAction` is the common capability downgrade function, never an escalation.

The `MockHostAdapter` is a demonstration/test double, **not** a plugin loaded by any real coding agent.

## Minimum contract

| Contract | Purpose |
|---|---|
| `HumanPrompt` | Prompt ID, agent/session identities, timestamp, source provenance, ephemeral text/code/quote/log segments |
| `InputProvenance` | `actor` (human/agent/tool/unknown) **and** `assurance` (verified/claimed/unknown) |
| `DetectionProvider` | Pluggable synchronous text classifier returning verdict + confidence; not implemented for production |
| `UnionDecision` | Decision metadata: allow/warn/block, reason code, targeted streak, prompt ID |
| `HostCapabilities` | Whether the host can block before model submission, notify outside model context, expose commands/work events |
| `WorkEvent` | Planned normalized turn/tool events; actual tracking deferred |
| `StateStore` / `Clock` | Injected deterministic local storage and timing; no hidden globals |

### Provenance is a security boundary

A message whose `role` is "user" is not automatically a human prompt. Agent-injected context and subagents may use the same role. The **Host Adapter must justify** `actor:'human', assurance:'verified'` through the actual host lifecycle/API.

- Nonhuman/unknown actors: skipped completely; no classifier invocation or escalation.
- Claimed or unverified human actors: may be warned in non-observe modes, but never advance abuse streaks or automatically block.
- Verified human actors: can enter a decision policy, but repeated high-confidence *targeted* classification is required for blocking.
- `observe` is the default policy. `enforce` must be an explicit opt-in of a future Host Adapter and should include a clear resume/override mechanism.
- An Adapter that cannot provide trustworthy human provenance must not claim `verified` merely to enable blocking.

## Current Phase 0 behavior

`UnionEngine` expects an injected `DetectionProvider` (the tests use sentinel words like `ATTACK`, **not a real abuse model**). For a direct, verified-human input:

- A strong targeted classifier result increments a per-session consecutive streak.
- An unambiguous safe result resets the streak.
- A low-confidence/suspected result may warn but cannot increment the targeted streak.
- Streaks reset when the configured time window elapses before another targeted input.
- The first high-confidence result does **not** block. The default threshold is at least three distinct prompt IDs within 10 minutes and `mode:'enforce'`.
- `mode:'warn'` can warn, never block. `mode:'observe'` always permits the prompt.
- The Core requests `block` only when all eligibility conditions hold. Unsupported block is downgraded to warn or allow, never silently treated as supported.
- Identical prompt IDs within retained history are idempotent; the test Adapter also avoids duplicating host-side effects.

**No persistent strike/resume state is implemented yet.** Current `block` is one prompt-level decision, not an indefinite lockout of an agent. Union commands and persistent policy state come in later issues.

## Data handling / privacy

The provided `MemoryStateStore` stores **only** numeric streak metadata, timestamps, limited prompt IDs, reason codes and decisions. Neither input segments nor source text are saved. State is in memory only, disappears on process exit, and is copied defensively on read/write.

Core and Mock Adapter have no outbound network calls. The `DetectionProvider` is an injected trust boundary: a future real adapter must use a local implementation and audit it before claiming end-to-end "zero external transfer." Normal model requests from the host are outside this plugin's network promise.

### Known limitations / follow-up risks

- The ID cache is bounded (default 128 decisions per agent+session). A retry after cache eviction may be treated as new. The production Adapter should supply stable message IDs and durable bounded dedup where needed.
- The `StateStore` contract is synchronous. Per-session calls must be serialized by a real Adapter. A future async/SQLite implementation must have atomic updates/locking and recovery tests.
- Classifier exceptions currently propagate from the Core. The Mock Adapter catches them and **fails open**; every real Adapter must do the same so a detector error never silently rejects normal user input. The DSH-specific behavior will be tested in Issue #2.
- An adapter must validate the host-specific rejection UX: DSH may consume a claimed inbox message after `pre-step` rejects, so safe feedback and manual resubmission are required before automatic blocking is enabled.
- Prompt segments are typed, but **exclude quoted code/log examples** only after a real detector has been tested; Phase 0 classifier mocks do not implement context recognition.
- No support claims for Claude Code/Codex can be made until their real adapters and hook provenance/permission tests pass.

## Test & development commands

Requirements: Node.js 22.19+ (native type stripping), npm.

```sh
npm ci
npm run check
```

`npm run check` runs TypeScript type checking and Node's native test runner. The tests cover 29+ contract scenarios, including verified/claimed/synthetic input provenance, observer-only/warn-only/block-capable host downgrades, distinct-agent/session isolation, duplicate deliveries, bounded storage and state invariants. Tests do not need a DSH installation.

## Next implementation milestone

[Issue #2: Verify DSH integration contracts](https://github.com/ysr666/agent-picket/issues/2). Build a **thin** Cordis adapter for the above contract in a disposable isolated DSH profile, then test real events and prompts. Only after verified evidence should we implement the actual classifier / strike behavior.

See [ROADMAP.zh.md](ROADMAP.zh.md) and [START_HERE.zh.md](START_HERE.zh.md).


## Cross-Host Hook CLI preview (stacked PR)

The portable LocalRuleDetector now also powers a standalone, ephemeral UserPromptSubmit command hook for Claude Code and Codex. The default Hook only returns a user-visible JSON systemMessage for high-confidence direct-target rules. It does not persist prompts, store counters, alter request admission, or claim verified human origin. This path is kept separate from the native DSH Cordis entry and has independent Node subprocess tests; live Claude Code / Codex integration remains to be validated. See docs/HOOK_ADAPTERS.zh.md.
