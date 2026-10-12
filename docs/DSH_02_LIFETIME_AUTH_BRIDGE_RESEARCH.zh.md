# #78 DSH 0.2 官方授权长期工时只读桥接候选（2026-10-11）

> **状态：已审查本机 DSH 0.2.0-rc.2 安装包的公开 TypeScript 接口与执行逻辑；尚未在 Agent Picket 中注册路由或传输真实长期数据。不是已经上线的功能。**

## 现状核对

- Agent Picket Node Host `DurableStats.snapshot()` 和 `snapshotDays()` 已有独立本地工作计数；`readDshDashboardSnapshot()` 仅在 Host 上可获得它们。
- DSH Browser 的 `agentPicketDashboard` 目前只提供 `SessionEventSource` 的已加载窗口；`lifetime: null` 和 `lifetimeVisibility:'not-exposed-by-client'` 是真实可见性，不可解释成用户历史为零。
- 浏览器直接读取 WAL、本地路径、聊天卡片或未经授权的 Host 文件均不合适。

## 已查证的 DSH 0.2.0-rc.2 扩展点（仅此版本）

在官方包 `@deepseek-ai/dsh-client-connection/lib/types/rpc.d.ts` 中：

1. Host `HostConnectionRpc.handle(channel, handler)` 可以注册一个官方、生命周期拥有的绝对 RPC channel；handler 接收 `(endpoint, payload, signal, peer)`，并返回 `{ok,value}` 或带错误码的合法结果。
2. Client `ClientConnectionRpc.call(channel, endpoint, payload, signal?)` 使用匹配的官方 RPC carrier，承诺返回 success/failure 包装。
3. Host `HostConnectionService.register()` 实现先检查 Host/Origin 信任边界及浏览器身份认证，再分派合法 RPC；拒绝返回 401/403。源接口在 `dsh-client-connection/lib/types/rpc-host.d.ts` 及相应 `index.js`。调用归属 operator Peer，不等于允许无权限插件随意读取私有文件。
4. 该路径不能直接推断为 **0.1.2 兼容**、任何 Host 进程有 `connection` 注入、已授权 Agent Picket 命名空间可用，亦不代表已经验证过输出隐私或 UI 重载后的订阅行为。

## 下一项可实施的最小只读合同（先独立 PR）

拟使用仅含 work-only 聚合的 `agent-picket` RPC channel，例如 `work/lifetime`；实际端点名称必须先检查与宿主/第三方扩展的命名冲突：

- Host 层在进入持久化数据读取前，**重新读取当前真实 Union 授权**及工作统计的独立存储配置。若未授权、存储关闭/出错、非官方 Host 能力、不完整的数据，明确返回 disabled/unavailable 而非零。
- 只返回 `schemaVersion`、时间来源、`completedTurnMs` 与非敏感 `turnStarts/turnEnds/toolCalls/toolResults`，以及最多 7/30 个 UTC 按日工作聚合。输出不包含 `checked/safe/review/targeted` 及任何原文、消息/会话 ID、文件路径、指纹、平台凭据。
- 请求限定 7/30 天、固定 payload schema；Host 侧输出严格列举字段与安全整数。禁止任意命令、文件路径、查询字符串、原始 Host 类型直接透传。
- Browser 仅在获准且工会开关为 ON 时懒加载；连接重建重新授权/取数；OFF/切 Session 立即清除 UI 缓存、取消在途请求。跨标签不共享未经确认的本地缓存。
- 通过官方 `connection.rpc.call` 走经认证的 Host transport；不能自行调用 `fetch('/api/...')` 绕开 Cordis owner 或使用聊天命令返回值作为 Web 数据。
- 否定测试：401/403、其他标签、OFF 中途、失效 consent、重复/延迟请求、冷重启、Host 存储关闭、参数污染、恶意额外字段、浏览器抓包无敏感计数、兼容版本 fallback。
- 真实 0.2.0-rc.2 官方 `plugin --profile web add` 安装验证通过后，才将其接到 Union HQ；0.1.2 保持 `lifetime:null` 直到具体验证。独立原始人工隐私/网络审计另行验收。

## 为什么这次尚未在 PR #87 直接打开

#87 当前是工会视觉/事件互动产品 PR。贸然同时增加新的 Host 网络数据能力会扩大权限与审计范围；而且 DSH 0.1.2 和 0.2 的注入合同不同。这个调研结果可直接给 #78 的最小 Host/Client RPC 实现与权限测试开立独立分支。**现有统计不受此调研改动影响。**
