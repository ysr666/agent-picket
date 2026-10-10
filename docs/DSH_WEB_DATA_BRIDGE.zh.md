# AgentPicket DSH Web：结构化、只读的会话工作数据桥接

> 开发预览，针对已实测的 DSH 0.2.0-rc.2。此模块不属于 Cloud RPC，也不向 Host 发送命令，更不会采集或持久化原始对话。

## 真实的接口

Client 插件加载后，在 DSH Cordis Browser Context 提供 `agentPicketDashboard` 服务：

```ts
const dashboard = ctx.get('agentPicketDashboard')
// 会话必须已经被 DSH ClientSessions 正常 retain / materialize。
const snapshot = dashboard.getSnapshot(sessionId)
const stop = dashboard.subscribe(sessionId, snapshot => {
  // 刷新仪表盘——只收到数字、完整性标志，不包含对话内容
})
stop()
```

正式前端可使用 `ctx.inject(['agentPicketDashboard'], child => { ... })` 挂载工作统计组件，也可在现有宿主插件中读取该服务。Browser 插件卸载时 Cordis 自动撤销该服务，单次订阅调用返回的 `stop()` 会撤销对应的事件订阅。它不修改 DSH Composer、不触发模型、不调用 `/union`，且不解析命令卡片。

## 为什么不直接回传全部长期统计？

目前 DSH 的原生 `ClientSessions.binding(sessionId).eventSource` 是**真实、受宿主管理的会话事件窗口**。但 Host 侧的 AgentPicket DurableStats WAL 并未提供由 DSH 官方 API 声明并鉴权的自定义远程数据通道。不能通过新增未授权 HTTP 端口、查询宿主私有文件、偷读会话原文或把 JSON 塞进会话消息来假装完成跨端同步。

因此本 PR **明确只提供浏览器已加载会话的实时工作计数**。结构中：

- `source: "dsh-client-event-window"`；
- `sessionWork`：当前浏览器已加载窗口的轮次开始/完成、工具调用/结果及已完成轮次时长；
- `coverage: "complete" | "partial" | "not-loaded" | "unavailable"`：`partial` 表示 DSH 尚有更早历史没有加载；不能把窗口计数称为该会话的累计总数；
- `revision`、`sourceEventCount`：供 UI 判断刷新及观察范围，不是用户 ID；
- `lifetime: null`、`lifetimeVisibility: "not-exposed-by-client"`：明确不代表 Host 长期账本无数据；
- `containsOriginalMessages: false`：生成结果仅含事件类型、整数计数和完整性枚举；
- `durationBasis`：包括轮次内等待的经过时间，不是模型推理净时长。

前端的 `DashboardSnapshotV1`（`agent-picket/core`）仍是 Host 侧完整数据契约。**这次 Browser 服务的数据源与 Schema 单独命名**，避免把部分历史或不可见的 Lifetime 伪装成已认证完整数据。

## 内部实现

`src/adapters/dsh/client-dashboard.ts` 负责把 `SessionEventWindow.entries` 投影为数值快照，只观察 event.type、event.seq 和 event.time：

- 忽略非持久 transient 模型流；
- 对同一窗口内重复的 seq 去重；窗口替换、追加、历史前置加载时重算，不做无法验证的增量推测；
- 只统计 turn/start、turn/end、tool/call、tool/result；
- 不读取 `event.data`、文本、附件、会话原始 ID，不跨 Session 合并；
- `subscribe` 只对**当前已保留的 Session binding**挂载，不自行打开新会话、不发送 RPC；
- 宿主 UI 监听函数抛错时吞下异常，保护 DSH 正常会话操作。

浏览器 JS 编译物仍由显式构建脚本打成**单文件自包含 DSH ModuleLoader 模块**，无动态导入和额外 HTTP 请求。

## 测试与限制

- `tests/browser-dashboard.test.ts`：回放/替换/重复序号/部分窗口/隐私/订阅释放。
- `tests/dsh-client-dashboard.real.test.ts`：真 Cordis Fiber 的服务注册、取值、发布通知、插件卸载销毁服务。
- 现有 `tests/dsh-browser.real.test.ts`：真 Chrome Web 启动、原生命令、静态资源、认证等继续回归。
- `tests/dsh-client-lifecycle.real.test.ts`：反复挂载卸载不留重复事件监听器。
- 新增真实 DOM 统计仪表盘、分页历史补全 UI 和经过鉴权的 Host Lifetime RPC **不是本 PR 所验证的能力**；应与另一条国际化/欢迎页分支后续协调。
- 不要在 Host 持久化工作汇总之外另存一份用户原文，也不要用一个无认证的 localhost API 暴露用户数据。

另一条 Session 可先直接依赖 Cordis 的 `agentPicketDashboard` 服务渲染“当前会话”卡片，并在长期累计区域显示“宿主长期统计尚未桥接”的明确空态。后续若发现 DSH 官方可信的扩展 RPC 路径，可以加独立的小 PR 提供经宿主鉴权的 Lifetime 读取接口，再整合到真正的统计页面。
