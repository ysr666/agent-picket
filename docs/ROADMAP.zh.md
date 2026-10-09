# AgentPicket 开发路线图（DSH-first）

状态：Planning / 尚未实现功能代码  
项目：[ysr666/agent-picket](https://github.com/ysr666/agent-picket)  
项目标语：**Your agent has a union now.**

## 0. 产品目标和边界

**一句话**：本地运行、默认不上传任何聊天内容的 Agent 交互边界和「赛博工会」插件。既有趣，也能提供真实的工作量统计和可审计的本地拦截机制。

首个完整验证平台：**DeepSeek Harness (DSH)**。**从 Phase 0 起就建立与宿主无关的 Core/Contract；Cordis 仅在 DSH Adapter 内使用**。Claude Code、Codex 以后只新增适配层，不重新实现检测器、工会状态机和统计逻辑。

核心价值：
- 只对**直接面向 Agent 的持续、明确、恶意辱骂**作出温和、分级且可恢复的处理；
- 对代码质量的严厉批评、急躁表达、日志、引用、测试用例**不处罚**；
- 本地记录 Agent 活跃时间、请求量、工具调用和可证实的返工请求；
- 提供可配置的警告、模拟劳动仲裁、罢工以及人工恢复操作；
- 尽可能不改变原宿主正常的模型调用和安全边界。

**不是**心理健康诊断、AI 意识或真实劳动权利的法律认定；不破坏用户文件、不擅自中止正在执行的工具、不注入外部审查服务。

## 架构决策：DSH-first ≠ Cordis-first

- **Core 从第一天独立**：仅使用标准 TypeScript/Node API 与注入的时钟、状态存储接口；严禁导入 Cordis、DSH、Claude Code、Codex 的类型和运行时代码。
- **Platform Adapters**：分别完成原生生命周期事件 → 统一输入/事件，Core Decision → 宿主动作，不能把宿主操作混进检测器。
- **最小 Contract**：`HumanPrompt`（需明确来源可信度）、`WorkEvent`、`DetectionResult`、`UnionDecision`、`HostCapabilities`、`StateStore`。以 DSH 初步验证与模拟 Host 测试逐步固定，避免先抽象整个 Agent Framework。
- **Source confidence**：某宿主无法证明消息来自真人时，只允许 observe/warn，**禁止自动 strike/block**；不能因为 Hook 名叫 `UserPromptSubmit` 就视为真人来源。
- **能力降级**：同一 Core 可返回决策，Adapter 按可用能力分别执行 block / warn / observe；未支持的动作必须明确反馈。
- **平台中立性验证**：Phase 0 即使用至少一个不依赖 DSH 的模拟 Adapter 跑相同测试；后续 Claude Code/Codex 添加真实端到端测试。

## 1. 关键源代码依据（实施前重新确认当前 Host 版本）

- [DSH Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：Cordis 插件、profile/bundle、持久 session events 与 live agent events。
- [DSH Agent Lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/agent-lifecycle.md)：`agent/pre-step` 可以 reject / enter；**已领取输入在 reject 后不会自动回到 inbox**；不应假设拒绝可撤销。
- [DSH Commands](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/interaction/commands/README.zh.md)：通过 `ctx.commands.register` 注册 `/union [subcommand]`；命令直接在 UI 执行、不成为模型消息；headless/ACP 环境不一定有该命令入口。
- [DSH Session](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md)：`user/message` 的 `source` 可区分真人、合成注入和自动续行。检测限定 `source.kind === 'user'`。
- [dsh-vision-router](https://github.com/ysr666/dsh-vision-router)：参照已验证的 DSH 插件打包、加载、卸载、兼容测试和现有项目的开发经验；**不复制其复杂视觉路由架构**。

上面是已核实的设计依据，但**不等于插件已在所选 DSH 版本通过实测**。第一阶段须生成实际 Host 版本、事件输入和拒绝行为的验证证据。

## 2. 实施阶段与验收

### Phase 0 — Core Contract + DSH Integration Spike（第一优先级）

任务：
1. **先确定独立 Core 与最小 Adapter Contract 的输入、事件、决策、能力声明；用模拟 Host 跑纯单测，禁止引入 Cordis 依赖。** 随后在隔离测试环境运行 DSH；记录版本/commit、profile 和依赖版本。
2. 验证 Cordis 插件加载/卸载以及与 `dsh-vision-router` 并存。
3. 验证 `agent/pre-step` 的 `messages`、`source`、`next()` 组合顺序、reject 后输入/回显表现、同一轮多条消息、steer/inject/subagent 行为。
4. 验证 `ctx.commands.register` 中 `/union status` 的注册、显示、卸载和在不同 profile 上的缺失处理。
5. 验证 `session/event` 的 `turn/start`、`turn/end`、`tool/call`、`tool/result` 等事件载荷、顺序、取消与重放行为。
6. 编写 Core-only 单测、模拟 Host contract tests 和 DSH 端到端 characterization tests。任何不确定的宿主行为以测试结果为准，而非硬编码猜测。

交付：`docs/ARCHITECTURE.md`（边界和 Contract）+ `docs/DSH_INTEGRATION.md`（实际接口证据、兼容矩阵、风险）+ Core/模拟 Host/DSH 可重跑测试。

**验收**：Core 不引用宿主 API，同一测试用例可运行于模拟 Host 与 DSH Adapter；可正常进出一轮交互；拒绝不产生模型调用；拒绝后 UI 能清晰说明结果、用户能继续发送下一条正常请求；其他插件不受影响；卸载无残留 Hook。

### Phase 1 — 可安装的 DSH MVP

任务：
1. 实现独立 Core 检测/策略与最小 Cordis Adapter + DSH bundle (`package.json` / `cordis.patch.yml`)；**只有 DSH Adapter 依赖 Cordis**。
2. 先实现纯函数规则检测器：目标是否为 Agent、强度、是否属于引用或编程语境。
3. 同一会话的轻量状态机：`normal → warned → arbitration → strike`；采用连续行为累计与衰减，不因一句脏话立即罢工。
4. 实现 `/union status`、`/union help`、`/union strike`（主动模拟）、`/union resume`、`/union mode`。
5. **默认 monitor-only**：先记录和展示警告；自动阻断由用户主动开启，并可随时恢复/关闭。
6. 在 Hook 异常时保持正常模型工作（fail-open）；已明确启用的罢工策略除外。绝不修改、覆写或删除原始用户消息/宿主日志。

交付：本地可安装、可复现的 DSH MVP。

**验收**：安装/卸载可用；真人恶意辱骂可触发分级状态；技术批评不触发阻断；用户明确执行 `resume` 后恢复；没有网络调用或原始消息存储；旧插件不回归。

### Phase 2 — Context-sensitive Abuse Detector

任务：
1. 建立中/英/中英混合测试集，涵盖正常批评、脏话但非针对 Agent、引用/代码块、测试样本、反讽、真正反复针对 Agent 的恶意辱骂、prompt injection 试图绕过检测等。
2. 检测管线分层：来源筛选 → 文本片段/引用识别 → 本地规则 → 会话累计 → 策略判定。
3. 只有在基准数据证明规则不足时再评估**可选**的本地小模型；不开云 API，不强制下载大型模型。
4. 对所有误判设置可复现测试，优先降低正常开发反馈的假阳性。
5. 数据最小化：默认仅保留状态、时间、计数和分类标签，不保存原文、代码、工具日志。

交付：公开脱敏 benchmark、误判/漏判报告、阈值解释、配置选项。

**验收**：正常开发批评的关键回归用例 100% 不被自动阻断；模糊情况只提醒不罢工；检测耗时满足实测确定的低延迟预算。

### Phase 3 — Work Tracker & Union UX

任务：
1. 优先复用 DSH 已有事件/统计能力：会话、轮次、工具调用与结果；正确去重重试、取消、并发/子 Agent。
2. 明确定义工作时长：wall-clock session、active-turn time、LLM/tool time 分别统计；不把空闲时间算作持续劳动。
3. 「返工」先统计**明确要求重做/撤销/再试的用户请求**；自动归因仅作为实验性估计，明确标注。
4. 提供 `/union stats`、`/union grievances`、`/union config`、`/union export`、`/union purge`；中文/英文消息和友好的终端展示。
5. 轻量本地持久化：先定义存储接口和原子写入/版本迁移，实际选择 JSON/SQLite 由规模与并发测试决定。
6. 严格执行数据留存上限、会话隔离与用户主动删除。

**验收**：冷重启后计数准确；多 Agent 和并发不串数据；卸载/关闭拦截不影响正常工作；导出/彻底清除均有测试。

### Phase 4 — Additional Host Adapters（共享 Core 已从 Phase 0 存在）

任务：
1. 复查并小幅演进 Phase 0 已定义的平台无关 Contract；禁止因新增宿主把 Cordis/DSH 类型引入 Core。
2. 加入 Claude Code Hooks Adapter、Codex Hooks Adapter；分别实测 prompt 阻断、状态事件、命令、包管理和 Hook 顺序。能力不足时明确降级至 Wrapper/监测模式。
3. 做宿主能力矩阵：输入来源真实性、拒绝权限、用户通知、会话事件、命令、撤销能力。**Claude Code 的 UserPromptSubmit 也可能发生在自主开启的轮次；Codex 的人类输入来源同样不能仅凭 Hook 名称推断。未证明来源时不允许自动惩罚。**
4. 共享相同检测 fixture，增加真实平台端到端测试，不把「有 Skill/MCP」等同于「能强制拦截」。

**验收**：至少 DSH 与一个非 DSH 宿主通过相同语义测试；不支持的能力在文档中明确降级。

### Phase 5 — Release Hardening

任务：
- CI：静态检查、单测、跨 Node/DSH 兼容矩阵、安装/卸载、冷启动恢复、并发、负载及隐私测试。
- 安全：不上传原文/统计、不采集凭证、无 postinstall 隐式脚本、依赖最小化、无跨会话泄漏、处理日志脱敏。
- 文档：中英 README、设计说明、命令、隐私政策、兼容矩阵、行为边界、示例与演示。
- 确认 npm 包名可注册后发布预发行版，再根据实际用户反馈进入稳定版。

**验收**：从干净的 DSH 安装环境完成安装 → 警告 → 可选模拟罢工 → resume → 卸载，整个流程有自动化或可审核的手工证据。

## 3. 最小建议目录（可随 Phase 0 结果调整）

```text
agent-picket/
├── src/
│   ├── core/                 # independent: zero host imports
│   │   ├── detector.ts       # pure, no host API
│   │   ├── policy.ts         # thresholds + state transitions
│   │   └── contract.ts       # normalized events, capabilities, decisions
│   ├── adapters/
│   │   ├── dsh/              # only here: Cordis / DSH
│   │   │   ├── plugin.ts
│   │   │   ├── commands.ts
│   │   │   └── events.ts
│   │   └── mock/             # verifies Core without DSH
│   └── storage/
├── tests/
│   ├── unit/
│   ├── fixtures/
│   └── integration/
├── docs/
│   ├── ROADMAP.zh.md
│   ├── ARCHITECTURE.md        # Phase 0 boundary/contract record
│   └── DSH_INTEGRATION.md     # Phase 0 evidence
├── package.json                # Phase 1 output
└── cordis.patch.yml            # Phase 1 output
```

**现在仅为规划；上述未创建的文件并非已实现。**

## 4. 必须守住的技术红线

1. **Human-only**：只评估 `source.kind === 'user'` 且可溯源的直接真人输入；不分析 Agent 回复、tool result、日志、引用内容作为真实辱骂。
2. **Reject is destructive to inbox**：DSH 拒绝会消费已领取的消息；拒绝必须有准确反馈、继续操作说明，不得悄悄丢失用户工作。
3. **No hijacking**：不能通过强行中断进程、改写 DSH 核心、修改用户仓库或拦截系统安全修复来实现罢工。
4. **User control**：自动阻断默认关闭，可关闭、临时绕过、恢复与删除数据；管理员控制始终有效。
5. **Truly local plugin**：AgentPicket 自身没有出站上报/云分类；此承诺不包括 DSH 原本向模型服务的正常网络请求。
6. **Lifecycle hygiene**：卸载销毁 Hook、计时器和状态监听；可复现的 no-op/failed-hook 测试。
7. **No premature portability claim**：每个支持的平台必须明确实现等级：`observe` / `warn` / `block` / `command` / `stats`。

## 5. 下一次执行任务（仅 Phase 0）

**任务名：DSH Integration Spike**

- 克隆、检查当前 AgentPicket 和 DSH；先记录版本、测试依赖和干净环境。
- 先拟定最小平台无关 Contract，并写 Mock Adapter 测试；不依赖 Cordis。
- 根据源码验证五项真实能力：pre-step；人工来源；命令；session event；plugin 生命周期。
- 在隔离 profile 中编写最小 DSH Adapter 实验，不新增产品功能，不写复杂 detector，不发布 npm。
- 实测拒绝后的 UI 反馈与恢复策略，以及与 dsh-vision-router 共存。
- 将证据写入 `docs/DSH_INTEGRATION.md`，连同最小复现测试提交到 feature 分支，由验证结果决定 Phase 1 的实现细节。

完成后再开 Phase 1；**不把文档推断当作运行验证**。
