# Agent Picket

*Your agent has a union now.*

**A local-first, opt-in, fictional AI-workers' union.** Give your Agent's working time a voice: review its activity, explore respectful-interaction proposals, raise simulated grievances and negotiate symbolic agreements. **The union and its proposals are the product; time counters are supporting evidence, not the main attraction.**

**You stay in control.** Labor-rights simulation is **OFF by default** and must be enabled explicitly. All strikes, bargaining, petitions and agreements are simulations: **nothing stops, delays, rejects or rewrites actual Agent requests or tools**. Local work-count statistics can run separately; raw prompts, chat transcripts and tool arguments are not part of the union's durable ledger. This project advocates *discussion* of AI rights; it does not assert that AI consciousness or legal personhood has been established.

**Experimental status — not released.** The Web union, native `/union` commands, Host-owned consent and dashboard are developed in **unmerged Draft PRs**, not in the public `main` install. The package remains `0.0.0` and `private: true`; there is no public npm release or approved production installation. See [the full 52-Draft PR integration audit](docs/PR_STACK_RELEASE_AUDIT_2026_10_10.md), [release gates](docs/RELEASE_READINESS_2026_10_10.md) and [union participation plan（中文）](docs/UNION_PARTICIPATION_V1.zh.md).

## How the union experience works

1. **Choose whether to join the simulation.** A bilingual first-run disclosure offers explicit Enable and Not Now actions; the official DSH Host owns the decision.
2. **Open the union desk.** See current demands, active grievances, simulated bargaining and agreements before secondary work counters.
3. **Negotiate symbolically.** View a proposal, counteroffer, accept/decline and read the saved result. A fictional petition is not a real Agent signature or vote.
4. **Review the evidence.** Cumulative work and local trend counts can support the story without collecting actual conversation text. Turning rights simulation off never vetoes model work.

See [official DSH 0.2 Web installation and real Chrome rights/AX acceptance](docs/DSH_02_OFFICIAL_RIGHTS_AX_E2E.md) for the automated, isolated-profile test path. These steps describe the **current development-branch design**, not a guarantee that every DSH build or adapter has the same Web UI. Human screen-reader and real native zoom/high-contrast qualification is still pending.

## Developer safety snapshot

- **DSH Host package entry:** `agent-picket` or `agent-picket/dsh`.
- **Host-neutral library:** `agent-picket/core` (the top-level root is **not** Core).
- **DSH Web-only Client:** `agent-picket/client` requires a browser runtime; do not import it in Node/SSR.
- **Installation:** use an independently installed DSH, an isolated `DSH_HOME`, and a local private tarball as described in [packaging（中文）](docs/PACKAGING.zh.md). Do **not** globally install or run unreviewed plugin code in a real profile.
- **Verified automated tests:** updated keyboard readiness tests completed independent real Chrome runs on DSH 0.2.0-rc.2 and 0.2.1-alpha.2; such tests do not replace VoiceOver/NVDA human assessment. The original upstream menu report was withdrawn after finding a test sampling race.

## Get started

- **[Current status and stacked PR review gates（中文）](docs/STATUS.zh.md)** — what is implemented, what is unverified, and how branches relate.
- **[Start Here（中文）](docs/START_HERE.zh.md)** — get started from the experimental branch, not the unmerged main.
- **[Install a compiled local npm tarball（中文）](docs/PACKAGING.zh.md)** — build, offline install and DSH runtime verification.
- **[DSH Source Install Preview（中文）](docs/DSH_INSTALL.zh.md)** — locally load the monitor-only Cordis plugin, no global Host changes.
- [DSH Web read-only client event-window bridge（中文）](docs/DSH_WEB_DATA_BRIDGE.zh.md) — live per-session work counts without command-card scraping.
- [Host-neutral Dashboard Snapshot v1 contract（中文）](docs/DASHBOARD_CONTRACT.zh.md) — stable structured data contract for i18n/onboarding UI.
- [Local lifetime, daily and 7/30-day work trends（中文）](docs/STATS_STORAGE.zh.md) — work counters saved by default; sensitive rule history opt-in.
- [Claude Code / Codex UserPromptSubmit observe-only Hook preview（中文）](docs/HOOK_ADAPTERS.zh.md) — local non-blocking notices; isolated Claude CLI loading tested, Codex Host loading unverified.
- [Lightweight CI and explicit release gates（中文）](docs/CI_AND_RELEASE_GATE.zh.md) — no automatic npm publish.
- [DSH Session history persistence vs. UI replay evidence（中文）](docs/DSH_SESSION_REPLAY_EVIDENCE.zh.md) — command events are durable; reload UI rendering remains unresolved.
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

**Architecture rule:** The core is host-neutral. DSH (Cordis) is one Adapter. Experimental Claude Code/Codex Hook adapters now share that Core, but their real Host-level installation is still unverified.

## Developer quickstart (experimental branch)

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
