# Agent Picket · 官方发布版 DSH SDK Host：持久 Turn → 自动 Goal 真实阻断（2026-10-14）

## 这不是 mock：验证对象

目标发行版：`@deepseek-ai/dsh@0.2.0-rc.2`（GitHub Actions 从 npm 官方包直接安装到隔离 `.dsh-host-probe`，非 Agent Picket 新依赖）。

在 GitHub Runner 上独立启动 **DSH 发布版 CLI**，`--profile sdk-minimal --patch <isolated>`，使用官方 JSONL SessionPersistence、官方 GoalService、官方 Goal-round-driver 和隔离离线 LLM。真正的 Agent / Session 生命周期会自动转动，SDK JSON-RPC 客户端调用 `initialize`、`session/prompt`、`shutdown`。原始真实模型一律不访问。

插件测试夹具仅为验证官方接口：在一个**独立合成 Session** 通过官方 write Handle 创建+append+flush+close 7h 或 8h 的 `turn/start` 和 `turn/end`。测试消费者在下一**自动 Goal** 的 `agent/pre-step` 再用官方 `list → open(read) → read → close` 读取。只有严格 `source.kind==='goal'`、`round>0`、`messages.length===1`，官方 Goal id+revision+phase+activation 匹配，且读到已确认足够工时时才执行 `goals.block()` 并拒绝这**一条**自动 round。它既不拒绝普通用户消息，也不复制/重放提示词和附件。

## 最新原生结果

- **首次通过的发布版 Host 运行**：[GitHub Actions run 38546954983](https://github.com/ysr666/agent-picket/actions/runs/38546954983)：Ubuntu Node24 · `PASS`。真实日志 7h + 测试授权：3~4 次模型调用（自动 Goal 正常）；8h 无测试授权：3 次模型调用（未触发 Picket）；8h 测试授权：**1 次模型调用**、`goals.block` 真正使 Goal `blocked/disarmed` 且 revision +1，记录官方 `goal/change`。
- 已进一步在测试分支新增**真实官方 Goal CAS resume、复工后继续自动轮次及同日不重复罢工**的检查。以上新增的恢复测试必须以对应最新 GitHub Actions PASS 才可签收，不把旧 run 当新测试证据。
- 独立 [#145](https://github.com/ysr666/agent-picket/pull/145) 的原生官方 provider 四平台冷读以及第三方 Cordis inject 已 4/4 PASS；[#144](https://github.com/ysr666/agent-picket/pull/144) 的投影测试仍仅使用 API 形状替身。这三种层级不可混写。

## 源码证据和实际调度

- 官方 `packages/bundle/base/cordis.patch.yml` 默认挂载 JSONL provider；`sdk-minimal` 也有 `sessions` provider 行（它实际提供 `ctx.sessionPersistence`）。
- 官方 `agent-loop/src/agent.ts` 的 `agent/turn-stopping` 在当前 `turn/end` **之前**。绝不能在此阶段计入当前尚未结束 Turn。
- 官方 `goal-round-driver/src/index.ts` 首先在 idle 状态下 `await ctx.sessions.flush(agent.session)`，检查点成功才判断 active+armed 并发出下一 round；下一 `agent/pre-step` 是 DSH 提供的可等待准入检查点。官方 Goal driver 会验证该自动 round 来源、Goal id/revision，并拒绝失效消息。
- 不需要往 DSH 内核中私自写入、修改 Session 状态或再开发 NTFS WAL、SQLite 去跑这个测试。

## 不允许把这次实验宣传成什么

1. **不是正式 Agent Picket 插件的授权**。测试的 `consent` 只是环境变量开关，不能代表真正用户在首次引导里批准的 Host 持久设置；生产版必须继续调用现有 `readHostGoalStrikeConsent`。
2. **不是完整可信生产工时源**。此处是隔离、已知数量的合成 Session。实际 `list()` 可能忽略损坏或不可解析 Header、不能自动证明所有历史会话均被枚举；Fork inherited 前缀、双进程并行、掉电等场景还需审查。在未证明可信覆盖之前，真实停工仍不能以不完整前缀冒充 complete。
3. **不是 Windows/Web/Desktop 1.0 E2E**。本次是在发布版 **SDK-minimal Host**（不是浏览器/桌面正式插件安装 UI），离线合成工作，未验证原始人类附件/消息的完整预提交保留与重建。
4. **不能暗改 #77 的劳动定义**。测试暂使用 completed reason，并按结束 UTC 日归类；WorkTracker 过去计入任意已观察的结束原因。必须与产品原定义对齐，才能替换生产统计来源。
5. **仍要测试取消授权、重启、官方 Goal 恢复、不可读日志降级、HQ 实时修订和不同客户端**。所有相关 issue 保持开放，发布总门禁 NO-GO。

## 工程交接

PR [#146](https://github.com/ysr666/agent-picket/pull/146) 为独立 Draft、Base `integration/agent-picket-1.0-20261012`，不改任何生产插件、包预算或 release gate。具体执行：
`npm install --prefix .dsh-host-probe --no-save --no-package-lock --no-audit --no-fund @deepseek-ai/dsh@0.2.0-rc.2`
然后 `node scripts/verify-dsh-official-host-goal.mjs`。离线测试不读 `~/.dsh`，所有活动均放在 Runner 临时目录，结束后清理。不得声称本 test-only service 的完整性具备证明力。
