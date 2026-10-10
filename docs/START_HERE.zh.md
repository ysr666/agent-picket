# Agent Picket · 从这里开始

> **状态更新：2026-10-11。** 完整 DSH 工会模拟与 Web 面板已经通过 #23–#70 的逐项整合进入 `main`；独立 [AI 权利宣言](AI_RIGHTS_MANIFESTO.zh-CN.md)也已合并。**这不是正式发行**：npm 仍为 `private: true`、版本 `0.0.0`，真人无障碍与正式用户体验验收仍未完成。此前关于“main 尚无工会、必须检出 #67”的说法已经过时。

## 1. 在隔离环境验证当前主线

要求 Node.js 22.19+、npm；不要对正在工作的 DSH 用户配置执行测试。

```sh
git clone https://github.com/ysr666/agent-picket.git
cd agent-picket
git switch main
npm ci --ignore-scripts
npm run check
```

2026-10-11 已核实对应的最终主线源码树：**228 项自动化测试，204 PASS、0 FAIL、24 项条件 SKIP**，TypeScript 和构建通过。这些条件跳过的测试**不能**计为真实 DSH/浏览器测试成功。此前测试覆盖 macOS 隔离 Node 24 环境，原候选 GitHub Actions 已在 Node 22/24 跨平台跑通，但仍不能当作全平台生产认证。

## 2. 本地私有 tarball 与官方 DSH 安装

```sh
mkdir -p /tmp/agent-picket-dist
npm pack --ignore-scripts --pack-destination /tmp/agent-picket-dist
# 以下只用于独立安装的 DSH 和全新临时 Profile
DSH_BIN=/absolute/path/to/isolated/dsh
TEST_HOME="$(mktemp -d /tmp/agent-picket-test-home-XXXXXXXX)"
DSH_HOME="$TEST_HOME" "$DSH_BIN" plugin --profile web add \
  /tmp/agent-picket-dist/agent-picket-0.0.0.tgz
DSH_HOME="$TEST_HOME" "$DSH_BIN" plugin --profile web list
```

这是**官方插件命令 + 本地私有包**的隔离测试路径，不是公开 npm 发布流程。不要覆盖已有的 `DSH_HOME`、安装到真实工作 Profile 或默认接入模型密钥。详见 [打包说明](PACKAGING.zh.md) 和 [DSH 0.2 官方安装与 Chrome AX 回归](DSH_02_OFFICIAL_RIGHTS_AX_E2E.md)。

## 3. 首次使用与安全边界

- 工会模拟默认 **OFF**；必须在官方 DSH Host Settings 授权后才能启用。统计功能可独立运行，不能被误认为 AI 的真实感受。
- 工会侧栏优先展示权益、模拟申诉、谈判、反提案与协议，工作量统计仅作辅助。
- 模拟罢工绝不阻断、延迟、拒绝或改写真实 Agent 任务；没有真实 Agent 投票、签名或证明意识的结论。
- `agent-picket` / `agent-picket/dsh` 是 DSH Host 入口；独立 Core 使用 `agent-picket/core`；`agent-picket/client` 只限浏览器，不能直接用于 Node/SSR。

## 4. 尚未完成的发布门槛

[真人无障碍验收单](HUMAN_ACCESSIBILITY_SIGNOFF.zh.md)仍待 VoiceOver、NVDA、真实浏览器 200%/400% 缩放、Windows 原生高对比度以及用户授权理解程度的人工签收。跨宿主 Claude/Codex Hook 的真实安装与通知行为也不能因 DSH 主线合并而自动视为通过。**npm 发布仍需单独明确授权。**

更多资料：[最新状态](STATUS.zh.md) · [权益参与机制](UNION_PARTICIPATION_V1.zh.md) · [发行验收历史审计](RELEASE_READINESS_2026_10_10.md) · [早期 PR 集成审计（历史快照）](PR_STACK_RELEASE_AUDIT_2026_10_10.md)。
