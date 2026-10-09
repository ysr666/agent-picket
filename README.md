# AgentPicket

*Your agent has a union now.*

Local-first AI agent union: respectful-interaction guardrails, simulated strikes, and work stats.

> **Experimental DSH source-install and compiled local tarball preview available.** Observe-only; optional manual symbolic strike demo, no automatic blocking. Not yet a stable published plugin for DSH / Claude Code / Codex.

## Get started

- **[Start Here（中文开工清单）](docs/START_HERE.zh.md)** — implementation order, first PR, and acceptance gates.
- **[Install a compiled local npm tarball（中文）](docs/PACKAGING.zh.md)** — build, offline install and DSH runtime verification.
- **[DSH Source Install Preview（中文）](docs/DSH_INSTALL.zh.md)** — locally load the monitor-only Cordis plugin, no global Host changes.
- [DSH Web Client unload/reload lifecycle（中文）](docs/DSH_CLIENT_LIFECYCLE.zh.md) — genuine Cordis fiber disposal, no duplicate event listeners.
- [Offline-installed npm tarball: real DSH Web + multi-tab E2E（中文）](docs/DSH_PACKAGED_WEB_E2E.zh.md) — clean install, browser reload, second-tab commands.
- [Native Web Client Companion: instant union command notices（中文）](docs/DSH_WEB_COMPANION.zh.md) — fixes feedback in empty sessions via supported client events.
- [Real Chrome browser E2E of native union commands（中文）](docs/DSH_BROWSER_E2E.zh.md) — discover, execute, render; symbolic strike never blocks.
- [Real DSH Web Host startup and auth smoke（中文）](docs/DSH_WEB_RUNTIME.zh.md) — authenticated page startup, not full browser-click E2E.
- [DSH Web capabilities and manual preflight（中文）](docs/DSH_WEB_CAPABILITIES.zh.md) — read-only manual command; automatic interception disabled.
- [Blocking safety and recovery requirements](docs/BLOCKING_SAFETY.md) — actual strikes remain blocked by safety gates.
- [Local rule detector and privacy boundaries](docs/LOCAL_DETECTION.md) — conservative bilingual rules; no automatic strikes.
- [Local work stats and /union commands](docs/WORK_TRACKING.md) — host-neutral counters and a monitor-only command.
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

See [Architecture and trust boundary](docs/ARCHITECTURE.md) and [Issue #1](https://github.com/ysr666/agent-picket/issues/1). A conservative local rule detector is now implemented and tested. There is still no production-ready abuse judgement or automatic strike support.

## DSH integration spike (opt-in)

The Core does not depend on DSH. A native **monitor-only** Cordis entry now exists at `src/adapters/dsh/plugin.ts` and can be loaded with `cordis.patch.yml` from the repository root. Read [DSH_INSTALL.zh.md](docs/DSH_INSTALL.zh.md) first. With an **isolated** DSH 0.2.0-rc.2 runtime installed elsewhere, you can run real-runtime tests using:

```sh
AGENT_PICKET_DSH_HOST=/path/to/isolated/node_modules \
AGENT_PICKET_DSH_BIN=/path/to/isolated/node_modules/.bin/dsh \
npm run test:dsh:real
```

The adapter is **observe-only**: automatic strikes remain disabled until actual Host rejection feedback can be validated. Optional in-memory `WorkTracker`, `DetectionCounter` and `SymbolicUnion` provide `/union status`, `/union stats`, `/union report`, `/union check <text>` (manual, non-blocking), `/union strike` (demo only), `/union resume`, `/union safety`, `/union reset` and `/union help` in clients that mount DSH's command service.
