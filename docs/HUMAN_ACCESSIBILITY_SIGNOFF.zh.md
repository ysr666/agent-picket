# Agent Picket — 人工无障碍与首次使用验收单

> 截至 2026-10-10：**全部人工签核项为 PENDING**。这不是 AI 自动生成的 PASS 报告。当前 Chrome AX、CSS reflow、forced-colors **模拟**与真实浏览器自动化不能代替人类读屏和操作。

## 记录模板

每一场记录：测试日期、测试者（可用匿名编号）、系统与版本、浏览器与版本、DSH 完整版本/PR commit、是否新安装的隔离 Profile、Case 编号、PASS / FAIL / BLOCKED、问题链接、仅包含脱敏 UI 的截图。严禁包含用户 prompt、真实会话、API 密钥、Cookie、工具参数和原始 Session ID。

| Case | 手动操作与通过标准 | 状态 |
|---|---|---|
| A1 VoiceOver macOS Safari | 新 Profile 的中文首次权益邀请应正确朗读标题、模拟性质及两个独立按钮；Tab 顺序完整，默认 OFF，支持启用与暂不开启；关闭后焦点归还合法位置 | **PENDING** |
| A2 VoiceOver macOS Chrome | 重复 A1，并检查侧栏打开/关闭、Escape、正在协商的标题与动态反馈，不抢占与工会无关的阅读光标 | **PENDING** |
| A3 NVDA Windows Chrome | 纯键盘完成首次授权、模拟申诉、反提案、接受/拒绝、撤回；每个操作反馈、失效态、Host 拒绝写入应可听见 | **PENDING** |
| A4 NVDA Windows Edge | 重复 A3，确认浏览器标签切换和关闭侧栏后背景恢复，不发生键盘陷阱 | **PENDING** |
| A5 真实浏览器缩放 | Chrome/Safari/Edge 200% 和 400% 浏览器设置，实际窄屏下可滚到全部授权、提案和 Close 操作；**不允许仅用 CSS viewport 或 deviceScaleFactor 代替** | **PENDING** |
| A6 系统高对比度 | Windows High Contrast 两种真实 OS 主题，区分 enabled/disabled/pending 与真实焦点边框；CSS forced-colors 模拟不算通过 | **PENDING** |
| A7 中英与减弱动态 | zh-CN、en-US、reduced motion、状态写入被拒绝、离线及恢复后，术语准确，读屏不会把模拟签名说成真实 Agent 自治决定 | **PENDING** |
| A8 隐私与理解访谈 | 用户在不看开发文档的情况下能讲清工会默认 OFF、工时统计独立、模拟罢工不会阻断 Agent，并能找到退出授权入口 | **PENDING** |

## 自动化已有什么，缺什么

- **已在 Draft 验证**：真实 Chrome AX tree、320×200 CSS reflow、forced-colors emulation；真实 DSH 官方 Host/浏览器、多标签页与命令操作；当前 DSH 0.2 键盘就绪修正后每个版本单独 12/12 集成运行。这些数据不等价于本表的任何人工 PASS。
- **尚需真人**：实际屏幕阅读器播报、原生浏览器缩放、Windows 系统高对比度、跨浏览器真实定位、用户对隐私及象征性工会身份的理解。

## 判定

若任一 A1–A8 未被实测，**不得声称 WCAG 认证或完整无障碍合格**。自动化可以继续作为回归门槛，不得凭截图推断读屏语义。若真人观察到与真实授权或真实 Agent 任务相关的误导/阻断，暂停任何公开推广或版本发布，先修复并复测。

## 2026-10-10 实机 Chrome 自动化补测（不是人工签核）

- **DSH 0.1.2-rc.1：2/2 通过**。真实 Chrome 的源码安装及本地离线安装 Web E2E 都跑通，包含官方首次邀请弹窗的 CDP Accessibility Tree 命名、320×200 CSS 布局、关闭/焦点、模拟协商等断言。这证明旧版的自动化路径，**不证明 VoiceOver/NVDA 等人工可用性**。
- **DSH 0.2.0-rc.2：0/2 通过，但失败在前置启动测试假设**。两条测试都在等待“你的 Agent，也应当拥有权利 / Your Agent Deserves Rights”首次弹窗时超时，**尚未进入 AX/布局断言**。DSH 0.2 的首次邀请依赖会话与真实 UI 生命周期，不能直接沿用 0.1.2 的“启动后必有弹窗”假设；不能据此宣称产品无障碍失败或通过。应新增 0.2 专属首次启动/侧栏场景的自动化覆盖，并再次单独记录通过与失败。
- **因此** A1–A8 的人工项目仍全部是 **PENDING**，公众宣传不得写成“跨浏览器无障碍已验证”。参见 [PR 依赖及发行风险审计](PR_STACK_RELEASE_AUDIT_2026_10_10.md)。
