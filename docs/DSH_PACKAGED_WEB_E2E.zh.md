# AgentPicket：完整 npm 安装包 × DSH Web × 多标签页验收

状态：**真实运行测试通过**。当前只针对隔离的 DSH 0.2.0-rc.2、Node 24.5、macOS Chrome 154。此处的 npm 是本地 tarball，未公开发布，也没有安装到用户日常使用的 DSH。

## 1. 和此前的 Web E2E 有什么区别？

原先的浏览器测试加载的是 AgentPicket 仓库中的 `dist/adapters/dsh/plugin.js`。这种测试无法证明插件打成 npm 包后，DSH 还能找到 `package.json` 里的 `dsh.client` 声明与客户端入口。

本次新增了一条**完整安装流程**：

1. 从已构建的 `dist/`、`docs/`、许可证及元信息创建一次性独立 staging 目录。
2. 在 staging 中执行真正的 `npm pack --ignore-scripts`，得到 `agent-picket-0.0.0.tgz`。
3. 在新的空目录中用 `npm install --offline --ignore-scripts` 安装本地 tarball。
4. 验证安装包没有 `src/` 目录，仍含 `dsh.client.platform: web`、`exports["./client"]` 及编译后 Client Companion 模块。
5. 使用**安装目录内**的 `node_modules/agent-picket/dist/adapters/dsh/plugin.js`，启动全新的 DSH Web，自动发现和加载 npm 包中的 Client Companion。
6. 通过 Chrome 从浏览器执行完整工会命令，包括空白会话的即时通知。

这里并非只测试 `import` 或 Node SDK：真实 DSH Web 从安装后的 npm 包发现了浏览器客户端模块，用户可以直接在浏览器中看到响应。

## 2. 多标签页与刷新

源码加载和离线安装版均进行以下验证：

- 空白会话执行 `/union safety`，**第一次聊天消息出现前**就能立即显示宿主原生通知。
- 提交一条无害消息后，命令卡片以 DSH 的持久 Session 事件形式展示。
- `/union check` 仅展示安全的规则判断，不把秘密测试字符串渲染在聊天记录里。
- `/union strike` 是模拟演示；激活时用户仍能提交普通聊天消息。
- `/union resume` 结束模拟仲裁。
- **刷新原来的浏览器页面**，确认 AgentPicket 的客户端扩展能重新加载、`/union status` 再次运行并即时显示通知。**注意：重载后已有历史命令卡片的恢复偶尔失败，目前尚不能宣称该能力通过验收。**
- 在同一个浏览器上下文中**打开第二标签页**，原生命令菜单及即时通知在第二标签页里也能独立工作，没有未处理的浏览器 JavaScript 错误。

两条浏览器测试共用断言，但各自使用不同的一次性 DSH HOME、随机端口和浏览器上下文。执行后清理临时文件，安装包不会落到用户的全局 node_modules。

## 3. 离线边界

测试清空 `DEEPSEEK_API_KEY` 和 `OPENAI_API_KEY`，并阻止浏览器外部网站访问及服务端代理连接。出现的 `MISSING_CREDENTIAL` 是预期的模型缺少凭证错误，不是 AgentPicket 导致的模型失败。**没有验证真实模型推理成功**，也没有开启自动罢工。

## 4. 复现

```sh
npm ci
npm run check

AGENT_PICKET_DSH_HOST=/path/to/isolated/dsh/node_modules \
AGENT_PICKET_DSH_BIN=/path/to/isolated/dsh/node_modules/.bin/dsh \
AGENT_PICKET_PLAYWRIGHT_ENTRY=/path/to/playwright-core/index.mjs \
AGENT_PICKET_CHROME_BIN=/path/to/Chrome \
npm run test:dsh:real
```

Playwright Core 要单独安装在仓库之外，仅用于测试。没有指定变量时真实 DSH 和浏览器测试会标记为跳过，不自动启动用户 Chrome，不下载浏览器。

验证文件：`tests/dsh-browser.real.test.ts`，其中 source 与 installed 两种模式共用工会命令、即时通知及双标签页回归测试。

## 5. 尚未完成

- npm 正式发布、公开安装体验和跨 OS／跨浏览器测试；
- DSH 动态 Client HMR：重新构建客户端模块后跨页面加载、卸载和重复订阅控制；
- DSH 0.2.0-rc.2 刷新页面后的历史命令卡片恢复（偶发不展示，需定位宿主 Client Session / 记录加载时序）；
- 关闭重开整个 DSH Host 后的 Session 恢复、准确的跨重启工作统计；
- 带图片或文件的原始请求完整恢复与正式自动阻断；
- Claude Code 和 Codex 的独立原生适配器。

这仍是实验性安装预览版，所有 Draft PR 不应当直接视作稳定发布。
