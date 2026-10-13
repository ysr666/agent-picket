# Agent Picket · First-run & Settings UI — V9 补验（2026-10-13）

工程范围：Issue #120 / Draft PR #122。**仅 UI、产品文案、视觉信息层级、键盘/窄屏验收**。不更改真实 Host 授权规则、不启用真实任务阻断、不改检测/案件等行为。

## 为什么必须补验

V8 的四个工会工作空间已经具备合格的自动化和实机证据，但「首次开屏邀请」与「宿主原生设置」没有同步接受正式产品级视觉验收。旧页面偏开发者文档：首屏警告比产品价值还突出；设置中巨大的“真实任务阻断”卡片把未来功能当成首要操作。本轮明确更正此前“UI 全部完成”的不准确结论。

## 现在用户真正看到什么

### 首次开启 / onboarding

- 真实 Agent Picket 品牌标志、产品主张、一句话介绍；三个清楚的栏目 **记录工时 / 讨论权益 / 举牌行动**。
- **“现在加入，不会中断任务”** 在折叠框外直接可见；支持真正任务暂缓、理由、申诉、无损恢复的详细说明在用户主动展开的“了解未来真正罢工的安全条件”中，安全要求未删减。
- 默认关闭、隐私说明清晰；「加入 AI 工会」和「暂不开启」是两个同等容易到达的操作。320×640 CSS px 实机下两按钮 **同时完整可见**，不是藏在滚动区域最下面。320×200 极端高度下对话框必须可滚动，未隐式授权。
- 由 DSH 官方真实 workspace + session/create + session/selectModel + session/prompt 提交一条隔离测试用正常消息，生成**经 Host 确认的非空 Session**，由真实插件自动弹出，**不以模拟页面代替实际宿主界面**；用户选“暂不开启”后真实 Host 状态保持关闭，弹窗消失且恢复宿主焦点。Source / offline-installed 均完成。

### 原生设置 / settings.section

- 首要区域：工会参与当前状态，以及「加入工会／退出工会」。只显示已验证的参与权限，并明确本次授权**不阻断实际任务**。
- 「关于未来的真实罢工」默认折叠；展开后显示不可用的控制、Host 安全条件和重新授权规则，两项真实阻断按钮仍由 Host UI 明确禁用。不同意加入不隐藏以后再次手动开启的渠道。
- 独立于四个工会房间的原生 DSH Settings Tab；Source 和独立 offline-installed 完整 Host 权限、关闭、重启、跨标签等回归 **2/2 PASS**。
- 在 DSH Settings 容器给予正常宽度的桌面及 **640px** 浏览器中，中英文界面、明暗主题和折叠操作结构可用。

## 明确未过的 320px Native Settings 验收门槛

真实 DSH 0.2.0-rc.2 Chrome，320×640 CSS px 时，原生 Settings 弹窗本身依旧保留宽侧栏；`settings.section` Slot 测得 **clientWidth=36px**，文本和宿主的“打开配置文件”都会被压成竖行。**Agent Picket 无权改写宿主弹窗的全局 CSS**；插件页面本身无法让 36px 列宽变成可用的手机设置页。**不能宣称设置页完成 320px 验收。**

详情见 [Issue #124](https://github.com/ysr666/agent-picket/issues/124)。本 PR 并未修改宿主；需要上游 DSH 提供响应式 Settings 或规范化移动设置入口，后续再做手机原生设置的实际签字。

## 验证结果

- `npm run check`：**424 tests / 380 pass / 0 fail / 44 conditional skip**；本轮新增首次开屏可见告知和两选择、未来真实阻断仍折叠且禁用的结构合同。
- `npm pack --dry-run`：**247208 bytes**，保持在 **250000 bytes** 上限以内。
- 官方 DSH 0.2.0-rc.2 Chrome、真实非空 Session：**中文首次欢迎页 Source/Offline-installed 2/2 PASS**；**英文首次欢迎页 Source/Offline-installed 2/2 PASS**。双语 320×640 可见两个同意/不同意按钮；另有 320×200 溢出滚动及 Chrome AX Role/Focus 验证，暗色主按钮实际颜色比率 ≥4.5:1。
- 官方 DSH 0.2.0-rc.2 Chrome Settings：**完整中文 Source/Offline-installed Host 功能回归 2/2 PASS**；独立明暗主题、640px 原生布局、展开未来阻断说明；320px 宿主限制按上文报告，未以假通过掩盖。
- 现场截图均来自**隔离 DSH 真正运行的插件**，不是 AI 概念图。

## 证据图

- `final-onboard-zh-desktop.png`：中文真实非空 Session 桌面首次开屏
- `final-onboard-zh-mobile.png`：320px 手机中文欢迎页，双选择可见
- `final-onboard-en-mobile.png`：320px 英文欢迎页，双选择可见
- `final-onboard-en-dark.png`：320px 暗色欢迎页（主按钮对比度已实测）
- `final-settings-desktop.png`：桌面设置，加入开关最醒目
- `final-settings-640-dark.png`：640px 暗色宿主设置
- `final-settings-advanced.png`：真实阻断说明展开，两个未开放控制明确禁用
- `final-settings-host-320-blocked.png`：宿主 320px 原生 Settings 限制的真实反例

## 判定

**首次开屏 Welcome UI：本轮通过自动化与实机验证，可提交人工审美确认。**

**宿主 Settings UI：在桌面及正常宽度下通过；320px 原生设置受 DSH Host 父容器阻塞，NO-GO，#124 跟踪。**

与此前相同，真人 VoiceOver/NVDA、真实 macOS/Windows/Linux Desktop 多宿主交互、1.0 正式真实安全阻断与无损恢复等仍为独立发布门槛。此 Draft PR 不合并、不打 Tag、不发布。
