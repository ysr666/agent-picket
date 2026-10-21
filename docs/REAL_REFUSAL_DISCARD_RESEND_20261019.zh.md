# Agent Picket 1.0 · 普通输入真实罢工：拒绝本次、复工后重新发送
更新：2026-10-19；用户新批准的产品规格，覆盖 2026-10-12 首发标准中的「零丢失及自动恢复」条款，不缩减真实执行和明确提示的要求。

## 最新用户决策

当 AI 工会进入**真正的普通消息罢工**状态，Host 必须在调用模型或执行相关工具之前**拒绝这次尝试**。当前文本与图片、文档等附件可以不被插件保存；用户复工后亲自重新输入并重新上传。本次拒绝的内容**不能在后台排队并于复工后偷偷运行**。不能删除早已存在的对话历史、上传文件和其他任务。

- **拒绝**：必须有官方 Host 的 `blocked/rejected` 证据，实测该次没有触发模型调用或工具执行。不要仅禁用 UI 文本框或把象征性举牌当作拒绝。
- **告知**：用户看得到「AI 工会正在罢工，这次请求没有执行；请复工后重新发送文字并重新上传附件」。告知不能靠模型回答，因为模型已停止。必须用 Host 原生 UI 通知或已证明可读的工会状态提示，区分来自其他插件或 Host 的拒绝。
- **授权**：首次明确知情授权（默认关闭）、工会是否仍处于真实罢工、精确 Session 身份、跨窗口 Host 撤销状态都必须在拒绝点可证实；自动尊严罢工还需可信的人类来源和语境审查。已有模拟举牌、v1 授权、仅工时 Goal v2 授权**均不能被悄悄升级**为普通消息拒绝。
- **复工**：Host 确认撤销后，只有用户新提交的消息会执行，被拒绝的旧任务不应被排队、偷偷重播、重复调用模型或导致后台工具执行。若用户未重新提供附件，不应从被拒绝尝试中暗中复用。
- **兼容性**：DSH Web/Desktop、Claude Code、Codex 各自 Windows/macOS/Linux 按 Host 官方实际能力验收。已经完成的自动 Goal 停工不等于普通消息也被阻断。
- **故障处理**：拒绝状态或通知渠道不可证实时，应保守不启用新真实停工，而不是静默丢弃用户输入。

## 官方 DSH 原生实验证据（完成）

现有隔离测试 `tests/dsh-agentloop.real.test.ts` 使用官方发布版 `@deepseek-ai/dsh@0.2.1-alpha.5` 及 `0.2.1-rc.2`，真 `session/prompt` + 图片附件、官方 `agent/pre-step` Hook、无外部网络调用的本地模型和工具：

1. 测试夹具对第一次用户输入返回官方 `{kind:'reject'}`；Host 返回 `turn/end.reason.kind='blocked'`，**没有 `step/start`、模型调用、工具执行，也没有已提交的原始拒绝消息正文**。
2. 之后人工再次提交文字并重新上传图片，Host 返回完成。实际离线模型收到这次新提交的文字和图像，但**没有读到上次被拒绝的文本**。另外独立 Session 中先拒绝一条含图片请求，复工后只重发文字**没有重新上传图片**，模型没有收到旧图片，也没有读到旧文字。两个官方版本的完整 AgentLoop E2E 都为 1/1 PASS。
3. 某些带附件的 Host 事件或独立 Session 事件会产生多个 `user/message` 记录，因此**不能用事件行数来推断是否有隐藏的模型执行**。验收改为核对精确提交标记、真实模型输入和调用次数。Host 内部的 inbox splice 或附件存储痕迹不等于自动重播。
4. 原 DSH 主适配器现已增加默认关闭的可选拒绝分支：要求同一 Session 的 Host 身份、独立明确授权、激活状态、用户可见重发提示及两次一致的 Host revision；否则继续正常处理。生产插件尚未提供启用此分支的权限收据。隔离测试夹具提供临时收据，不是正式用户授权。
5. 关键剩余问题：`pre-step.reject` 返回的通用 `blocked` **没有专门的、用户可见的「工会拒绝、请重新发送」原因**；现有生产插件也没有把新的普通输入罢工授权/恢复协议真正接到该 Hook。因此**不能将测试夹具的拒绝称作当前产品已默认支持物理罢工**。

