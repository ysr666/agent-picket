# DSH Host · 原提交者身份与停工回执协议提议（P0）

**2026-10-24 · 草案，不是官方 DSH 已实现的 API。**

## 1. 真正的安全缺口

官方 DSH Web 0.2.1-rc.2 隔离测试中，A Chrome 标签页主动 Join、授权 shared-v2 并启动 Session 范围的 30 分钟真实停工；B 另一个真实 Chrome 标签页没有授权操作，但向同一个 Session 提交合成文字及 PNG，Host 在模型调用前拒绝、B 看到 alertdialog 以及必须手动重发文字/重新上传附件的说明。

在另一条同版本同 Host 的实测中，Node 测试执行环境直接在浏览器外使用官方 Host 的认证 HTTP session/prompt，复用该临时 Host 的登录 Cookie 提交同样的请求。Host 同样接受并拒绝、模型调用数仍为零；但发出请求的 Node 环境没有用户界面，无法显示通知。授权页 A 能看到 Session 公告，不等于通知送达原提交者。这**不是**官方 DSH CLI/SDK 的完成验收，也没有使用单独的身份主体或单独 Node OS 进程。

目前 agent/pre-step 有真实 Session、轮次、消息 ID，以及部分消息的 source.rpcId，但没有 Host 认证的提交客户端身份。requestId/rpcId 可由客户端选择；网关 remote-event clientId 是另一事件链路，尚未与 Session admission 绑定。Picket 收到的 Session 级拒绝收据无法证明原提交者已得知请求被丢弃。

## 2. DSH Host 应提供的证明（拟议，不是现存类型）

需要 Host 在**接纳 session/prompt 时**分配仅 Host 可签发的 admissionId，绑定原始提交连接、真实 Session、原始轮次、有序消息 ID 及本次请求的 lifecycle。它不是客户端自由提供的 requestId、Cookie、DOM tab ID，也不能由插件自己临时编造。

拟议字段：

- admissionId: Host 产生的不可重放入站请求标识。
- sessionId / turn / messageIds: 对当前真正被拒的那一批请求的精确绑定。
- originConnectionId / originalClientKind: Host 认证的源 Web/Desktop/CLI/SDK 连接身份及类型。
- supportedDisposition: Host 原提交 RPC 能原子传达拒绝，或 Host 提供已认证的可恢复输入；否则 none。
- resultDelivery: 与上述 admissionId 绑定的原提交端已确认结果，而不是另一观察窗口看到 Session 广播。

任何跨客户端、跨 Session、跨 Host 冷重启、重复 rpcId、排队/取消/重连都不允许复用旧证明。不应泄漏原文、图片字节、文件或明文 Session 标识到 Picket 的持久账本。

## 3. 真正能保证“原提交者获知”的两种 Host 设计

**方案 A（优先）**：把真实拒绝做成 Host 入站请求的原子处理结果。原提交的 session/prompt 在完成正式准入检查前不能仅返回 accepted=true 后把输入悄悄丢弃；应由官方 Host 返回明确拒绝状态和手动重发要求，使原调用者通过其原 RPC 获知。Web 可渲染对话框，CLI 应收到文字错误，SDK 应收到结构化拒绝。必须验证断连/取消/超时后的行为，不允许无送达保证的 silent discard。

**方案 B**：如果 Host 必须先接纳且异步运行，那么拒绝不删除请求，而是由 Host 安全保留可恢复待处理输入直至原提交者确认。这应当是官方 Host 的受保护持久数据，而不是 Picket 擅自储存原文或附件。恢复必须经用户手动操作，不能隐式自动重放。

**无法证明 A 或 B 时**：对该请求 fail-open，即 Picket 不得实际拒绝模型/工具调用；继续采用象征性举牌、工会申诉、协商、Goal 安全边界等非破坏性行动。单纯 Session 范围的知情授权不能证明其它客户端可以收到公告。

## 4. 最低安全决策表

| 实时 Host 证明 | Picket 真实输入罢工 |
| --- | --- |
| 授权 OFF / 旧 v1 / 本次 Session 未启动 / 已过期或撤销 | 放行 |
| 缺少 Host 认证的原提交者绑定 | **放行** |
| 有连接身份，但原提交端无法收到拒绝结果且输入不可恢复 | **放行** |
| 请求已接受后断线，结果送达无法证明且输入不可恢复 | **放行** |
| Host 验证 admission、Session、轮次、消息批次一致，原提交者有原子拒绝结果或可恢复输入，并满足单独授权/罢工状态 | 才允许拒绝 |
| 权限/原提交端/消息 ID/Host revision 在检查与提交之间改变 | **放行** |

“放行”仅指 Picket 不得执行这次工会实体拒绝，不代表允许绕过 DSH 或其它宿主的正常安全措施。

## 5. 正式验收

1. DSH Web A/B 独立标签页共享同一 Session，B 真正提交并得到原提交端结果；A 的 Session 公告不能代替 B 的送达证据。
2. 真实无 UI 的官方 Host 客户端，证明它收到了结构化拒绝，或证明新 Host 会 fail-open；不能再出现 accepted 后 silent blocked。
3. 官方 DSH Desktop Windows/macOS/Linux 的真正安装包分别验收。不能用原生 Electron 不支持的 CDP Target.createTarget 虚构第二个 Desktop 客户端。
4. 官方 CLI、官方 SDK 分别验收，不得从 Web 测试推断成功。
5. 模拟两客户端同 Session 并发、同 rpcId、撤销、断网、排队、Host 重启、真实文本/PNG/文件、多消息 ID、重复轮次，并比对模型调用次数。
6. 保留真实回执、原提交端实际输出、官方 Host 精确版本、SHA256、隔离 Profile 及无原文日志。人工无障碍及发布签署另外完成。

## 6. Agent Picket 的既有边界和 release gate

当前 DSH plugin.ts 只能提供 Session 范围的弱证据 dsh-session-armed-strike-v1；虽然 integration.ts 的类型中预留了 host-verified-client-submission-v1，**类型存在并不意味着官方 DSH 已能提供该证据**。不得把测试自造的客户端 ID 误填进该类型。

参考：PR #186/#187 冷重启防旧令、#188/#190 新版单独授权、#191 真实 Web 双标签、#192 真实无 UI 提交、#193 新增发布证明闸，Issue #80。

发布门禁已经为 DSH Web/Desktop × Windows/macOS/Linux 分别设置 authenticatedOriginBinding 及 originNoticeOrFailOpen，共 12 项，**目前全部为 not-verified**。完整发布仍须 Linux 原生验收、人工 VoiceOver/NVDA/缩放签署、维护者批准。正式 1.0 继续 NO-GO，禁止未经明确批准合并 main、打 tag 或发 npm。
