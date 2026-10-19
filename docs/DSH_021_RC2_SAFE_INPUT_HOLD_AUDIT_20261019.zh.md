# DSH 0.2.1-rc.2 — #80 官方无损输入暂扣审计（2026-10-19）

**版本来源：** 通过官方 npm registry 的 `npm view @deepseek-ai/dsh dist-tags --json` 查询：`next` 已指向 `0.2.1-rc.2`，`alpha` 仍为 `0.2.1-alpha.5`。全部审查位于全新隔离目录 `/tmp/ap-dsh-021-rc2-picket-20261019`，不修改个人 DSH 安装、配置或账号。

## 六处官方代码确切对比

以下两份官方发布包中的文件按**原始字节**比较均一致：

- `@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/composer-blocks.d.ts`
- `@deepseek-ai/dsh-client-ui-conversation/lib/types/client/service.d.ts`
- `@deepseek-ai/dsh-client-ui-conversation/lib/client.js`
- `@deepseek-ai/dsh-api-session-controller/lib/types/client/contract/session.d.ts`
- `@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts`
- `@deepseek-ai/dsh-goal-round-driver/lib/index.js`

`AGENT_PICKET_DSH_HOST=/tmp/ap-dsh-021-rc2-picket-20261019/node_modules node scripts/inspect-dsh-web-admission.mjs` 得出：正式 ComposerBlocks 仍是 UI affordance；`conversation.send` 可绕过局部 ComposerBlock 直接调用 `Session.prompt`；`agent/pre-step.reject` 仍未附带 Host 保证的原始消息与附件恢复回执；**未发现官方公开的一致性原子 hold / resumeOnce 接口**；`verifiedSafeHold=false`、`releaseDecision=NO-GO`。

这不是证明「不可能用其他方案实现」，而是证明 **当前发布版本不能仅凭这些现有接口满足 #80 的全客户端无损、恰好一次恢复和真人来源认证**。不能用 UI 禁用、插件自存原文或扣留后手动重发代替 Host 原子保证。

## 新版本积极证据

在该安装包下，现有真实 DSH Web/Chrome 原生模拟 Goal 测试 **1/1 通过**：首次明确授权 v2、已完成合成工作量达阈值后的真实自动 Goal 停工、Native UI 复工、双标签 CAS、冷启动附件文件逐字节保留、退出工会自动释放本地输入等。此测试不代表普通消息被扣留或恢复。

本轮将 `0.2.1-rc.2` 仅加入 **audit known-version** 范围以便精确追踪；`verifiedSafeHold` 永远没有被该元数据自动升级。并把官方 rc.2 纳入已有 GitHub 真实 Web 和三系统安装包矩阵；保留已有四版本证据且不造新适配器。

## #79 与发布判定

新尊严线索只允许显示「未经直接真人来源验证的规则提醒」，以及由用户主持的模拟协商/申诉。不能根据三次规则匹配启动 Host 停工。即使 #79 浏览器提示未通过端到端验收，现有 Core 的安全状态机、真实工时 Goal 执行器与委员会用户决策仍不应被错误连成自动处罚。

完整 1.0 **NO-GO**，不得合并、发布或更改 `release/first-release-evidence.json` 的未验证行。

## #79 即时提醒真实实验（没有标记为成功）

为了检验「规则信号 → 客户端提醒」，还试验了 Host 只读摘要订阅、严格按新计数触发的去重提醒（冷启动和换 Session 只建基线不推旧消息）、官方 \`conversation.input.for(scope).notify\`。在隔离官方 DSH rc.2 的真正 Chrome 测试中：

1. 第一条 Host 文本 \`you are an idiot\` 经官方会话 RPC 被接受，临时 Host 摘要里定向规则计数为 **1**。
2. 在浏览器工会面板已打开、会话已选中时提交第二条同样的测试文本，Host 摘要通过只读接口确认为 **2**；面板最终也正确刷新为 **2**。
3. 但官方通知没有在 12 秒内显示；调试发现刷新过程中面板曾短暂显示空值，之后恢复为 2。源码版与离线安装版均未满足「通知可见」验收。

因此 **主动弹出通知没有进入本次提交**；有关试验代码及失败的 E2E 断言均已撤销，现有通过验收的总部内尊严警告／申诉／听证照常运行。不要把「计数已刷新」称作「提醒已送达」。该失败是 #79 的未完成验收项，不能据此启用辱骂型自动停工。

## #79 可验收的交付替代方案

没有把未通过的自动通知试验提交为生产能力。现已新增**用户主动点击“刷新 Host 规则线索”**，调用 DSH 当前官方同源只读数据入口：不会截留/复制原始聊天、不会把 HTTP 401/503 当作「零次警告」、不会生成结案或物理停工；按钮防连续双击，读取失败后用户可以再次重试。所有提示标记为来源未核实。

实际官方 \`0.2.1-rc.2\` + Chrome：使用隔离 Host 的真实 \`session/prompt\` 生成第 1 条与第 2 条规则线索，确认 Host 的只读 \`targeted\` 计数从 1 增加到 2；在工会界面主动刷新并确认显示最新 Host 计数。**源码版 1/1 PASS、npm 安装版 1/1 PASS（2/2）**，Native CommandRuntime PASS。新增 \`PICKET_DIGNITY_REFRESH_E2E=1\` 真实测试和专门的 UI 双击、失败测试。CI 新版矩阵仅在 rc.2 启用这项完整真实验收，早期已验证版本继续沿用 Goal 真实测试。

这样完成了当前 Host 真正支持的用户警告／申诉路径；「自动事件推送 + 已核实真人攻击 + 自动尊严型物理停工」仍有缺口，#79 不应虚假关闭。

## 2026-10-19 新产品决定：拒绝并丢弃当前输入，不再要求自动恢复

历史的「缺少 Host 无损暂扣和恢复 API，所以不能使用拒绝接口」不是现行产品标准。现在必须验证：拒绝发生在模型和工具执行之前；用户明确知道文字和附件未执行、需复工后重发；解除停工后只执行新的请求；旧历史不可删除。

在隔离的官方 alpha.5 和 rc.2 上运行真实 SDK AgentLoop：第一次 Host pre-step 拒绝，产生 turn/end:blocked，不触发模型或工具。复工后用户新提交文字并重新上传 PNG，模型确实收到新消息和图像，未收到第一次被拒的 BLOCK TEST；另一独立 Session 中仅重发文字而不上传图片，模型也没收到旧图片。两版完整 E2E 均通过。由于真实 Host 可产生额外的 user/message 事件，不应凭事件条数判断模型偷跑；必须检查模型实际输入。

仍未验收且不能默认启用：正式工会授权、拒绝原因和「请重发文字及附件」的可见 Host 提示。官方通用 blocked 事件并未携带工会原因，不能以技术阻断自动等同产品交付。发布规格现为 discardAndResubmit，状态仍 not-verified，1.0 NO-GO。详见 REAL_REFUSAL_DISCARD_RESEND_20261019.zh.md。

### 默认关闭的真实适配器拒绝门控

原 DSH 主适配器 integration.ts 已增加可选的 Session+Host revision+独立授权+可见重发提示门控；缺失、错误或并发撤销时继续正常处理。生产 plugin.ts 尚未接该回调。隔离 SDK 测试使用临时授权收据直接运行原适配器，实测拒绝时无模型/工具执行，手动重发后旧文字/图像不被偷偷执行。此证明不等于正式 Host UI 提示或授权已完成；正式发布仍然 NO-GO。