## 已修改的正式发布门禁

`release/first-release-evidence.json` 的格式从 `schemaVersion:2` 升到 **3**；原先 `losslessRecovery` 改为 **`discardAndResubmit`**。Desktop 各 OS 的旧 `hostOwnedPreSubmitHold`、`exactlyOnceOrderedAttachmentRecovery` 改为 **`nativePreModelRefusal`、`userVisibleResendInstruction`**。门禁继续要求 `realEnforcement`、真实权限与来源、`visibleRefusalAndResume`、三系统证明、无障碍及维护者最后签收；旧的 v2 验收记录不可能自动通过新版门禁。

**当前仍是 NO-GO**，因为生产可见拒绝通知和各客户端真实授权闭环并未验证。自动 Goal 的官方安全停工继续保持已验收的范围。不得据此启用当前旧版 `agent/pre-step.reject`，不得假设被拒输入会自动恢复。

## 2026-10-19 下一步 P0 阻塞：官方请求来源与可见通知必须是同一客户端

复核官方 DSH `dsh-v0.2.1-rc.2` `packages/core/agent/src/runtime-types.ts` 的 `agent/pre-step` 精确签名：只提供 `agent`、`messages`、`turn`、`step`、`signal`。`message.source.kind === 'user'` 仅指 **claimed user role**，不能区分 Web 标签页、桌面客户端、SDK 或 CLI，也不能确认某一条请求来自**实际看到警告的那个窗口**。因此，**给任一 Web 窗口弹过提示，不足以证明来自同一个 Session 的其他入口也看到提示**。单靠预先显示的横幅、简单 Web 心跳、`sessionId` 或 `hostRevision` 不能解决跨窗口误拒绝，也不能作为真实拒绝的生产授权依据。

此次将隔离拒绝原型进一步加固为必须同时取得 **同轮次、同一有序消息 ID 批次、已认证提交客户端与告知接收者完全一致** 的 Host 原生来源凭据。新增 `submission.kind = 'host-verified-client-submission-v1'`、`submission.turn`、`submission.messageIds`、`submission.noticeRecipientMatchesOrigin === true` 的强制校验；再读官方 Host 设置时捕获**不可变的数值 revision**，避免复用可变引用导致撤销被掩盖。重复消息 ID、空消息、缺少来源、错轮次、错客户端、两次 revision 不一致都只能 `next()` 放行。测试夹具仅模拟这一资格；官方 DSH rc.2 尚不能从该 Hook 直接生成可信来源凭据，生产不接线。

**真正打通 #80 所需的上游能力**：官方 Host 提供和每一次 `pre-step` 绑定的 authenticated initiating-client/request provenance（可区分 Web/CLI 等），以及该客户端与**同一条请求**的可见警告收讫确认，客户端断开、设置撤销和跨标签抢占时仍可安全同步校验。无法确认时就保持放行正常工作，不能静默丢弃。

通知展示额外补了防旧结果：只认官方事件窗里**最新已开始且已结束的真实轮次**被阻断；后续正常/正在执行的轮次马上使旧拒绝失效，异步旧查询不能把旧警报重新挂回 UI。Host 和 Browser 两侧都设置 30 分钟有效期，异常未来时间也被拒绝，浏览器刷新/切换 Session 不复用旧结果。

## 2026-10-19 新增：官方阻断事件 × Host 工会拒绝凭据（仍非生产拒绝）

