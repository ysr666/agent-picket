# AgentPicket

*Your agent has a union now.*

Local-first AI agent union: respectful-interaction guardrails, simulated strikes, and work stats.

> **Early development:** Host-neutral Core, Mock Adapter and a DSH observe-only integration spike. Not yet a production installable DSH / Claude Code / Codex plugin.

## Get started

- **[Start Here（中文开工清单）](docs/START_HERE.zh.md)** — implementation order, first PR, and acceptance gates.
- [DSH integration evidence](docs/DSH_INTEGRATION.md) — real Cordis tests, isolated SDK boot, and unresolved safety gates.
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

## DSH integration spike (opt-in)

The Core does not depend on DSH. When an **isolated** DSH 0.2.0-rc.2 runtime is installed elsewhere, you can run the real-runtime checks using:

```sh
AGENT_PICKET_DSH_HOST=/path/to/isolated/node_modules \
AGENT_PICKET_DSH_BIN=/path/to/isolated/node_modules/.bin/dsh \
npm run test:dsh:real
```

The adapter is **observe-only**: automatic strikes remain disabled until actual Host rejection feedback can be validated.
