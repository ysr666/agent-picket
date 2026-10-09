# AgentPicket

*Your agent has a union now.*

Local-first AI agent union: respectful-interaction guardrails, simulated strikes, and work stats.

> **Early development:** Phase 0 host-neutral Core + Mock Adapter only. Not yet an installable DSH / Claude Code / Codex plugin.

## Get started

- **[Start Here（中文开工清单）](docs/START_HERE.zh.md)** — implementation order, first PR, and acceptance gates.
- [Development roadmap（中文）](docs/ROADMAP.zh.md) — DSH-first integration, detection, work tracking, and multi-agent support.
- [Initial development tasks](https://github.com/ysr666/agent-picket/issues) — Issue #1 → #2 → #3 → #4.

**Architecture rule:** The core is host-neutral. DeepSeek Harness (Cordis) is the first Adapter, not a dependency of the core. Later Claude Code/Codex integrations use their own adapters.

## Developer quickstart (Phase 0)

Requires Node.js 22.19+.

```sh
npm ci
npm run check
```

See [Architecture and trust boundary](docs/ARCHITECTURE.md) and [Issue #1](https://github.com/ysr666/agent-picket/issues/1). The test classifier is synthetic; no real abuse detection is shipped yet.
