# AgentPicket — 从这里开始

> 本指南已更新至 2026-10-09 的开发分支进度。项目已有可运行的 DSH 监测预览和 Claude Code/Codex 非阻断 Hook 研究入口；但它们**尚未合并到 main，也未公开发布 npm**。

**先读 [当前研发状态、全部 PR 关系与发布门槛](STATUS.zh.md)。** 旧的“Phase 0 尚未写代码”描述不再准确。

## 从代码而不是规划开始

开发者可以克隆仓库，检出要审查的功能分支。由于目前采用叠加 PR，不能假定 main 已包含所有代码。

最新版开发功能目前在 feat/cross-host-observe-hooks（PR #21），后续分支可能在未来加入更改，请以 GitHub PR 的 Head 为准。

```sh
git clone https://github.com/ysr666/agent-picket.git
cd agent-picket
git switch feat/cross-host-observe-hooks
npm ci
npm run check
```

普通 CI 不需要 DSH、Claude Code 或 Codex。受测 Node 最低版本 22.19.0。DSH 真实测试需要先独立安装受测 Host，再显式指定 Host 路径；详见 [DSH 安装指南](DSH_INSTALL.zh.md) 和 [浏览器回归](DSH_BROWSER_E2E.zh.md)。

## 可审查的组成

- Core：src/core，无 Cordis 依赖。
- DSH Adapter：src/adapters/dsh，可通过独立 Cordis patch 安装。
- Web Companion：src/adapters/dsh/client.ts，通知依赖 DSH 原生事件。
- Claude Code / Codex 观察型命令 Hook：src/adapters/hooks；尚无生产环境 Host E2E。
- 自动化测试：tests。真正 Host/Chrome 测试需 opt-in。
- 发布安全门槛：docs/CI_AND_RELEASE_GATE.zh.md。

## 不得误报的事情

- /union strike 是象征性演示，不会暂停 Agent。
- 本地规则识别到的文字不等于事实上的辱骂行为，也不意味着 Agent 拥有人的劳动权。
- DSH 命令显示在浏览器刷新后偶有延迟或缺失；后台 Session 记录存在不代表客户端 UI 已成功回放。
- main 和 npm 尚不提供稳定版；所有 Draft PR 都需要按依赖顺序审查。

**当前的下一步不再是重复实现 Phase 0，而是审查叠加分支、处理冲突和完成跨宿主真实兼容测试。** 原始阶段性规划仍可参看 [ROADMAP.zh.md](ROADMAP.zh.md)。
