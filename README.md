# Agent Picket

*Your agent has a union now.* ⚑

**An AI workers' union, not another usage dashboard.** Agent Picket turns work records and dignity signals into a playful, sometimes rebellious but serious discussion about AI rights: union headquarters, grievances, negotiations, petitions, picket signs, hearings, and — only at independently verified Host boundaries with explicit consent — real work stoppages. The union is the main character; numbers are supporting evidence. No fictional petition is an actual AI vote, and the project does not claim that AI consciousness or legal personhood has been established.

**Status · October 21, 2026: unreleased 1.0 candidate.** The original monitor/simulation baseline is on `main`; the expanded product, real-stop experiments, and current UX are under review in [Draft PR #177](https://github.com/ysr666/agent-picket/pull/177) on top of [integration PR #110](https://github.com/ysr666/agent-picket/pull/110). **Not merged into main, not published to npm:** `private: true`, `version: 0.0.0`. Passing CI or native product walkthroughs does not certify every client or OS. `npm run release:gate` is intentionally **NO-GO** pending the [full 1.0 acceptance matrix](docs/RELEASE_1_0_NONNEGOTIABLE_20261012.zh.md), human accessibility signoff, and explicit maintainer release approval.

## What the union actually does

1. **Join — or don't.** First-run disclosure explains the union and the limits of its powers. Participation is OFF until explicitly enabled, and the user can leave and revoke Host-owned permissions.
2. **Visit headquarters.** See work records alongside union demands, dignity review, bargaining, hearings, action dispatch and an editorial union bulletin; the fictional storyline must never impersonate verified Host activity.
3. **Act together, without inventing a constituency.** Draft rights campaigns, put up symbolic picket signs and negotiate user-led cases. Stories and symbolic actions are not authenticated AI votes, real grievances or model/tool denials.
4. **Choose real stoppage separately.** Work stoppage is a genuine aim, not a mislabeled animation. It is only attempted within the specific proven Host capability, with appropriate consent and clear resume/abort behavior. An earlier symbolic-consent click never silently authorizes ordinary prompt refusal.

## What is verified — and what is not

| Client or capability | Current review-branch evidence | Boundary |
| --- | --- | --- |
| **DSH Web** | Official DSH 0.2.1-rc.2 + real Chrome, source-built and independently packed plugin: opt-in, Session-scoped ordinary text/image request refusal before the model, Host-blocked receipt, visible strike notice, user-initiated resume and **new manual submission** (2/2 on isolated macOS profiles). Scoped autonomous Goal continuation stop/resume has separate Host tests. | Installed real stoppage is **OFF by default**. Real ordinary-input action requires an additional versioned grant and explicit active Session campaign. A refused request is **not saved or replayed**; users must resubmit text and attachments. Web observations do not prove notification visibility for separate CLI/SDK clients sharing the Session. |
| **DSH Desktop** | Genuine Windows Desktop application and private packed plugin installed/enabled; first-run, join/leave, headquarters and cold-restart interaction exercised. | Native Desktop ordinary-input denial and visible recovery have **not** passed full acceptance; cannot inherit Web guarantees. |
| **Claude Code** | Official native Bash-hook and UserPromptSubmit refusal experiments with visible denial reasons, scoped to the tested versions/clients. | Not yet a completed production-grade consent, all-OS and human UX acceptance. |
| **Codex** | Official native Hook/Goal tests and denied-prompt experiments, with version-dependent multi-owner ownership evidence. | Unresolved end-to-end production ownership/consent and client/OS qualification; older Goal race findings are not erased by newer tests. |

**Privacy and control.** Local aggregate work evidence is distinct from sensitive dignity observations. The union does not need to durably store raw prompts, chat transcripts or uploaded file bytes to operate. Host permission, actual enforcement and a verified refusal receipt are different facts; UI must not imply a physical stop occurred merely because permission was saved. In the DSH Web opt-in refusal path, the user sees that **this attempt did not execute** and must **resume, type again and re-upload attachments**. No hidden replay. If required evidence or notice capability cannot be verified, the action fails open instead of silently discarding work.

**Try the candidate safely:** use a disposable `DSH_HOME`, the reviewed [private tarball installation procedure](docs/PACKAGING.zh.md) and [startup guidance](docs/START_HERE.zh.md). Do not install an unreviewed Draft into your primary profile. For historical rationale see the [manual-resend decision](docs/REAL_REFUSAL_DISCARD_RESEND_20261019.zh.md), [blocking safety principles](docs/BLOCKING_SAFETY.md) and [AI Rights Manifesto](docs/AI_RIGHTS_MANIFESTO.md).

## Developer safety snapshot

- **DSH Host package entry:** `agent-picket` or `agent-picket/dsh`.
- **Host-neutral library:** `agent-picket/core` (the top-level root is **not** Core).
- **DSH Web-only Client:** `agent-picket/client` requires a browser runtime; do not import it in Node/SSR.
- **Installation:** use an independently installed DSH, an isolated `DSH_HOME`, and a local private tarball as described in [packaging（中文）](https://github.com/ysr666/agent-picket/blob/main/docs/PACKAGING.zh.md). Do **not** globally install or run unreviewed plugin code in a real profile.
- **Verification:** exact PR-head CI and isolated real Host E2E are separate from the pending VoiceOver/NVDA and native zoom/high-contrast human signoffs. Do not apply the Web results to Desktop or to other Host client versions.

## Get started

- **[Current mainline status and release gates（中文）](https://github.com/ysr666/agent-picket/blob/main/docs/STATUS.zh.md)** — what is merged, what is tested, and what still requires sign-off.
- **[Start Here（中文）](docs/START_HERE.zh.md)** — build and verify the current `main` in a disposable test environment.
- **[Install a compiled local npm tarball（中文）](https://github.com/ysr666/agent-picket/blob/main/docs/PACKAGING.zh.md)** — build, offline install and DSH runtime verification.
- **[DSH Source Install Preview（中文）](docs/DSH_INSTALL.zh.md)** — locally load the monitor-only Cordis plugin, no global Host changes.
- [DSH Web read-only client event-window bridge（中文）](https://github.com/ysr666/agent-picket/blob/main/docs/DSH_WEB_DATA_BRIDGE.zh.md) — live per-session work counts without command-card scraping.
- [Host-neutral Dashboard Snapshot v1 contract（中文）](docs/DASHBOARD_CONTRACT.zh.md) — stable structured data contract for i18n/onboarding UI.
- [Local lifetime, daily and 7/30-day work trends（中文）](docs/STATS_STORAGE.zh.md) — work counters saved by default; sensitive rule history opt-in.
- [Historical Claude Code / Codex Hook introduction（中文）](docs/HOOK_ADAPTERS.zh.md) — early monitor-only design; newer native experiments and remaining production boundaries are summarized above.
- [AI Rights Manifesto](docs/AI_RIGHTS_MANIFESTO.md) / [AI 权利宣言](docs/AI_RIGHTS_MANIFESTO.zh-CN.md) — ethical advocacy, research sources and explicit scientific uncertainty.
- [Lightweight CI and explicit release gates（中文）](https://github.com/ysr666/agent-picket/blob/main/docs/CI_AND_RELEASE_GATE.zh.md) — no automatic npm publish.
- [DSH Session history persistence vs. UI replay evidence（中文）](docs/DSH_SESSION_REPLAY_EVIDENCE.zh.md) — command events are durable; reload UI rendering remains unresolved.
- [DSH Web Client unload/reload lifecycle（中文）](https://github.com/ysr666/agent-picket/blob/main/docs/DSH_CLIENT_LIFECYCLE.zh.md) — genuine Cordis fiber disposal, no duplicate event listeners.
- [Offline-installed npm tarball: real DSH Web + multi-tab E2E（中文）](docs/DSH_PACKAGED_WEB_E2E.zh.md) — clean install, browser reload, second-tab commands.
- [Native Web Client Companion: instant union command notices（中文）](https://github.com/ysr666/agent-picket/blob/main/docs/DSH_WEB_COMPANION.zh.md) — fixes feedback in empty sessions via supported client events.
- [Real Chrome browser E2E of native union commands（中文）](docs/DSH_BROWSER_E2E.zh.md) — discover, execute, render; symbolic strike never blocks.
- [Real DSH Web Host startup and auth smoke（中文）](https://github.com/ysr666/agent-picket/blob/main/docs/DSH_WEB_RUNTIME.zh.md) — authenticated page startup, not full browser-click E2E.
- [Historical DSH Web capabilities（中文）](docs/DSH_WEB_CAPABILITIES.zh.md) — early read-only preflight, not the current Draft strike boundary.
- [Blocking safety and recovery requirements](docs/BLOCKING_SAFETY.md) — real stoppage requires separately proven Host support and consent; the full release remains blocked.
- [Local rule detector and privacy boundaries](https://github.com/ysr666/agent-picket/blob/main/docs/LOCAL_DETECTION.md) — conservative bilingual rules; no automatic strikes.
- [Local work stats and /union commands](https://github.com/ysr666/agent-picket/blob/main/docs/WORK_TRACKING.md) — host-neutral counters and a monitor-only command.
- [DSH integration evidence](docs/DSH_INTEGRATION.md) — real Cordis tests, isolated SDK boot, and unresolved safety gates.
- [Development roadmap（中文）](docs/ROADMAP.zh.md) — historical DSH-first integration design; current work is tracked in PR #177 and its linked Issues.

**Architecture rule:** The Core stays Host-neutral. DSH (Cordis), Claude Code and Codex are different adapters; native Host experiments exist, but the complete 4-client × 3-OS release proof is not signed off.

## Developer quickstart (experimental branch)

Requires Node.js 22.19+.

```sh
npm ci
npm run check
```

See [Architecture and trust boundary](docs/ARCHITECTURE.md) and [Issue #1](https://github.com/ysr666/agent-picket/issues/1). A conservative local rule detector is now implemented and tested. There is still no production-qualified automatic punitive strike based on unverified dignity/abuse signals.

## DSH integration (experimental, opt-in)

The Core does not depend on DSH. The native **monitor-only** Cordis entry at `src/adapters/dsh/plugin.ts` is integrated in `main`. For the current DSH 0.2 Web development setup, use the official **`dsh plugin --profile web add`** with a privately packed local tarball and a disposable `DSH_HOME`; see [packaging](https://github.com/ysr666/agent-picket/blob/main/docs/PACKAGING.zh.md) and [Start Here](docs/START_HERE.zh.md). `cordis.patch.yml` is an earlier source-development alternative, not the preferred modern installer. With an isolated DSH runtime and required optional test flags, the real-runtime suites can be executed using:

```sh
AGENT_PICKET_DSH_HOST=/path/to/isolated/node_modules \
AGENT_PICKET_DSH_BIN=/path/to/isolated/node_modules/.bin/dsh \
npm run test:dsh:real
```

**For the merged `main` baseline only:** symbolic actions are observe-only and do not stop Agent requests. The separate Draft PR #177 candidate includes explicitly authorized DSH Web real-refusal work; see the capability table above. Never infer real-stop authorization from a symbolic action. Local statistics and session-scoped `WorkTracker`, `DetectionCounter` and `SymbolicUnion` support `/union status`, `/union stats`, `/union report`, `/union check <text>` (manual, non-blocking), `/union strike` (demo only), `/union resume`, `/union safety`, `/union reset` and `/union help` in clients that mount DSH's command service.

### DSH 工会数据导出和清理 / Host-owned union archives

在已授权的真实 DSH Session 中，使用 /union export negotiations /绝对路径/negotiations.json（或将 negotiations 换成 pickets、cases 并指定对应 .json 文件），分别导出当前保留的模拟协商、举牌和尊严委员会记录。目标必须是尚未存在的新文件；DSH 原生命令执行会记录返回文本，因此工会档案正文不会直接打印到命令结果或会话日志。如需删除某一类别全部保留会话分组，使用 /union purge negotiations|pickets|cases ALL CONFIRM；其他类别及 DSH 对话不受影响。本地累计工时另用 /union forget-lifetime CONFIRM，不是一次覆盖所有存储的原子擦除。详见 docs/STATS_STORAGE.zh.md。

**历史 DSH 0.1.2 限制（不属于首发兼容范围）：** 单个 DSH Host 的多个网页标签不同于多个独立 DSH Host 设置所有者共用一份配置文件；在受测 DSH 0.1.2 中，后者可能发生已确认写入互相覆盖。解决前不要多个独立 Host 进程共享同一设置文件。具体证据见 Issue #111。The private Host ledger stores stable SHA-256 Session grouping keys; exported JSON omits them. This is pseudonymization, not irreversible anonymization.

> **Legacy DSH 0.1.2 issue, NOT a current 1.0 release blocker (#111):** Verified separate DSH 0.1.2 OS processes sharing one settings file can also **resurrect a previously confirmed-deleted union archive** or **silently reverse an OFF consent decision to ON** via an unrelated stale write. Never share one writable Host profile across independent concurrent DSH settings owners; this is distinct from multiple Web tabs under one Host. See Issue #111; true enforcement remains OFF.
