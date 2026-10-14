# Agent Picket Windows P0 · 直接复用 DSH 官方持久 Turn 事件的源码核实

核查日期：2026-10-14。范围：官方 DSH tag `dsh-v0.2.0-rc.2`、`dsh-v0.2.1-alpha.2`，及 Agent Picket 集成基线 `integration/agent-picket-1.0-20261012@2e0b3d7`。

## 这次发现了什么现成接口

两版 DSH 官方源代码都具有 `ctx.sessionPersistence`（抽象持久会话服务），通过 `list()` 枚举持久化会话，`open(id,'read')` 获取只读 `SessionHandle`，`read(offset,length)` 读取原样持久事件，`flush()` 是正式持久化屏障，`close()` 释放读句柄。其定义（两版同类接口）在 `packages/session/session-persistence/src/index.ts` 与 `handle.ts`。

官方 `SessionEvent` 已有独立 `seq`、Unix epoch 毫秒 `time`、`turn/start {turn}` 和 `turn/end {turn,reason}`；可以显式区分 `completed`、`aborted`、`blocked`、`error`、`interrupted`、`forked` 和 `max-tokens`，而不是从聊天消息推测时间。`SessionHandle.inheritedEventCount` 标注 Fork 复制的历史前缀，必须从这个精确 cut 后读取每个子 Session 的**自有事件**，否则父子事件会被重复累计。两个版本都有该字段。

**数据已由 DSH 自己的官方 SessionPersistence 后端存储；在 DSH 平台上，不必为了这个只读派生任务先写自己的 NTFS WAL 或 SQLite。** 但官方持久存储的安装/能力组合仍是可选项，不能把 `ctx.sessions` 内存态或任何 `snapshotEvents()` 视为已验证的可重启全量工时源。

权威可公开查看的版本源码：
- [0.2.0-rc.2 persistence](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/session/session-persistence/src/index.ts)
- [0.2.0-rc.2 handle](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/session/session-persistence/src/handle.ts)
- [0.2.0-rc.2 events](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/core/session/src/types.ts)
- [0.2.0-rc.2 lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/docs/agent-lifecycle.md)
- [0.2.1-alpha.2 events](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.2/packages/core/session/src/types.ts)
- [0.2.1-alpha.2 persistence](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.2/packages/session/session-persistence/src/index.ts)

## 时序上的重要限制

官方生命周期顺序是 `turn/start → ... → agent/turn-stopping（serial）→ turn/end`。当前 Agent Picket 的真实 Goal 停工判断挂在 **`agent/turn-stopping`**。因此在这个钩子里只读扫描**持久已完成 Turn**，不能看到当前 Turn 后续尚未写入的 `turn/end`；如果当前 Turn 恰好使总工时达到 8 小时，直接扫描可能要到下一个安全边界才能看见它。绝不能把当前未结束 Turn 当成已完成、也不能仅用时钟预测可阻断工时。

官方 `SessionPersistence.flush()` 是 durable barrier，但**不能凭一个只读 `list/read` 自动假定所有正在缓冲的 `turn/end` 均已提交**。必须在真正的 Goal Round 调度时序中核查“事件完成、Host flush/commit、下一个自动 round 入队/运行”的因果顺序，采用可等待且不吞用户请求的安全协商方式。部分已确认持久历史属于 *durable prefix lower bound*（已知完成的下界），不代表完整当前工时覆盖。

## 本轮精简验证代码（不安装，不启用阻断）

`tests/helpers/dsh-persisted-turn-projection.ts` 使用上述公开 `SessionPersistence` **结构接口**，只调用 `list/open(read)/read/close`，以 Fork cut 排除继承内容，校验事件连续序号/轮次/时间/结束原因，仅统计 **`reason.kind==='completed'` 的真正已结束 Turn**，按结束时间归入 UTC 日。不同 Session 的工作时长按事件工作量**加和**，不是多人并行 wall-clock 区间的去重并集。它不返回任何原始 ID、提示词或附件，也不新建文件、缓存或数据库。扫描上界一旦无法覆盖则返回 `null`，不以半截前缀伪造完整数据。

测试覆盖：两个 Session 7h→8h、Fork 继承不重复、`turn-stopping` 尚未 `turn/end` 的 Turn 不计时、取消/中断/超限等结束原因不误加、UTC 跨日、坏 seq/读失败/重复 Session ID/超资源上限返回 `null`、原始敏感字段不进入输出。

**统计口径仍需产品确认**：原 `WorkTracker` 把任何 `turn/end` 按已观察的起止时间计入；这个保守读取实验目前只认 `reason.kind='completed'`，因此可能少计失败但真实消耗的工作时长。要作为正式八小时工会规则的一部分，必须先确定成功完成与失败/取消/耗尽 token 等是否计入劳动及何种可验证时长，而不是用新方案暗中改口径。

## 目前不能称作已完成的验收

当前 Desktop Commander 的 Mac 与另一个远程设备**均离线**。本轮不能进入实际 DSH Web/Windows Host 启动并读取真实 `sessionPersistence`，也不能宣称 Windows 安装版 Goal 已经使用这个来源阻断/复工。本实验测试中的 `PersistedWorkPort` 是一个**公开 API 形状的替身**，仅验证投影算法；不是原生 Host API 实测。

下一轮优先事项不是自研存储：在可达 DSH 原生 Host 中验证注册并注入的 `sessionPersistence` 能实际 list/read 同一 profile 中所有相关 Session、覆盖 Fork/重启/多 Session，精确核实 `turn-stopping` 和 `turn/end` 之间的实际安全决策点，并复用既有用户授权与官方 Goal CAS。从源码推测不足时继续标记 NO-GO，切勿把 CI 純逻辑 PASS 冒充官方 Host 端到端 PASS。若官方部署未安装可靠 persistence provider，才考虑将 SQLite 作为**一个**后备 DurableStats 实现。

保持所有 PR 为 Draft、#121 仍 OPEN、`release:gate` 仍 NO-GO；不修改正式 Windows stats constructor、用户授权、Goal 状态机或发布矩阵。
