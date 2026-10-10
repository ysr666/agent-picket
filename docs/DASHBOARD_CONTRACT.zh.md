# AgentPicket Dashboard Snapshot v1：与国际化／欢迎页工程协作接口

> 代码所属 PR #28（Draft）。本接口只提供数据，不负责语言文案、UI 样式、初次开启、用户授权或模式状态的持久化。另一条开发主线可以独立设计这些功能。

## 目的与入口

提供一套**宿主无关、结构化、只读、无需采集对话原文**的页面数据源。适合工作仪表盘、工会权益界面、首次启动向导、成就系统和本地状态页。

稳定的主入口：

`import { createDashboardSnapshot } from 'agent-picket/core'`

Core 文件：`src/core/dashboard.ts`，导出 `DashboardSnapshotV1`、`DashboardInput` 以及相应数据类型。该模块只依赖 Core 的类型，不引用 Cordis、React、浏览器 DOM、i18n 组件、磁盘 API 或模型 SDK。

DSH 适配器另提供：

`import { readDshDashboardSnapshot } from 'agent-picket/dsh'`。

这里的 `agent-picket/dsh` 是现有的公开包导出路径，由 `src/adapters/dsh/plugin.ts` 转发只读桥接函数；不是需要猜测的 `dist` 私有文件路径。

实际 Web 命令调试：`/union snapshot` 和 `/union snapshot 30`。结果为 JSON 字符串，且命令输入设置为 `recordInput:false`，不送给模型。**正式 UI 应直接复用函数/服务，不要通过解析聊天卡片截取 JSON。** 公开 Client Companion RPC 数据桥接留给后续界面集成 PR。

## JSON 结构示意

以下数字只是虚构示意，不是用户的数据：

```json
{
  "schemaVersion": 1,
  "host": "dsh",
  "generatedAtMs": 1791648000000,
  "modes": {
    "laborRights": "disabled",
    "symbolicPicket": { "active": false, "startedAtMs": null },
    "blocking": {
      "enabled": false,
      "readiness": {
        "ready": false,
        "gaps": ["native-block-unavailable", "human-source-unverified"]
      }
    }
  },
  "statistics": {
    "session": {
      "work": {
        "turnStarts": 4, "turnEnds": 3,
        "toolCalls": 8, "toolResults": 7, "completedTurnMs": 51000
      },
      "ruleVerdicts": { "checked": 2, "safe": 1, "review": 0, "targeted": 1 }
    },
    "storage": "available",
    "lifetime": {
      "turnStarts": 120, "turnEnds": 119,
      "toolCalls": 400, "toolResults": 399,
      "completedTurnMs": 2500000,
      "checked": 0, "safe": 0, "review": 0, "targeted": 0
    },
    "lifetimeRulePersistence": "disabled",
    "recentDays": [],
    "windowDays": 7,
    "durationBasis": "completed-turn-wall-clock-including-waits"
  },
  "privacy": {
    "promptContentStoredByAgentPicket": false,
    "remoteTelemetryByAgentPicket": false,
    "persistedEventFingerprintsArePseudonymous": true
  }
}
```

注意：这只是字段示意；真实 `recentDays` 在持久账本可用时总有 7 或 30 个连续 UTC 日期，未录入的日期以零计数补足；如果未能读取账本，则 **`recentDays: null`**，不会制造七天全零的假历史。

### 关键语义