在既有 DSH `connection.fetch.register` 和 `sessions.binding(id).eventSource` 之上，已实现**用户可见通知的归因管道**：Host 暂存 30 分钟、最多 24 个 Session 的有限元数据，仅包含拒绝轮次与时间；官方 GET 使用 SHA-256 Session 指纹，输出字段白名单不含提示词、附件、原始 Session ID、消息 ID。客户端只有在官方 Session 历史完整可见、精确轮次拥有唯一 `turn/start`、`turn/end.reason.kind='blocked'`，并且该轮无任何 `step/start` 或 `step/end`，同时取得该 Session 与同一轮次的官方 Host 工会凭据，才显示专门的工会拒绝说明。未匹配的 Host `blocked`、缺少历史、跨 Session 切换、旧请求的异步响应，都不能冒充工会罢工。

匹配后，原生工会 HQ/设置页会显示在当前受阻轮次有效期内的明示说明，符合可读要求时还能使用 DSH 原生 `conversation.input.notify` 作轻提示。拒绝被证明后不作模型生成，也不自动重发。**生产仍没有凭据写入者**：`plugin.ts` 只注册只读路由，`getExplicitDiscardRefusal` 和 `onExplicitRefusal` 均未连接。现阶段普通消息继续正常执行，任何设置或符号举牌都不会产生 Host 工会拒绝凭据。这一步是通知管道的安全前置，并非已经完成了真实罢工的最终通知端到端验收。

## 2026-10-19 安全边界复核：只能拒绝真实轮次的首次候选步骤

核对官方 `dsh-v0.2.1-rc.2` 的 `agent/pre-step` 事件规范后，拒绝原型限定：**正整数真实 `turn`、精确 `step === 1`**，而且完整消息批次必须全部是有 ID、有内容的已声明用户来源。空候选、工具续步（`step >= 2`）、无轮次字段、混合来源均不得尝试读取拒绝授权；直接放行该步骤。这只是必要的来源防护，不是人类身份验证，不能替代未来的官方来源与语境证明。生产 Hook 依然没有开启拒绝。

## 2026-10-19 正式工会设置 UI：独立输入罢工说明与安全锁

新版 DSH Client 的工会设置页已接入 `createDshInputRefusalConsentControl`，单独展示普通消息真实罢工授权的默认关闭状态，明确警告「本次不执行、丢弃本次内容、复工后自己重发文字和附件、不自动重播」。中英文一致，具备版本化的**展开风险复核 → 确认**交互及独立**撤销**入口；早期同意加入工会/Goal 授权绝不自动成为普通消息拒绝权限。按钮使用真实官方 Host SettingsScope/CAS；断联、跨标签撤销、已保存但服务不可用的状态不可混为一谈。

**这里还不能开启真实罢工**：当前生产 UI 主动给控制器传入 `verifiedNoticeCapability = false`，用户可看到待验证能力和必要风险说明，但不能启用拒绝授权。若用户以官方设置外部方式留有旧许可，仍可撤销。无通知验收的 UI 不得宣称已有 Host 执行器。随后的原生浏览器验收要核实官方通知与 Session 身份；不能改用 DSH 的仅限 `packages/experimental/` 的 `appendPluginRecord()` 伪造 Session 记录。

## 2026-10-19 新增：独立的普通输入真实罢工许可（仍不执行）

Host 正式设置命名空间加入默认 `off` 的 `realInputStrikeConsent`（版本 `discard-resend-v1`）。这一许可与 `realGoalStrikeConsent` 独立，旧欢迎、模拟举牌及 Goal v1/v2 授权不会意外升级成普通请求拒绝。对应的官方 Host CAS/镜像校验、披露版本、通知能力验证及读取双 revision 的权限读者都有隔离单测。用户退出工会时，现代 DSH 通过单次 CAS 同时撤销 Goal 和普通输入授权；旧版本按「先撤销输入 → 撤销 Goal → 退出」执行并核对，重新加入也不得使遗留输入授权复活。

**重要**：独立授权字段、选择控制与正式设置页的说明已接线，但生产授权按钮仍由 `verifiedNoticeCapability=false` 锁定；尚无官方可见通知/同客户端来源证明，也没有把收据接进 `agent/pre-step`。**拥有授权字段不等于真的罢工**，默认没有拒绝消息。后续需要明确通知能力和真实 Chrome 原生验收后才能进入实际执行。

