# AgentPicket Web Client Companion：即时命令反馈

状态：隔离 DSH 0.2.0-rc.2 / Chrome 154 的真实浏览器验证通过。只负责通知，不改变模型输入与请求执行规则。

## 背景

当前版本的 DSH Web 可以在空白会话中成功执行 /union safety 等原生命令，但默认将执行结果作为永久的聊天命令卡片渲染。首次普通用户消息出现前，聊天视图尚未建立，因此即使服务端成功返回命令文本，用户也可能看不到结果。

## 标准扩展方案

AgentPicket 使用 DSH 官方的客户端模块声明（package.json 的 dsh.client），随 Host 插件一同加载浏览器 Client Companion。

- 客户端只订阅公开的 command/executed 事件。
- 仅对 union 命令的成功结果作回应；其他命令和错误不受影响。
- 使用当前 Session 的原生 conversation.input.for(...).notify('info',...) 通知服务显示结果。
- 不直接访问 DOM，不读写草稿，不截获键盘，不重新提交模型请求，也不修改 DSH 源码。
- 命令的原始参数仍然不保存到 DSH 命令日志；通知展示的是服务器返回的固定结论，不是用户的原始私密文本。
- Session 已卸载或通知服务不存在时静默跳过；通知失败不能影响原命令执行。

普通已建立聊天记录的 Session 会同时有短时通知与长期命令卡片；这是有意的冗余反馈。空白 Session 则无需先发送普通聊天消息，也能立即看见安全说明。

## 打包方式

本项目生产包仍是实验性本地 tarball，尚未公开发布 npm。

- 源码入口：src/adapters/dsh/client.ts
- 单元测试：tests/dsh-client-companion.test.ts
- 构建脚本：scripts/build-dsh-client.mjs
- 预编译浏览器产物：dist/adapters/dsh/client.js
- NPM 导出：agent-picket/client，客户端模块标识 agent-picket

由于上游 Web Module Loader 使用 Closure Factory 封装，编译步骤将无外部导入的 TypeScript Client 单文件包装为与 DSH 客户端模块加载器兼容的工厂格式。构建脚本会检查没有引入未预期的 imports，并移除不再匹配的 JavaScript Source Map。

此模块产物目前仅验证当前固定的 DSH 版本。未来若上游客户端工厂协议变化，应采用其新的正式构建方式，不保证自动兼容。

## 测试证据

1. 三项单元测试覆盖仅处理 union 成功事件、会话隔离及通知故障不影响执行。
2. 本地 npm tarball 测试确认客户端产物与 dsh.client 元信息确实存在。
3. 真实 Chrome 从空白会话开始输入 /union safety，Host RPC 返回成功后，Client Companion **立即显示完整安全通知**，不再需要先提交普通消息。
4. 同一浏览器测试也验证随后创建聊天记录、历史卡片持久显示、手动模拟罢工不阻断用户请求以及无第三方网络请求。

仍未验证：浏览器多标签并发、HMR 更新、多个 DSH 版本、附件恢复和真正自动阻断。后者仍然禁用。

参见 DSH_BROWSER_E2E.zh.md 和 BLOCKING_SAFETY.md。
