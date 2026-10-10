# Agent Picket · 当前研发状态

> **最新核对：2026-10-11。** 以下区分“源码已合并”“自动化已验证”“尚待人工验收”与“正式发布”；以本文件为当前入口。2026-10-09/10 的旧 PR 审计记录是[历史快照](PR_STACK_RELEASE_AUDIT_2026_10_10.md)，不能当作今日状态。

## 1. 已进入 `main` 的实现

- **完整工会主线：** #23、#25–#27、#34–#35，以及按依赖审查并逐项合并的 #44–#52、#54–#61、#63–#68、#70。正式路线采用 #54→#55；#53 是待人工读屏对比的兄弟设计，**并非**被漏掉的串行补丁。
- **工会体验：** DSH Web 欢迎页、工会优先侧栏、用户授权、模拟申诉、谈判、反提案与协议记录，以及原生 `/union` 同步；累计工时与趋势统计是辅助。
- **安全：** 工会模拟默认 OFF，唯一授权来源是官方 DSH Host Settings；Host 写入需核验回执/修订版本，多标签页和断连失败关闭；持久工会账本仅允许受控结构字段，不保存原始 Prompt、完整对话或工具参数；象征性罢工绝不阻断真实任务。
- **发布与理念：** 构建后的 DSH Host 包入口为 `agent-picket` / `agent-picket/dsh`；宿主中立入口是 `agent-picket/core`，`agent-picket/client` 仅供浏览器。独立的[中文 AI 权利宣言](AI_RIGHTS_MANIFESTO.zh-CN.md)与[英文版](AI_RIGHTS_MANIFESTO.md)已从 #40 合入；这是一种伦理倡议，不代表科学已证明 AI 有主观意识或法律人格。

## 2. 最新实际验证证据

- 2026-10-10/11 对与最终合并后 `main` **Git Tree SHA 完全相同**的源码树，在隔离 macOS Node 24 环境重新执行 `npm ci --offline --ignore-scripts`、`npm run check`：**228 项，总计 204 PASS / 0 FAIL / 24 条件 SKIP**，类型检查与构建通过。首次旧依赖缓存导致的 `.volatile()` 类型错误通过严格按最终 lockfile 重装消失，未为此改动源码。
- 本地 `npm pack --ignore-scripts --dry-run`：**219.3 KB**，未超过 250 KB 的上限。包保持 `private: true`、`0.0.0`，**没有公开 npm 发行**。
- #70 精确候选 Head 的 GitHub Actions **3/3 PASS**。这不是“最终 main 已运行独立 push CI”的证明：当前工作流在 main 上未提供同一独立结果。
- 先前隔离、明确 opt-in 的 DSH 0.1.x / 0.2.x 与真实 Chrome 自动化验证过官方安装、Host 授权、协议持久化、Chrome AX、窄屏与模拟 forced-colors 等。**这些是对应候选分支的历史自动化证据，不可冒充真人读屏或最终主线全平台验收。**

## 3. 未完成 / NO-GO

1. **人工无障碍：** [A1–A8 签收单](HUMAN_ACCESSIBILITY_SIGNOFF.zh.md)仍待 macOS VoiceOver、Windows NVDA、真实 200%/400% 浏览器缩放、Windows 系统高对比度、双语动态播报与授权/断连理解测试。#53 替代动态播报方式可在此阶段比较。
2. **部署与稳定性：** 进一步核对不同系统上的官方插件安装、已安装包导出兼容、异常恢复和用户 Profile（仍应在授权隔离环境内）；保留 [Issue #62](https://github.com/ysr666/agent-picket/issues/62)作为键盘行为调查，不把已被确认为正常的候选菜单刷新再当成上游 Bug。
3. **跨宿主：** Claude Code/Codex Hook 的真实宿主安装和通知不因 DSH 主线通过而自动获得认证；[PR #24](https://github.com/ysr666/agent-picket/pull/24)独立评估。
4. **发行：** npm 发布、取消 private、在真实工作中启用阻断等均未获授权；当前实现只用于受控预览与进一步验收。

## 4. 阅读与本地验证

[从这里开始](START_HERE.zh.md) · [本地私有包与 DSH 官方安装](PACKAGING.zh.md) · [DSH 0.2 Chrome AX 自动化](DSH_02_OFFICIAL_RIGHTS_AX_E2E.md) · [工会参与机制](UNION_PARTICIPATION_V1.zh.md) · [完整历史集成审计](PR_STACK_RELEASE_AUDIT_2026_10_10.md)。

**状态说明：** 早期用于合并审查的历史 Draft 已按祖先关系或明确功能承接逐一归档，分支/提交均未删除；当前独立待处理的设计验证和 Hook 实验不应混作已发行产品。
