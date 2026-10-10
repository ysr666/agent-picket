# AgentPicket 研发现状与合并检查单

> 最后核对：2026 年 10 月 9 日。这里记录“开发分支已经做到什么”，不是声称 main 已发布，更不是宣称自动罢工已经可靠。

**项目：** https://github.com/ysr666/agent-picket

## 现在能用什么？

以下功能已在对应的叠加开发分支运行与测试，并不在当前 main 中：

- 独立 TypeScript Core：人类输入来源信心标注、保守中英规则、会话状态机、安全阻断条件、可测试 Mock Adapter。
- DSH 0.2.0-rc.2：Cordis 原生监测入口、/union status / stats / report / check / strike / resume / safety 等本地命令。其中 strike/resume **仅是象征性模拟**，不拦截任何请求。
- DSH Web：Client Companion 的空白会话即时通知、命令菜单、真实 Chrome 对话交互；曾实测与 dsh-vision-router 3.0.3 共存。
- 实验性 npm tarball：预编译 ESM JS/类型声明、可离线安装的 DSH 插件与浏览器模块，无隐式安装后脚本；当前包仍是 **private: true、0.0.0、未公开发布**。
- 跨宿主研究预览：Claude Code/Codex 的 UserPromptSubmit 非阻断 Hook CLI，共用本地检测器。已做 Node 子进程测试，**Claude Code 已在隔离 CLI 中验证 Hook 被真实调用，但模型交互及通知显示未完成；Codex 仍未完成真实 Host 调用**。

## 验证记录（必须区分“跳过”和“通过”）

- 2026-10-09 最新本地普通流程：npm run check，**84/84 普通测试通过**；真实 DSH 测试因未指定 Host 时为 skipped，并不能算入 84 项。
- 固定版本的隔离 DSH、Cordis 和 Chrome：**15/15 真正运行的 Host 测试通过**，包括源码版／离线安装版、命令 UI、匿名规则汇总、Session 事件持久性和生命周期。
- GitHub Actions 轻量 Node.js 22.19 流程：PR #19 与 #21 的 contract job 均已在 GitHub 检查到 pass（各约 19–20 秒）。其他 PR 的 Actions 状态应逐个核查，不可从其中一个通过推导整个项目通过。
- 这些是回归测试，不是跨操作系统、跨 Host 版本、第三方生产环境的全部认证。

## PR 叠加链：不要随意把最新分支直接并入 main

GitHub 在本次核对时列出 **20 个开发／集成 PR（#5–#24；以 GitHub 实时状态为准）**：

| 范围 | 改动与当前状态 |
|---|---|
| #5 | 独立 Core 与 Mock；非 Draft，仍未合并 |
| #6–#9 | DSH 事件、工作统计、检测器、可加载插件 |
| #10–#13 | 手动模拟罢工、安全准入门槛、JS 包、手动本地预检 |
| #14–#18 | DSH Web 启动/认证、真实 Chrome E2E、即时提示、离线安装、监听器卸载 |
| #19–#20 | 轻量 CI、npm 分发契约、持久 Session 日志与 Web UI 历史回放证据 |
| #21 | Claude Code / Codex 观察型 UserPromptSubmit Hook CLI |
| #22 | 更新过期的贡献者入口、当前状态和合并安全门槛（本文件） |
| #23 | 针对 main 的全部功能集成审查 Draft PR（并未合并） |
| #24 | 使用隔离的 Claude Code CLI 实际加载 Hook（无在线模型） |

这些 PR 基本以**前一个 feature 分支为 base**，不是 17 个都对 main。GitHub 检查时 **#8、#11、#14 的 mergeStateStatus 标为 DIRTY**；这意味着应当逐一核对真实合并冲突，而不能一键批量合并或通过强制推送掩盖。冲突状态会随基准分支变更，需要在审查时重新确认。

建议合并程序（先取得仓库维护者授权）：先备份并确认各分支确切提交，按依赖顺序处理；逐 PR 重新检查 Base/Head、差异、CI、权限与文档，处理冲突后回归完整测试。不要基于最新分支的全部历史做无审查的 squash，也不要改动用户其他本地未提交工作树。

## 当前已知限制

1. **阻断不安全：** DSH 原生 pre-step 拒绝不能证明用户已收到可操作的拒绝提示以及完整附件恢复；所有 Adapter 保持非阻断。
2. **来源不是确证真人：** source.kind=user、UserPromptSubmit 等字段都不能单独证明真人直接写下文本。
3. **会话历史 UI：** 测试发现刷新后旧命令卡片偶尔不重新显示。但压缩的 Host Session 日志含匹配的 command/run 与 command/done，因此不能把显示问题解释成记录丢失。仍需前端 Session Binding / eventSource 证据。
4. **持久统计：** 开发分支已增加默认开启的本地工作量总计与 UTC 日汇总（详见 [STATS_STORAGE.zh.md](STATS_STORAGE.zh.md)）；当前会话计数、工会模拟状态仍留在内存。敏感规则分类长期持久化默认关闭。跨进程高负载与意外崩溃恢复尚未验收。
5. **跨平台：** Claude/Codex Hook CLI 通过真实 Node 标准输入输出模拟，尚未确认用户客户端的实际加载、通知及安全退路。
6. **分发：** npm 未发布；DSH 除固定受测版本外没有完成跨版本矩阵。

## 下一阶段建议

优先顺序：复核并修复叠加 PR 冲突 → 补全 Host 多版本/系统兼容测试 → 完成 DSH Web 历史回放定位 → 手动安装的 Claude/Codex Hook 真正端到端测试 → 本地匿名持久统计 → 再讨论公开预发行版。

只有在确认用户可见的拒绝原因、输入附件完整恢复、明确 opt-in 与来源可信度等门槛全部通过后，才考虑真实自动罢工。**任何情况下不以“让工会显得更有趣”为由吞掉用户工作。**
