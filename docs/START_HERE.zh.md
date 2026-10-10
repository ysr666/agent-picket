# AgentPicket — 从这里开始

> **2026-10-10 更新：** 本文以下内容是早期历史研发指南，不代表当前分支状态。**请先读 [52 个 Draft 的真实依赖、#23 主线冲突及安装审计](PR_STACK_RELEASE_AUDIT_2026_10_10.md)**、[工会参与机制草案](UNION_PARTICIPATION_V1.zh.md)和[人工无障碍验收单](HUMAN_ACCESSIBILITY_SIGNOFF.zh.md)。最新候选代码仍在未合并的 Draft PR 中；`main` 没有正式插件，npm 未公开发行。以下旧版 CLI/Branch 示例不能替代最新版安装说明。

**先读 [当前研发状态、全部 PR 关系与发布门槛](STATUS.zh.md)。** 旧的“Phase 0 尚未写代码”描述不再准确。

## 从代码而不是规划开始

开发者可以克隆仓库，检出要审查的功能分支。由于目前采用叠加 PR，不能假定 main 已包含所有代码。

PR #22 是早期历史文档分支，并不是当前完整工会入口。**目前最新受测工会候选是 Draft #67 的 Head**，但它仍需要从 #23 开始的正式依赖链审查。跨宿主 Hook 的单独试验仍在 PR #21/#24，不能据此宣称正式支持 Codex/Claude。请先阅读 [最新总审计](PR_STACK_RELEASE_AUDIT_2026_10_10.md)。

```sh
git clone https://github.com/ysr666/agent-picket.git
cd agent-picket
git fetch origin test/67-keyboard-option-ready-gate-20261010
git switch --detach FETCH_HEAD
npm ci --ignore-scripts
npm run check
# 这只是实验性审查分支，不要从这里自动发布或合并。
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
