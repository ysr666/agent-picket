# Agent Picket · V8 UI 深度复核与缺陷更正（2026-10-13）

仓库：`ysr666/agent-picket`；工作范围：Draft PR #122 / Issue #120 / 原 V8 视觉系统。
基准：真实 DSH 0.2.0-rc.2 Chrome，宿主自身 `data-ds-dark-theme` 暗色模式，官方插件源码安装以及独立 npm 离线安装。不是 ImageGen 设计稿或对假数据后台的截图。

## 结论先行

**此前“V8 完全 OK”的判断过早。** 空闲态亮色图和单个按钮的暗色对比度，不足以代表所有页面 / 所有 Host 数据状态。此次重新检查真实暗色四房间、320px 英文排版、滚动后的活动选项 / 链接，以及 Host 真正创建议案后的案件簿。

## 实际检出的缺陷（不是理论推测）

| 发现 | 复核前 | 修复方式 | 自动验收 |
|---|---|---|---|
| 英文状态标签挤出版心 | 320px + 暗色 `Union office open` 溢出右侧 | 状态胶囊限定适应性宽度，11px 字体，必要时两行；中英文都不能出界 | 从 Chrome 获取 DOM 矩形校验 `badge.left/right` 在插件表面内 |
| 暗色倡议选项近似黑底黑字 | `Warnings and appeals` 等未选中选项不易阅读 | 工会独立 `ap-space-cause` 暗色文字、按钮边框和选中态背景 | Chrome 实际计算每个选项按钮 / 草稿文本区域对比度，阈值 ≥ 4.5:1 |
| 暗色议题链接使用默认深蓝色 | 卡片下方 `View the public GitHub issue` 对比不足 | 插件暗色主题的所有真实链接使用高对比浅蓝，继续保留下划线 | Chrome 验收覆盖滚动后的真实 `a[href]`，阈值 ≥ 4.5:1 |
| **真实议案后的暗色案件簿浅底浅字** | 先在 Host 提交真实议案，再进入工会案件簿；实测文字对比度 **1.36:1** | 案件卡片暗色背景与浅色正文成对设计；首个案例略加亮但不依赖色彩区分 | 真实 Host 议案从 Source/Installed 创建并读取，抽取实际卡片背景与段落字色，对比度 ≥ 4.5:1 |

这些是 UI Bug 修复，不是工作时长规则或尊严检测的新功能。所有 CSS 都在官方 DSH Slot 的 `.ap-ui` 下，没有修改宿主全局设计系统，也没有偷偷修改用户授权。

## 实际验证

- `npm run check`：**422 total / 378 pass / 0 fail / 44 conditional skip**。
- `npm pack --json --dry-run --ignore-scripts`：**245331 bytes**，继续低于 250000 bytes 限额。
- **暗色中英文专项**：`PICKET_UX_VISUAL_ONLY=1 PICKET_UX_DARK_AUDIT=1 PICKET_UX_MOBILE_ROOMS=1 PICKET_UX_BROWSER_LOCALE=en-US`；同一官方 DSH 浏览器下 Source 与 Offline-installed **2/2 PASS**。验证导航、320px 真实矩形、暗色选项/链接和草稿，测试环境才会生成截图。
- **真实 Host 议案专项**：`PICKET_UX_AUDIT_CASES=1 PICKET_LIFETIME_E2E=1`；真实 `session` 与 Host 档案写入，Source + Offline-installed **2/2 PASS**，在有新议案的黑暗主题中测量案件内容对比度，不能由空档案图伪造。
- **全流程 Host 压力路径**：`PICKET_DIGNITY_E2E=1 PICKET_LIFETIME_E2E=1 PICKET_UX_MOBILE_ROOMS=1`；Source + Offline-installed **2/2 PASS**，包括本会话真实尊严分类、宿主权限、跨标签、协商/举牌/撤回/删除等；此项与上面暗色专项分别隔离运行。

## 可见证据

- `final-review-dark-home-320.png`：最终暗色英文首页；状态标签不出界
- `final-review-dark-cause-320.png`：最终暗色倡议选项
- `final-review-dark-cause-draft-320.png`：滚动后的按钮、只读草稿和 GitHub 链接

三张图均来自真实 DSH Chrome 的隔离测试 Profile，内容是合成测试工时与公开倡议文字，不涉及用户个人消息。

## 仍不能声称的内容

- 本报告代表 **V8 UI 范围的自动化与本人视觉复核**，不是经过真人 NVDA/VoiceOver 或触控手势测试的无障碍正式签字。
- Mac DSH Web 真实 Chrome 不能代替 Windows/Linux 或 DSH Desktop、Codex、Claude Code 的真实 UI 接入；GitHub 多系统构建是构建证据，不代表各端运行验收。
- 1.0 发布规范 `docs/RELEASE_1_0_NONNEGOTIABLE_20261012.zh.md` 仍有真实安全任务阻断、Host 无损恢复与多端适配等 NO-GO 门槛。本次禁止因 UI 与 CI 通过就合并、打 Tag 或发布。
- 真实辱骂原句不在现有 Host API 中；不为装饰性展示伪造任何句子。

本轮工作在 Draft PR #122 保留，不能自动合并或发布。下次只有明确 UI 缺陷或用户提出的变更才开启下一轮。
