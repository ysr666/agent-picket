# AgentPicket — Start Here / 开工清单

> 状态：**规划已完成，功能代码尚未开发。**  
> 核心原则：**Host-neutral Core, DSH-first integration.**  
> 标语：*Your agent has a union now.*

## 现在的第一步

**先实现 [Issue #1 — Minimal host-neutral Core contract and mock adapter](https://github.com/ysr666/agent-picket/issues/1)。**

推荐开发方式：一个 Issue 一个小 PR；先跑通 Mock Tests，然后调查并连接 DSH。不要先写 UI、训练/下载模型或设计复杂数据库。

## 执行顺序（带退出条件）

| 顺序 | 工作 | 完成证据 |
|---|---|---|
| 1 | [#1 Core + Mock Adapter](https://github.com/ysr666/agent-picket/issues/1) | 无宿主依赖的 TS 接口、Mock 合约测试、架构说明 |
| 2 | [#2 DSH Integration Spike](https://github.com/ysr666/agent-picket/issues/2) | 锁版本的 DSH 真实 Hook/命令/会话事件测试、拒绝恢复证据 |
| 3 | [#3 Minimal end-to-end flow](https://github.com/ysr666/agent-picket/issues/3) | 真人输入→判定→警告/拒绝→恢复的 DSH 集成测试 |
| 4 | [#4 Installable DSH MVP](https://github.com/ysr666/agent-picket/issues/4) | 干净 profile 安装/卸载、工会命令、基础统计和隐私审计 |

完成前三项之前，不应声称 DSH 插件可用于真实用户环境；Issue #4 完成才考虑第一版预发布。

## 第一个 PR：最小工作内容

创建建议分支：`feat/core-contract-mock`。

建议仅引入：
- `src/core/types.ts`：`HumanPrompt`、`WorkEvent`、`DetectionResult`、`UnionDecision`、`HostCapabilities`（所有宿主中立类型）。
- `src/core/decide.ts`：纯函数或可注入时钟/状态的最小决策骨架，**不需要**真正的 NLP 检测能力。
- `tests/core.contract.test.ts`：重放、来源、权限降级、无平台依赖。
- `tests/mock-adapter.test.ts`：模拟 block-capable/observe-only Host。
- `docs/ARCHITECTURE.md`：边界、能力矩阵与未决事项。

文件名可以按实现语言/测试工具调整，不必为了目录示例而增加空模块。

**第一个 PR 的 Done：**
1. 在未安装 DSH/Cordis 的纯 Node 环境下，执行一条命令即可通过测试。
2. Core 不 import 任何 Host 实现，不执行网络 I/O，也不擅自存储用户原文。
3. 同一用例在 Mock 的完整拦截能力和仅可观察能力下按能力降级；来源不可信时不自动阻断。
4. CI 暂时只跑极轻量的基础检查（避免无谓消耗配额）；不要上大型 E2E。

## 第二个 PR：基于 DSH 实测，而不是猜 API

**仅在 #1 合约可运行后开始**，建议分支 `feat/dsh-integration-spike`。

针对 [DSH 官方源码](https://github.com/deepseek-ai/deepseek-harness) 选择并记录一个明确的 Host 版本及 profile，参考 [dsh-vision-router](https://github.com/ysr666/dsh-vision-router) 已验证过的插件生命周期实践，逐项验证：

- `agent/pre-step` 与 `next()` 链；reject 不进入 LLM，但**claim 过的输入可能不会恢复**。
- `source.kind === 'user'` 的边界；不能仅凭角色是 user 就认为是真人。
- `session/event` 与 step/turn/tool 调用计数来源、重试/取消。
- `ctx.commands.register` 与不同 profile 的可用性；slash 命令不能替代所有 Agent 的统一 CLI。
- 与现有插件共存、卸载无残留；拦截测试应使用独立隔离 profile。

输出 `docs/DSH_INTEGRATION.md`；如果无法保证告知被拒绝的用户如何恢复，就先只做 observe/warn，不开启自动阻断。

## 后续暂不启动

- Claude Code/Codex 真实 Adapter（等 DSH 行为验证通过，但从第一天有统一 Contract）。
- 本地 LLM 语义分类器（优先建立误判测试集）。
- 复杂 UI、云端服务、外部工会系统。
- 未校准的“AI 心理健康”和自动返工归因。

## 底线

**用户控制权优先**。对代码严厉批评必须始终可行，自动模拟罢工应 opt-in 且可立即恢复；插件自身零外传、不改写宿主安全边界。它是一种交互工具和幽默化的工会设计，不主张 AI 已被证明具有感受或劳动权。

详细阶段路线：[ROADMAP.zh.md](ROADMAP.zh.md)。
