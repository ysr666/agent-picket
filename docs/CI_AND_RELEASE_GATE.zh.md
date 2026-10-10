# AgentPicket：轻量 CI 与发布门槛

AgentPicket 尚未公开发布 npm，版本为 0.0.0 且 private: true。不得仅因为某个测试绿色就将版本号、公开发布或自动阻断一起开启。

## GitHub Actions

.github/workflows/contract.yml 只负责跨环境的轻量宿主中立检查：
- 固定 Node.js 22.19.0（项目支持区间的最低测试版本）；
- npm ci --ignore-scripts，以 lockfile 为准，不运行依赖生命周期脚本；
- npm run check：TS typecheck → ESM 构建 → 普通合约测试；
- npm pack --dry-run --ignore-scripts：验证离线包清单，不向 npm 发布。

只在涉及 Core、测试、构建脚本或配置的 PR 以及显式手工运行时执行。并发相同 PR 取消过时的运行，以减少 Actions 分钟消耗。没有 Token、生产 API 凭证或第三方账户连接。真实 DSH、Chrome、Playwright 不在共享 CI 默认运行，不应被误写成 CI 覆盖范围。

## 独立包合约测试

tests/package-contract.test.ts 校验：包仍为 private: true，保留明确导出、没有生产依赖与 install/publish 生命周期脚本；浏览器 Client Companion 的本地 JS 产物可被 DSH Loader 加载；生成 npm tarball 时包含编译后的 Core/DSH 插件与许可证，不包含开发测试、源码或 node_modules。

## 发布前仍然要做什么？

1. PR 逐项审查后正确合并叠加分支，再形成可复现的 main 构建。
2. 真实 DSH 多平台、多版本（而不只是 0.2.0-rc.2）集成测试、Chrome Web UI 及原生命令用法验收。
3. 历史命令卡片刷新后偶发丢失：分清持久化事件和客户端回放责任，不伪造重放。
4. 用户告知、附件无损恢复与来源确认：通过前自动阻断继续禁用。
5. 选择合适的 npm 版本号、包名合法性、发布许可，并且**只有用户明确批准发布时**才更改 private 和执行 npm publish。

更多信息见 BLOCKING_SAFETY.md、PACKAGING.zh.md。