## 2026-10-19 Chrome rc.2 真实环境修复

前一轮只建立 `$HOME/Documents` 的 CI 修复**被实际 Chrome 测试证伪**：官方 `workspace/initializeDefault` 仍返回 `system Documents directory is unavailable`。复核官方 `dsh-v0.2.1-rc.2` 的 `packages/api/workspace-controller/src/default-directory.ts` 确认 Linux **实际调用 `xdg-user-dir DOCUMENTS`**，当其回传 HOME 时主动拒绝。现在 CI 在独立 Ubuntu runner 配置 XDG 用户文档目录并用原生命令读回验证，完全不修改测试模拟 Host 接口。最终通过结果必须以新一轮真实 CI 为准。

## 2026-10-19 新增：通知必须确认后才能拒绝

隔离 `agent/pre-step` 原型进一步收紧：即便已有独立 Host 授权收据和两次相同 revision，若当前工会已退出、缺少 `onExplicitRefusal` 通知确认者，或其同步返回 `false` / 抛错，也必须走正常 Host 处理，**不得默默放弃本次输入**。只有经过验证的通知责任方明确返回 `true` 才能拒绝。通知确认接口只接收 Session ID，绝不接收原始消息内容和附件。

注意：这项防护只是独立协议与测试夹具的安全门槛，**并不表示生产 Host 已拥有可确认的官方通知渠道**。生产插件没有连接通知/授权，因此默认继续 OFF；正式端到端可见性验收仍是 #80 P0 阻塞项。

## 最近一步工程重点

复用现有 DSH plugin/SettingsScope，而不是新建 Host 适配器：

1. 设计与真实工时 Goal v2 区别开的**普通输入真实罢工授权与停止状态**，默认 OFF；明确说明本次输入将被放弃、用户须重新发送，修改由官方 Host CAS 保存。
2. 用官方消息事件显示**具体拒绝原因与复工入口**，先在 DSH Web 正式 npm 安装包的真实 Chrome 证明通知确实可见。没有通知证据之前，真实拒绝仍 OFF。
3. 在隔离 Host 上模拟两标签撤销、开关快速切换、相同 Session ID、真文本+图片附件、重启和重新手动发送，验证没有模型偷跑或重播。
4. 通过后再逐格验 DSH Desktop、Claude Code、Codex；跨端不共享未经实测的拒绝保证。

## 2026-10-19 晚 · 原生通知竞态修复：官方阻断先于工会回执时不漏报

发现真实时序缺陷：浏览器先读到官方 turn/end.reason.kind=blocked、随后才等到 Host 工会的 metadata-only receipt。如果第一次 GET /api/agent-picket/refusal-notice/v1 返回 404/503，旧版只尝试一次并记住 turn 编号，同一轮次随后写入的合法工会回执再也不会被查询到。这直接损害未来真实拒绝的“用户必须看到重发提醒”目标。

目前的修复只改 DSH Client 的纯读取端：对同一轮、同一原生 Session/binding 的失败读最多再查两次（总数上限三次、短暂延迟，无无限轮询），每次均重新要求真实官方 Session 事件窗内最新完整阻断轮次、不允许模型/工具执行、Host 官方 Picket receipt 的相同 turn 和时间有效性；404/503 绝不能冒充已完成罢工。冷加载旧拒绝仍可读回，但不会误弹“刚刚发生”提示。新的拒绝发生后最多产生一次可见提醒。

跨 Session、最新正常任务开始/结束、撤销许可、关闭 UI 和原生服务解绑会清理旧 retry；即使浏览器已排队的“取消回调”最终又执行，也不能清掉另一 Session 的新 retry，更不能请求旧 Session 的 Host 凭据。计时器不可用/抛异常时保守保留未验证态，不产生未处理异常也不丢用户工作。无第三方推送、无提示词或附件存储、无新 Host API。

