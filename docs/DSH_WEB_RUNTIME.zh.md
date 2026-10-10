# AgentPicket × DSH Web 真实启动与认证验证

> **已通过：真实 DSH Web Profile 启动、加载 AgentPicket、首页 Token→Cookie 认证、浏览器请求来源保护。**
>
> **未通过验收：浏览器中输入 `/union`、查看菜单及通知的真实点击/键盘 E2E，特别是附件恢复和自动提交前拦截。**

## 当前实测环境

- 隔离安装的 `@deepseek-ai/dsh@0.2.0-rc.2`（Cordis 4）
- macOS / Node.js 24.5.0
- 临时 `DSH_HOME`、随机操作系统分配端口、只绑定 `127.0.0.1`
- 通过 `--patch` 插入真实 AgentPicket DSH 插件，插件生命周期将一次性加载标记写入**测试临时目录**
- 关闭了自动浏览器启动（`--no-open`），没有连接在线 LLM 服务

## 可重复的浏览器 Host 验收

由 `tests/dsh-web.real.test.ts` 执行：

| 检查点 | 结果 |
|---|---|
| DSH Web Profile 正常启动，发布随机本地端口 | 通过 |
| 真实 AgentPicket 插件的 `apply()` 被执行 | 通过 |
| 未带有效 Cookie 的根页面请求 | `401 Unauthorized` |
| 一次性启动链接交换 | `303 See Other`，设置签名 Session Cookie |
| 携带此 Cookie 后访问 HTML | `200 OK` |
| 用同一个 Cookie 再访问页面 | 由认证 Session 正常支持 |
| 携带不同 Origin 请求 `/api` | `403 Forbidden` |
| 自动停止临时 Web 进程并清理 Host | 通过 |

DSH 的 Token 只在测试进程内部解析；**测试输出不能显示启动链接、Token 或 Cookie**。未在真实用户的 Home/Profile 安装任何东西。

### 为什么此前手写请求出现 401？

首次验证仅使用不保存 Cookie 的独立 HTTP 请求。DSH 的 `?token=...` **不是**每次 API 都接受的 Bearer Token：它只用于根路径初次交换。浏览器会保存受保护的 Cookie 并在重定向到干净地址后继续请求。使用 Cookie Jar 后证明了正确行为。

### 为什么 Web 首页的错误 Origin 没有 403？

当前 Host 的跨站请求来源检查主要保护共享 `/api` 桥接层；普通静态 HTML 页面不等同于远程 API 调用。自动化测试改为验证 `/api/remote.mux`，跨站 Origin 正确拒绝为 `403`。我们没有为了通过测试而关闭 DSH 的 Host/Origin 安全保护。

## 如何重跑

```sh
npm ci
npm run check

# 两个环境变量都指向用户单独安装的 DSH（勿覆盖全局 DSH）：
AGENT_PICKET_DSH_HOST=/path/to/dsh/node_modules \
AGENT_PICKET_DSH_BIN=/path/to/dsh/node_modules/.bin/dsh \
npm run test:dsh:real
```

不提供这两个变量时，真实 Web/SDK 测试会被跳过。

## 仍不等于完整的 Web UI 兼容

此测试不会在浏览器中实际创建 Session、输入 `/union check`、执行候选菜单或验证视觉提示，也不会模拟附件丢失及恢复。因此只证明 **Web Host 加载与基本认证接口兼容**。

针对完整 Web 产品化，下一项高优先级测试仍是：原生命令的浏览器交互、动态 Session 命令目录、通知与用户草稿在失败后的恢复。只有在官方客户端提供可靠的原子式拦截/恢复能力时，才考虑真正可选的自动罢工。

相关阅读：[Web 客户端能力审查](DSH_WEB_CAPABILITIES.zh.md)、[自动阻断安全条件](BLOCKING_SAFETY.md)、[离线安装包测试](PACKAGING.zh.md)。

上游参考：<https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/client/connection/README.md> 与 <https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/client/web-app/README.md>。