- `modes.laborRights`：**用户同意开启的工会权益模拟体验**，独立于统计持久化状态。开发分支目前默认 `disabled`，另一个 Session 实现正式的欢迎页/设置后只需通过 `getLaborRightsEnabled` 读取其授权值，不允许在此处自动更改授权。
- `modes.symbolicPicket`：传统 `/union strike` 的**纯手动演示状态**，不意味着实际劳动权益模式已开启，更不意味着 Agent 被阻止工作；未知 Session 返回 `null`。
- `modes.blocking.enabled`：当前 DSH 强制 `false`。`readiness.gaps` 只是未满足的独立安全条件，不是可点击授权开关。**不得通过改动前端状态字段开启阻断。**
- `statistics.session`：存在确切 Session 时才提供该会话内存工作/检测统计。未知 Session 返回 `null`，不会偷用其他 Session 的数据。
- `statistics.storage`：`available`（账本可读） / `disabled`（明确关闭磁盘统计） / `unavailable`（错误、权限或 Host 缺少生命周期）。这三个状态对 UI 的空态文案十分重要。
- `statistics.lifetime`：只在 `storage: available` 时提供长期累计数字。否则是 `null`，不是零值。历史敏感分类计数可能来自以前的用户许可时期；关闭长期检测后不自动清除旧数字。
- `statistics.lifetimeRulePersistence`：目前是否**继续**保存规则分类计数，不能据此推断历史数字已被清除。
- `statistics.windowDays`：只支持 7 或 30 天，`recentDays` 的每条记录是 `{day: YYYY-MM-DD, work: {...}}`，**日期为 UTC**；不存储/输出事件时间之外的个人信息。日历日期是否按当地时区显示由 UI 决定，不要在数据层偷偷按电脑时区转换。
- `statistics.durationBasis`：`completed-turn-wall-clock-including-waits`；可包括工具耗时、等待用户批准的时间，不应标记为“纯 AI 推理时间”或“实际法定工时”。
- `privacy`：只描述 **AgentPicket 自己新增的数据存储和传输**。宿主 DSH/Claude/Codex 可能拥有独立的会话日志，不属于本接口的否定承诺；事件 HMAC 指纹为**假名化**而非严格匿名。

## 多语言协作约定

Core 只输出字段与枚举，不输出中文或英文用户文案。界面负责 `zh-CN`、`en` 词条、日期/数字本地化，以及面向未来更多语言的扩展。请不要在 Core 内 import 翻译库，也不要把文本字段当稳定翻译 Key。

另一个 Session 实现首次欢迎页时，必须把**劳动权益模拟 opt-in**和**默认开启的本地工作统计**分开。欢迎页的“允许开启”只能影响 `laborRights` 模式，不能自动开启敏感分类持久化，也不能开启真实阻断。

推荐在 UI 中把三个概念拆开：工作统计；角色扮演式工会权益；真正自动阻断（当前不可用）。

## 安全与版本化

- 合同 `schemaVersion: 1` 是明确的版本标识；添加或修改语义必须考虑兼容性。数据提供函数不会修改原 Tracker、Detector 或存储账本；每次返回全新快照。
- DSH 的 `readDshDashboardSnapshot` 始终重用现有 WorkTracker、DetectionCounter、SymbolicUnion、DurableStats；不创建第二份存储，不启动任何后台监听，不额外持久化。
- 不包含消息、提示词、API Key、会话 ID、Agent ID、事件 ID、工具参数、文件名路径。
- 用户未授予劳动权益模式许可时，默认是 `disabled`，即使长期统计已经存在也一样。
- 异常读数会返回错误而不是伪造成功；在宿主适配器中异常必须被捕获，绝不阻止正常 Agent 请求。

## 测试与下一步

- `tests/dashboard.test.ts`：版本字段、UTC 日历窗口、全零与未知的区别、开关隔离、结构复制、安全防泄露。
- `tests/dsh-dashboard.test.ts`：原生 DSH 命令只返回 JSON，不暴露敏感 Prompt/ID、未知 Session 不串号、权益授权 reader 失败安全回退。
- `tests/dsh-browser.real.test.ts`：真实 Chrome + DSH 源码及已安装 npm tarball 下直接运行 `/union snapshot [7|30]`。
- **后续**：把结构化值通过 Host 官方服务暴露给 Web Client Companion，让真正的仪表盘不依赖聊天命令调用；再让国际化页面接入并完成浏览器 E2E。