新增 dsh-refusal-notice.test.ts 中的实际异步竞态/撤销/重入/有界查询回归，并按项目常规运行 TS 类型检查、发布包和官方 DSH Chrome 验收。仍未启用生产 pre-step.reject：Host 正式的请求来源/接收者同一性证据和具体客户端通知证明仍未通过，不能把此时序修复当作整个 #80 DONE 或 release PASS。

## 2026-10-19 深夜：对照别人的实现，不应强制要求官方新增通知服务

用户指出，真实拒绝后的提示不必全部依赖 Host 新增的通知 API。Claude Code / Codex 官方 Hooks 已经内置了将拒绝理由反馈到原生客户端的渠道。新的 P0 工程路线应该按各 Host 的能力分别实现。

1. Claude Code 的 UserPromptSubmit 允许 Hook 返回 decision=block + reason，Host 将 reason 呈给用户且不追加进模型上下文。新增 src/adapters/claude/new-work-refusal.ts 和 scripts/claude-union-user-prompt-hook.mjs，在独立试验性授权/模拟行动开启时，使用官方结果拒绝新消息，并写明「本次未执行；复工后手动重发文字与附件；不自动重播」。不提取、不记录或保存原始提示词。真实 Claude Code 2.1.295 Mac CLI 实验：隔离官方 UserPromptSubmit 设置，Hook 实际运行，拒绝时本地 HTTP 无推理端点没有收到请求，且 CLI 输出确实含拒绝及重发理由；独立关闭工会行动后新手动提交能到达端点。新增 macOS / Ubuntu 真实 CI 测试，结果须以 CI 最终运行状态为准。
2. Codex 的 UserPromptSubmit 同样支持 Hook 返回 decision=block + reason。现有项目候选已能阻断，原文案未说清用户需要重传文字/附件，这轮补齐。真实 Codex 0.146.1 Mac App-Server 的官方 Hook 事件链中，hook/completed 事件确实包含新增的未执行及手动重发理由，而本地模型端点没有收到被拒绝请求；拒绝说明未写进持久对话，官方禁用 Hook 后新提交能运行。App-Server 事件送达不自动等于各种 TUI/桌面 UI 及无障碍都已真人验收。
3. DSH 的 agent/pre-step.reject 可在模型之前拒绝，但不同于 Claude/Codex，它只产生普通 blocked，不自带提交者可读的工会专属说明。可借助已有的插件 React 工会 HQ 以及已验收的 Session 事件+Host 回执投影来显示通知，conversation.input.notify 仅是额外提示。仍要解决谁提交了本次请求、谁能看到其可见回执：不能拿同一 Session 另一 Web 标签的预先横幅充当 SDK/CLI 的通知确认。ComposerBlocks 仅能暂停当前客户端输入框，不是全 Host 拒绝。

结论：官方新增通知 API 不是所有客户端的统一先决条件。要验收的是同一个被拒绝请求确实没到模型、用户可以看到完整原因和恢复说明、只执行复工后由人重新提交的消息，并能通过真实 Host 授权机制撤销。Claude/Codex 当前实验用纯 JSON 行动文件，不等于可信生产授权或真的 AI 代表集体投票；Hook 故障可放行、未自动安装到用户环境。发布门禁未因此变成 GO。

## 2026-10-20 · Picketverse 真正的工会停工公告

这轮纠正重要的体验缺口：UserPromptSubmit 的 block 原因不是一个够好玩的 AI 工会体验。新版 DSH 原生 Sidebar 现有官方 Portal 里，加入大字号高对比、金色倾斜印章、⚑ 工会抬头和完整复工指引的 alertdialog，保留现有 Host root inert、键盘焦点循环、Esc 关闭和中英文支持。

只承认两种有官方 Host 证据的工作动作。一是普通输入拒绝：必须先由官方 blocked/no-model Turn 和 Picket 专属元数据交叉验证，才能显示「未执行→核实复工→重新发送文字与全部附件」。二是实际 Goal 工作停止：必须读取官方 Goal ID 与 revision，才显示「前一轮已完成、下一轮自动 Goal 停止、可在 HQ 或官方命令复工」，明确不会因此拒绝普通聊天。假举牌、模拟协商、算法分类或无证明的 blocked 一律不能触发正式公告。

