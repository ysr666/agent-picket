# Codex：轮次结束后工会暂停（1.0 产品收敛，2026-10-24）

## 正式交互

一次授权（首次启动默认关闭真实停工；设置内可开启、关闭，或选择每次确认）后，工会能够针对**指定 Codex Goal** 发起真实暂停。运行中的一轮对话、模型调用和工具执行不被强行中断；**当前 Turn 结束才停止下一轮自动续跑**。这是一种 Goal 续跑暂停，不是用户输入拒绝。

- 工会发起暂停：通过已授权的官方 Host Goal 状态写入 `paused`；当前 Turn 仍可以完成。
- 界面在当前 Turn 未结束时只显示“本轮结束后暂停”，不得提前宣称已经停工。
- 官方 `turn/completed` 后、下一轮自动 Turn 未启动，并且 `thread/goal/get` 确认 `paused`，才可显示“工会已暂停自动工作”。应当说明可在 Codex 中手动恢复。
- 人类明确恢复后，Goal 转回 `active`，正常调度下一轮自动工作；不得私自继续、篡改工作目标或重启先前已完成的 Turn。
- 普通用户消息及附件**没有被拒绝**，无需缓存、重放、手动重发；当前工具产物和完整回复按 Codex 原有机制保留。
- 这不是阻断所有新用户请求，也不是暂停任意正在运行的 shell 子进程；不宣称消耗额度真的耗尽。

## 验收与不能偷换的地方

官方 Goals 的自动续跑在 Turn 完成、线程空闲时检查状态。本路径只需证明当前工作完整结束、之后没有新自动 Turn、显式恢复成功、冷恢复可用，并保证用户可撤销授权。独立验证官方 Host 真实状态、指定 Thread/Goal 和进程所有权；跨进程不能使用未验证的陈旧写入覆盖新授权。

已有原生合成测试 `tests/codex-goal-controlled-boundary.real.test.ts`：在隔离 `CODEX_HOME` 使用本地模拟 Responses API 和真实 Codex App-Server/工具执行。Codex 0.164.0 macOS 的官方 `paused` 路径于 2026-10-24 单测通过；CI 扩充 0.164.0 Linux/macOS 实测，Windows 的轮次+工具完整跨平台证明待补。旧版 0.146.1 `blocked` 负面/边界对照继续保留。

**未完成**：在实际 Codex UI 中绑定 Agent Picket 的权威工会授权、轮次待停/已停视觉状态、可靠的用户恢复，以及各平台并发与真实用户体验验收。跨进程 Goal CAS 未由官方 `thread/goal/set` 协议显式提供。不能用仅有测试成功就宣称 1.0 生产停工可用或放行发布。

与 DSH “拒绝并丢弃新的输入请求”不同，该路径**不需要输入与附件恢复合同**。原有全项目 release gate 继续 NO-GO，修改其正式验收契约须独立审阅，不在实现本简化模式时暗中削弱安全门禁。

## 1.0 正式验收合同（Schema v4）

Codex 仅验收 `realEnforcement`、`informedHostConsent`、`turnBoundaryHoldAndResume`、`visibleHoldAndResume`，外加 Codex 每个操作系统既有的官方 Host 版本、独占 Goal 所有权与原子状态转换验证。`turnBoundaryHoldAndResume` 必须包含实际当前 Turn 的工具/模型完整结束、没有下一轮自动开始、重新连接仍保持暂停，以及人类明确恢复的证据。

Codex Goal **不再要求** `discardAndResubmit`、`verifiedHumanProvenance`（输入拦截意义）或 `visibleRefusalAndResume`（拒绝新消息意义）；人类授权并没有被免除，而是作为 `informedHostConsent` 独立证明。DSH Web/Desktop 和 Claude Code 的原有输入拦截合同不受影响。

发布清单仍全为 `not-verified`，即使当前 Mac/Linux 原生测试通过，既不自动写入 `verified`，也不允许 AI 绕过人工复核或 1.0 NO-GO。旧 Schema v3 不能被新校验器接受。

## #205：普通新任务绕过与受控客户端提交门禁

Codex 0.164.0 官方 App-Server 已真实复现：即使 `Goal=paused` 且当前 Turn 已完成，另一条普通 `turn/start` 仍可开始新的模型请求。这是**已确认的不安全覆盖缺口**，不是 CI 失败。不能把 Goal 自动续跑暂停宣传为“整个 Codex 停工”。

本仓库新增实验性 `client-new-turn-gate.ts`，提供受 Picket 控制的**客户端提交前门禁**。拥有真实 Host 授权、确切 Thread/Owner、已结束的轮次以及可展示工会通知的客户端，可以在构造与提交新输入前返回 `held`。门禁不读取、保存或重放提示词、图片或附件；由该客户端原有输入框保留未提交内容。Host 状态不明、来源不可信或客户端无法通知时，默认放行，不静默丢失请求。用户明确解除停工后，再由客户端按正常流程重新提交。

这是客户端配合的功能接口，**不是安装到所有 Codex CLI/Desktop/SDK 的强制 Host 安全屏障**。其他客户端仍可直接请求 `turn/start`，单次客户端检查与 Host 受理之间也并非原子操作。本仓库原生 Codex 测试新增 `manual-bypass` 场景，分别证明“正确集成的测试客户端不会发送请求”和“绕过客户端仍能执行”；后者 PASS 意味着**风险真实存在**。不得以此消除 #205 或将 1.0 `realEnforcement` 标记为已核实。正式全客户端覆盖，需要官方 Host 授权与原子级新轮次受理门禁，或逐客户端可信接入并明确降级范围。
