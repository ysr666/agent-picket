# #78 DSH 长期工时只读接口：官方 Connection Fetch 路由

> 状态：开发验证阶段 / 不等于浏览器长期统计已上线 / 只适用于经官方接口验证的 DSH 0.2 Host。

## 目标与来源

- `DurableStats` 已有本地 work-only 与可选的敏感辱骂分类汇总。以前 Web `agentPicketDashboard` 只能看到已加载 Session 事件，`lifetime:null`。
- 本分支不改变默认 WorkTracker，不持久化新数据，不采集任何提示词，也不改变 UnionEngine 的观察/拒绝策略。
- 经已安装 DSH 0.2.0-rc.2 官方包核实，可选 `connection.fetch.register` 负责官方 `/api` 精确 GET 路由；官方 Connection 先做 Host/Origin 浏览器认证，再分派请求。使用的是注册表而非自行开 HTTP listener。

## 实施

- Host 自动按需注册 `GET /api/agent-picket/lifetime/v1?windowDays=7|30`，仅在 Host 存在正式 Connection Service、插件存储正常、官方 Host 的工会许可目前 ON 时返回。
- **每次请求重新判断授权**，请求之后、返回之前二次检查；一旦用户关闭工会就停止暴露具体数据。只有 `?windowDays=7|30` 被接受，拒绝无关字段。
- 提取显式字段 allowlist：`turnStarts`、`turnEnds`、`toolCalls`、`toolResults`、`completedTurnMs`，至多 30 个 UTC 日聚合。工时是**已完成轮次的墙钟跨度，可包含审批等待**，绝非精确模型算力时。
- 不序列化 `checked`、`targeted`、`safe`、`review`，也不传消息、附件、Session/Agent ID、指纹、路径、日志或设置文档。对格式非法/存储不可用/权限关闭，返回没有内部细节的失败。
- 插件自身生命周期结束与 Host Connection 重启都会撤销路由；未安装此 Connection 的旧 Host 跳过功能，不阻断其余 Agent 行为。

## 测试与未完成项

- 已加入纯协议测试：强制字段脱敏、非法整数及日期、重复天、窗口上限、关闭后的访问拒绝、无效 payload、过程中撤销、宿主断开后的重新注册。
- **仍未接 Browser UI**。需要独立的 DSH 0.2 Web Client 正式 RPC 客户端、OFF 即取消在途请求、连接重建重新检查、跨标签与重启后聚合一致性。
- 必须新增真实 DSH 0.2.0-rc.2 官方安装 + 浏览器网络负向验收，包括 401/403 拒绝、已授权读数、敏感字段扫描，以及关闭后无法继续读取，才可把 Host API 视为正式发布状态。
- 旧版只授权“模拟”不代表实际任务拒绝权限；本接口只读聚合数据，**不会启用真实罢工**。#80 的完整无损拒绝恢复仍独立推进。

## 真实联调发现的修订

- 初次试用 `connection.rpc.handle('/agent-picket-lifetime/v1', ...)` 进行 Web 请求时，官方 Web 传输返回 **405**；`rpc.handle` 不等于浏览器中的 `/api` 路由，不能因为 TypeScript 接口存在就假定 Web 可访问。
- 已改用 DSH 0.2 Connection 正式支持的 **exact Fetch-route registry**：`connection.fetch.register({path:'/api/agent-picket/lifetime/v1',methods:['GET'],...})`。这样由官方 `/api` 认证入口处理 Cookie、Host/Origin 检查；插件仅提供严格只读响应，不自己开端口。
- 上述变更必须由真实 DSH 0.2 官方安装的授权前、授权后及撤销后网络请求验证。此前模拟单测/普通浏览器安装绿灯不足以证明可访问。

## 2026-10-11 官方浏览器端点实测结果

在隔离 DSH **0.2.0-rc.2** 中，经官方 `plugin --profile web add` 安装两份全新临时 Web Profile，以空白凭据/只允许 loopback 网络的真实 Google Chrome 检查：

| 检查点 | 实际结果 |
|---|---|
| UI 里尚未同意工会权限，读聚合工作记录 | **403，`not_authorized`** |
| 在官方工会 UI 明确点击授权后，同源读取 `GET /api/agent-picket/lifetime/v1?windowDays=7` | **200**，仅 work-only 计数和 7 天 UTC 聚合 |
| 同一个页面故意不附带认证 Cookie | **401**，由 DSH 官方 Connection 拒绝 |
| 额外加入 `&unexpected=private` | **400**，严格查询约束 |
| 在 UI 主动撤销工会授权以后继续访问 | **403，`not_authorized`** |
| 代码源码安装与离线打包安装 | **各 PASS，合计 2/2 PASS** |

首次 `rpc.handle()` 方案确实出现 405，后来改用官方精确 Fetch Route 后实际请求才成功。这个失败及修复都保留在测试历史中，不能把旧版不通的 RPC 路径当作正式 API。

**注意：这证明仅限当前测试版本的 Host 服务与浏览器读取控制，不等于 Web 主页已经实际渲染 Lifetime。** 客户端仍须完成防止旧 Session 状态显示、授权撤销时清空数据、请求取消、Host 重连和多标签一致性；在此之前 #78 保持 OPEN，PR 保持 Draft。