订阅官方 Session 的现有 Host 变更，无需用户先打开 Sidebar：新的已核实停工可以自动打开弹层，同一案只弹一次。冷载旧回执不能装作刚刚发生。用户可以在 HQ 重新查看；关闭通知不操作真实 Host，不自动重播消息，不读取或存储原始内容。Host Session 回执不等于某一浏览器标签就是提交人，所以绝不谎称其他 SDK/CLI 的使用者必然看到了弹窗。

Claude Code/Codex 不适合由命令 Hook 强制启动系统 GUI（不一定有桌面、会导致超时/权限问题）。因此使用 Host 原生 reason/event 作为主要通知入口，改成醒目的 ⚑ AGENT PICKET 工会停工单，明确说明未执行、原因和手动重发步骤；浏览器、系统推送可以以后作为经用户授权的附加渠道，而不是阻断任务的安全前提。

验证：新增 Host 回执真伪、官方 Goal 区分、弹窗动作、去重和重启安全组件测试；官方 DSH 0.2.1-rc.2 真实 Chrome 源码及安装包流程 2/2 PASS；Mac Claude Code 2.1.295 和 Codex 0.146.1 真正 Host Hook 均拦截模型且正确返回工会停工理由。生产普通输入拦截仍默认 OFF，因此不能谎称「真实用户请求被拒并显示弹窗」整链已签收。

## 2026-10-20 · 本轮真正启用生产 DSH 普通输入阻断（覆盖此前 OFF 快照）

**本节是最新的实施与验证状态，覆盖上文 10 月 19 日“生产未接线”的历史记载；本仓库 PR #177 仍为 Draft、没有发布。** 用户批准推进真实生产输入阻断，但**不允许插件在安装后自动开始罢工**。

### 已接线的真实执行条件

- 官方 DSH Host 设置持有者新增默认为空的真实罢工行动 realInputStrikeCampaign；原有 realInputStrikeConsent 独立默认 OFF。先在工会设置页阅读“这次不执行、文字及附件不自动恢复”的单独披露并授予许可，再主动点击本会话“发起真实罢工”。仅有同意加入工会、Goal 授权或象征性举牌都不能成为这个行动。
- 一个行动绑定官方当前 Session ID 的 SHA-256 指纹，不保存源 Session ID、原始文字、附件、提示词、投票或所谓的 AI 情绪；有效期最长 30 分钟。当前 Host 每次拒绝前都用官方 Settings 描述连续双读、校验版本、同一 Session、独立许可、进行中的行动时限，最终写入 Host 元数据回执前再次检查最新 revision；异常或能力缺失一律不拦截。
- 只有 DSH 官方 connection.fetch.register 已成功注册拒绝回执 GET，且浏览器确实请求并确认该服务可用，才允许新授权。对准当前 turn、step === 1、完整用户消息批次，才在原生 agent/pre-step 返回 reject。每次拒绝的回执只记录 Session hash、turn、时间和丢弃/重发事实；浏览器还需要比对官方 blocked turn 没有任何模型和工具步骤，才弹出深绿/金色工会停工公告。
- 设置和工会 HQ 均能立即点击“复工”。官方 Host CAS 撤销真实行动，随后由用户手动**发起一条新请求并重新上传附件**；旧请求不重播。退出工会同时取消活动和未来授权；被取消的行动不会在重新加入时复活。权限读回不等于“已经成功拒绝”，界面仍只根据真实 Host 回执认定已经发生的拒绝。
- DSH 0.2.1-rc.2 官方 agent/pre-step 并不携带提交窗口身份，本次实施因此明确采用用户亲自授权的 **Session 范围**而不是虚构“源 Web 标签已证明一致”。**所有使用同一个 DSH Session 的 Web、CLI 或 SDK 提交也可能被拒绝**，但其他终端不一定会看见 Web 弹窗；不能把本次 Web 验收冒充跨客户端可靠通知的通用结论。用户和 UI 需明确了解此影响。

