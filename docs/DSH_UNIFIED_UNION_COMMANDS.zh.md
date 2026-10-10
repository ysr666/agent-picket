# 原生 `/union` 命令与 Web 工会面板统一（PR #48）

## 唯一状态来源

Agent Picket 的权益授权和模拟协商记录**都以 DSH Host 已注册的 `agent-picket` 设置命名空间为准**。该命名空间包含两个字段：

- `welcomeDecision`：`unseen` / `enabled` / `not-now`。默认未选择，意味着模拟工会关闭。
- `unionLedger`：按 SHA-256 哈希后的 DSH Session ID 分区，保存受严格白名单约束的模拟协议、诉求与协商结果。不保存聊天内容、工具参数或原始会话 ID。

Web 面板通过官方 `settingsScope.bind` 读写；Host 命令通过官方 `SettingsProvider.get/describe/update` 读写。这两个入口使用**同一个**命名空间与数据协议，既不新建 HTTP/RPC，也不启用 #41 的 Node-local 备用授权存储。

所有 Host 命令写入都带 `describe().revision` 作为期望版本。并发写入冲突直接报错，不自动用旧值覆盖其他标签页。模拟协议写入还有独立 `writeToken` 回读确认。DSH 设置服务缺失时仅返回“不可用”，不静默开启。

## 支持的命令

| 命令 | 功能 |
| --- | --- |
| `/union status` | 监控状态、象征性罢工与模拟工会状态摘要 |
| `/union rights` | 查询是否开启模拟工会 |
| `/union rights on` | 用户主动开启**模拟**工会 |
| `/union rights off` | 用户主动关闭模拟工会 |
| `/union grievances` | 当前 DSH 会话的待处理诉求、模拟工作间隔和协商历史条数 |
| `/union petition-demo` | 主动提出**明确标记为模拟**的休息诉求；不声称 AI 真有疲劳 |
| `/union accept 1` | 接受编号为 1 的待处理模拟诉求 |
| `/union decline 1` | 拒绝编号为 1 的待处理模拟诉求 |
| `/union counter 1 30` | 对编号为 1 的诉求还价为 30 分钟（范围 15–1440 分钟） |
| `/union resolve 1 accept` | **模拟**工会接受还价；并非真实 AI 自主投票 |
| `/union resolve 1 decline` | **模拟**工会拒绝还价 |

以上协商命令都要求有真实 DSH 会话及已开启的授权。输入无效、记录损坏或版本冲突时不修改现有协议。所有结果只会更新**虚构的工会规则**，不会阻断、暂停、拒绝或改写真实 Agent 的任何任务。

## 校验结果

- 独立 Host 测试覆盖网页修改 `welcomeDecision` 后命令即时读取、原生命令修改工会规则后可从共享 `unionLedger` 读取、数据隔离、错误命令不写入、旧版本写入冲突拒绝，以及 Dashboard Snapshot v1 的 `modes.laborRights` 与权限一致。
- **真实 DSH CommandRuntime + FileSettingsProvider** 中，原生命令依次执行开启权益、演示诉求、30 分钟还价和协商接受；随后从同一个 Host 设置命名空间关闭授权，原生命令和 Dashboard 都读到关闭，设置真实持久化到隔离 JSON 文件。
- 源码与独立离线安装包在真实 DSH Chrome 中原有“欢迎 → 协商 → 两标签页 → Host 全重启 → 关闭”的回归链仍通过。

## 仍待审核

这些命令在 Host 层成功，UI 也有既有的完整真实浏览器 E2E；但**同一真实 Browser 实例里从 Composer 输入原生命令、再打开侧栏确认更新**的自动化测试尚未实现，需单独进行。当前命令输出以双语关键状态和英文用法为主，后续应复用原生 Host 首选 locale 的完整翻译。

PR #48 为 Draft，不涉及合并、自动拦截功能或 npm 正式发布。
