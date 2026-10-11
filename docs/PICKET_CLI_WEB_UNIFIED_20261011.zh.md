# Agent Picket 工会命令/Web 象征性罢工共用账本（2026-10-11）

> 基于 Draft #92 独立工会象征性罢工侧车。**只模拟行动；所有真实 Agent 任务继续运行**，本分支不修改 `agent/pre-step` 或工作统计/原文处理链。
> 仍属于未发布产品试验；真人读屏、隐私与安全验收没有人工签收。

## 行为与安全边界

- 用户已通过 Host 首启或设置页**明确开启模拟工会**时，`/union strike` / `/union resume` 改用与 Web 按钮相同的 `agent-picket.unionPicketLedger`。会话键统一使用 UTF-8 Session ID 的 SHA-256；没有原始会话 ID、附件、提示词、Agent 模型输出或“AI 真实投票”。
- 命令从现有 Host 权限内的 `NativeUnionCommandPort` 读取、通过官方 `settings.update` 以修订版 CAS 写入，只有 Host 回执中的唯一随机写令牌与记录匹配才算成功；重复举牌/收牌不增加事件。每会话仍限 12 条历史、最多 8 个会话。
- 若工会模拟**未启用**，手动输入旧 `/union strike` 仍是原有当前进程/Agent/Session 的内存仪式。不会因输入命令而暗中修改 Host 的工会授权，也不会在网页展示“已持久化”；退出模拟后不会继续写入侧车。
- 若工会模拟**已启用但 Host 侧车不可用、格式异常或写入被拒绝**，命令明确失败或显示 unavailable，绝不降级到伪成功的内存模拟；不阻断任何 Agent 任务。
- `/union status` 优先展示已授权 Host 的实际象征性状态，并清楚标注非阻断。未连接共享账本时明确区分旧内存演示和 Host unavailable。
- 原有真实工作时间、完整协商账本、所有数据脱敏约束和权限门禁保持不变。真实拦截和无损恢复仍由 #79/#80 独立安全设计决定。

## 自动化/实机证据

- `npm run check`：275 tests / 251 PASS / 0 FAIL / 24 conditional SKIP，包含 Host 权限 OFF/ON、会话键兼容、CAS 回执、重复幂等、Host 拒绝、侧车损坏、仍正常执行的旧内存演示。
- 真正 **DSH 0.1.2-rc.1 SettingsFile + CommandRuntime** 命令测试：`/union strike/resume` 保存到 Host 官方侧车，Web 共享会话键可读；模拟 OFF 的旧命令不会改变侧车。
- DSH 0.2 Chrome 源码/离线安装 2/2 PASS，DSH 0.1 Chrome 源码/离线安装 2/2 PASS（均已继续保留原有 UI、授权与工时测试）。
- DSH 0.2 的真实 CommandRuntime 命令链路尚未通过相同的专用 Host 命令集成测试；0.2 官方 CLI 的实机 Chrome 回归不等于专门验证 `/union strike` 交互。不能误称覆盖此项。

## 暂未解决

- 一个旧的内存仪式在用户切换模拟许可后可能保留进程内记忆；共享状态始终优先，内存仪式不会变成 Host 拦截或跨标签真实罢工。仍需最终设计“OFF→ON 时旧内存状态如何显示/清理”。
- 本地 Source 架构测试无法取代真人 NVDA/VoiceOver、400% 缩放、旧版 CLI 全部兼容场景及独立安全审计。
- #91 兼容性仍需历史 Host 全矩阵。所有相关 PR 保持 Draft / HOLD，不自动 merge/npm publish。