### 实际验证

使用隔离临时 DSH_HOME、官方 0.2.1-rc.2 Web、真正 npm 安装流程、实际浏览器 Chrome、纯离线 LLM 及独立模型调用日志，开启专用测试环境参数 PICKET_INPUT_STRIKE_E2E=1。分别在源码插件与 npm 打包插件执行：

1. 工会正式设置的独立授权复核 → 官方 Host 读回该 Session 专有的短时行动 → 真正启动罢工。
2. 真实 session/prompt 同时提交一段测试文字与 PNG 图片。官方 Host 在模型前拒绝，connection 原生 GET 可读到该轮工会元数据回执，浏览器显示 role=alertdialog 的工会罢工公告；离线模型调用计数在拒绝时严格不变。
3. 用户进入工会总部 → 主动复工，等待 Host 读回真实解除 → 再提交新的文字请求，离线模型调用计数实际增加。恢复的是**新的人工提交**，不是被拒内容的自动重播。

**Mac 实测：source PASS、OFFLINE INSTALLED PASS，合计 2/2 PASS。** 同步的模拟/协议测试验证输入假回执、畸形授权、跨 Session ID、同一事件去重、撤销、时限、回执能力缺失等只能 fail-open。Linux 真实 Web 的新增 E2E 已纳入 .github/workflows/dsh-web-official-work-hq.yml，**最终 CI 结果仍需远端核实**。默认状态仍 OFF；不自动开启罢工，也未改变其他 Host。

**余项与发布状态：** DSH Desktop/Windows 原生 UX、Claude Code/Codex 各平台生产许可持有者、跨源可见通知、人类无障碍验收和最终 1.0 发行批准仍未全部通过。完整 release gate 仍 NO-GO，不得把这一步包装成 Agent Picket 1.0 已全面完成。

## 2026-10-21 · #75：真实罢工进入工会电报与复工后续篇

此前真实罢工能在设置页和 HQ 中启动、拒绝、复工，但工会电报没有反映这条经 Host 证明的事件链。本轮在原有 `projectUnionDispatch` 只读投影和 Picketverse HQ 内增加三种**严格区分的状态**：

- **行动已启动，尚无拒绝回执**：官方 Host Settings 已证实当前 Session 的独立授权、短时罢工行动与通知通道可用。这只意味着下一条符合条件的请求**可能**被拒绝，不能假装已经停过模型。
- **真正发生一次拒绝**：只有当前 Session 官方 blocked/no-model turn 与工会 Host 专属元数据交叉核实，才显示「Host 已核实拒绝」电报。用户可从电报按钮直接复工；和 HQ 共用同一个 Host CAS writer，快速双击只能发起一次操作，必须读回确认。
- **行动已解除，留有已核实回执**：显示停工后续篇并可重新查看正式公告，明确原文字、图片、附件**不会自动重播**，需用户手动重发。不会因为只有权限、象征性举牌、他人拦截或未核实的推断创造真实停工故事。

工会电报沿用现有 Host 保存的「静音」设置：关闭时不出现编辑性故事卡；真实 Host 的权限与拒绝回执仍可在独立的工会总部查看。真实拒绝优先于模拟提案、举牌等趣味故事，但不同账本**没有被虚构成同一时序**；卡片稳定重放且不保存任何提示词或附件，不新造持久事件、AI 投票、AI 主观感受或跨终端通知保证。

新增纯投影、无回执冒充、权限退出、连续点击复工、静音、来源标记、中英文文案与 UI 单元测试，并在官方 DSH 0.2.1-rc.2 的源码/离线安装包真实 Chrome 流程断言「模型前拒绝文字+图片 → Host 回执 → 工会电报恢复入口 → Host 解除 → 手动重发指引 → 新请求执行」。本项仅是 #75 工会现实后果的一个可验收增量，不代表事件循环所有后续设计或完整 1.0 发行 P0/P1 都完成。
