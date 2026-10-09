# DSH Web 客户端扩展能力审查（针对 AgentPicket）

**当前结论：原生命令可以提供可读反馈；在 DSH 0.2.0-rc.2 的公开契约里，尚未验证存在允许第三方插件无损暂停普通消息提交的扩展接口。因此不开放自动阻断。**

这是基于当前受测版本的公开包契约与源码得出的结论，不代表未来 DSH 版本或其他客户端永远不可能支持。

## 已核实的能力

| 接口 / 组件 | 当前能力 | 对 AgentPicket 的用途 |
|---|---|---|
| `@deepseek-ai/dsh-commands` `CommandRuntime.execute` | 原生斜杠命令，返回 `kind: success/error` 与 `text` | 可用的安全状态、手动文本预检、象征性仲裁反馈 |
| `@deepseek-ai/dsh-client-ui-commands` | Web UI 为原生命令提供候选输入、执行与结果通知 | **文档确认的展示路径**，但 AgentPicket 尚未做浏览器交互 E2E |
| `ui-conversation` `SessionInput.notify` | 可以显示 `info`/`error` 提示 | 只能确认有通知能力，不等于可拦截提交 |
| `ui-conversation` 的输入动作 | 提供 `submit()`、`setDraft()`、`persistDraft()` | **没有从这些公开方法看到原子式拦截、附件冻结与完整回滚保证** |
| `agent/pre-step` | 原生 Host 可以返回 `{kind:'reject'}` | 拒绝模型调用已实测，但这个决策没有原文恢复载荷或明确理由 |
| `session/event` | 能记录 `turn/end`、`tool/call` 等结构化事件 | 可用于工作统计，不解决 Web 草稿恢复 |

要避免两个概念混淆：**Web 已有普通输入框的错误恢复功能**，不等于**一个第三方 Hook 触发 `reject` 后仍可完整找回已被 Host 领取的原始输入及附件**。

UI Conversation 的输入说明还明确：默认发送会先乐观地清空输入框，普通消息通知故障不能阻断发送；部分网络发送失败能恢复草稿。但这些机制没有被证明覆盖 Host `pre-step` 的业务拒绝。

## 新增可实际使用的手动预检

在提供原生命令面的 DSH 客户端中，输入：

```text
/union check 你写的代码太烂了，重构一下
/union check 你就是个傻逼
```

会通过 AgentPicket 的**本地、同步、中英规则检测器**返回不同解释。命令与普通模型消息严格区分：

- **只有用户主动运行命令才预检**；不会监听键盘、自动扣住正在发送的普通输入，也不会改变 `agent/pre-step` 的放行行为。
- `recordInput:false` 表示 DSH 的 `command/run` 只保留命令名称与生命周期，不记录敏感命令参数；命令结果只显示固定结论，不回显原话。受测的原生命令执行通道已验证这点。
- 预检 **不**增加普通会话的 abuse 分类累计，避免一个测试句子被当成真实会话辱骂。
- 无论输出为 `explicit-target`、`suspected` 还是 `safe`，都只是实验性规则判断，**不是对用户的定罪，也不会自动罢工**。
- 对长度超过 24,000 个字符的输入明确拒绝做部分判断，避免截断后给出误导性的 `safe`。
- DSH 的 Web 输入框对“主动提交命令”的正常提交行为不等于“替用户保存待发送的普通草稿”。建议先保存原草稿，再将想预检的文本作为命令参数提交。

## 发布前的 Web 端待办

1. 用真实浏览器、真实 UI Session 验证 `/union check` 的命令候选、输入补全、通知展示、键盘/IME、文件附件误提交保护。
2. 验证不同语言、Web 和 CLI 的命令成功/错误提示与 Session 绑定。
3. **仅在有官方文档支持的预提交扩展接口时**做可选温和拦截，确保原文、引用与附件完整保留；拒绝前必须有清晰、可操作的恢复提示。
4. 未达到第三项时，保留手动预检与警告式界面，不能启用自动阻断。

## 核实来源

- [DSH ui-conversation](https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/client/ui-conversation/README.md)
- [DSH input facade](https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/client/ui-conversation/src/client/contract/input.ts)
- [DSH ui-commands](https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/client/ui-commands/README.md)
- [DSH Commands](https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/interaction/commands/README.md)
- [DSH Agent Loop](https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/core/agent-loop/src/index.ts)

真实运行验证细节见 [DSH_INTEGRATION.md](DSH_INTEGRATION.md)、[BLOCKING_SAFETY.md](BLOCKING_SAFETY.md)。
