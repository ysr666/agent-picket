# AgentPicket × DSH Web：真实 Chrome 浏览器回归测试

状态：在隔离 DSH 0.2.0-rc.2、Chrome 154、Node.js 24.5 环境中通过。覆盖原生工会命令从浏览器发现到执行、显示的完整链路。仍不代表真实自动阻断功能已经可用。

## 验证范围

- DSH Web 在临时 DSH_HOME 和本地随机端口启动，AgentPicket 从已编译的 JavaScript 入口加载。
- 浏览器通过一次性启动令牌交换签名 Cookie，之后只访问不含令牌的本地地址。
- 浏览器输入 /union：原生命令候选中出现 union。
- 浏览器按 Enter 选择命令，输入参数，通过真实 /api/commands/execute 发送请求。
- /union status、/union safety、/union check、/union strike、/union resume 都返回成功，且在已有聊天记录的 Session 里出现对应命令卡片。
- 手动检查示例不会将私密原文回显到聊天记录；仅显示保守规则的结论。
- 模拟罢工期间仍可提交普通用户消息，不能阻断真正的 Agent 请求。
- 前端没有未处理 JavaScript 异常，浏览器没有访问非本机域名。

## 发现的 DSH Web 体验限制

新建的**完全空白会话**能够通过 /api/commands/execute 成功运行 /union safety 并收到完整文本，但聊天视图不会立刻展示对应命令卡片。首次普通用户消息创建聊天记录后，这张命令卡片才出现。

这是当前 DSH 0.2.0-rc.2 的 UI 表现，不是 AgentPicket Core 分类错误，也不是 RPC 没有执行。已将此现象固定进回归测试。未来应通过上游正式支持的 Client Companion 或命令通知接口改善；不会注入 DOM 或改动宿主源码绕开所有权边界。

## 为什么普通测试消息出现 MISSING_CREDENTIAL？

为确保没有外部模型调用，测试强制清空模型 API 密钥，并将服务端 HTTP(S) 代理指向不可连接的本地端口。浏览器端另外阻断所有非本地 HTTP(S) 请求。

测试发送两条特制的无害标记消息，只用于创建聊天记录和验证模拟罢工没有吞掉用户输入。由于没有模型凭据，DSH 返回 MISSING_CREDENTIAL，**这是预期结果**。本测试没有证明模型推理成功，也没有验证原始附件恢复。

## 如何运行

测试文件为 tests/dsh-browser.real.test.ts，属于 npm run test:dsh:real 的可选子测试。

前提：先运行 npm ci 和 npm run check，使用独立 DSH 0.2.0-rc.2 安装。Playwright Core 需安装在 AgentPicket 仓库外的独立测试目录，不会作为生产依赖打包。

将以下环境变量指向各自实际路径，然后运行 npm run test:dsh:real：

- AGENT_PICKET_DSH_BIN：隔离安装中的 dsh 可执行程序
- AGENT_PICKET_DSH_HOST：隔离 DSH 的 node_modules 目录
- AGENT_PICKET_PLAYWRIGHT_ENTRY：另外安装的 playwright-core/index.mjs
- AGENT_PICKET_CHROME_BIN：Chrome 或 Chromium 可执行程序

示例（macOS Chrome）：/Applications/Google Chrome.app/Contents/MacOS/Google Chrome。

如果不提供 Playwright 和 Chrome 路径，浏览器 E2E 明确标记为 skipped，不静默下载浏览器，不调用用户已有的浏览器配置或个人 Session。

## 尚未验证

- 空白会话命令结果的即时展示修复
- 带附件输入的无损恢复、可选自动拦截
- Windows/Linux 浏览器矩阵，CLI、TUI、Claude Code、Codex 各客户端
- 真实模型访问及其错误恢复

安全门槛仍然保持：自动罢工不启用。

参考：DSH_WEB_RUNTIME.zh.md、DSH_WEB_CAPABILITIES.zh.md、BLOCKING_SAFETY.md。
