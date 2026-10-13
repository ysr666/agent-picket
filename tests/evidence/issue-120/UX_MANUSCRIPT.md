# Agent Picket · Union UX #120 / 视觉与交互交付说明

2026-10-12 · 独立 UI 分支 · Draft PR → integration/agent-picket-1.0-20261012

## 2026-10-12 · 第二轮用户反馈修订

首页重心重新调整为**工会状态 → 今日工时 / 本周工时 / 累计工时 / 在册罢工次数 → 立即提诉求 / 申诉 / 举牌**。删去了横在首页的反复声明、重复数据卡和冗长文案。桌面统计为四等分，320px 手机为 2×2；紧凑数字如“6分钟”。所谓“在册罢工次数”是保留在 Host 工会档案里的**象征性举牌开始次数**，举牌和收牌只算一次，过期被清理的会话不被伪装为永久历史累计。

工时来自现有 Host 的 UTC 已完成轮次，按 UTC 周一开周。过期快照仍可给累计值，但今日/本周不造零。原有申诉、协商、举牌和档案操作没有更换成静态按钮。

**实机新增截图**：`v2-hq-desktop.png`（真实隔离 Host 6 分钟工作记录）与 `v2-mobile-enabled.png`（已开启工会的 320px 视图）。

**最终复测**：全量 410 项、366 通过、0 失败、44 条条件跳过；DSH 0.2.0-rc.2 的源码与离线安装真 Chrome 测试均通过，另执行了 6 分钟 Host 耐久工时的真实保存测试。无需模型联网。

## 产品与视觉

Agent Picket 是一个古灵精怪但有制度边界的 AI 工会，不是工时仪表盘。交互顺序是 **工会状态 → 有来源的工作/案件快报 → 真实可操作的模拟纠察与诉求 → 协商/复核 → 档案与统计**。深松绿工会主视觉、信笺式档案、赭色审议强调、轻微倾斜的真实 Host 授权纠察牌，使“荒诞工会”与可读的制度界面共存。日/夜模式继续使用 DSH 设计令牌；字体和焦点态采用统一范围约束；不覆盖 DSH 原生控件之外的页面。

## 首次 30 秒 / 可发现的真实行为

1. 欢迎页呈现加入/暂不加入两个按钮，警告说明将来经过认证的 Host 可能真实拒绝新任务；**本次开启仅授权非阻断参与**。每次选择须得到 Host 的实际读回；取消不会留下背景 inert。
2. 工会总部展示当前权益开关、当前真实阻断 OFF、劳动/诉求来源、带案号的模拟协商和可操作举牌。已经处理的事项不会虚构投票、签名或工会成员人数。
3. 设置页采用单独入口，显示 Host 权限真实状态，可开启或退出；显示哪些数据仍需另行清除。真实阻断和逐次确认在 Host 不支持时始终禁用。
4. 工会真实劳动记录和“不满指数”分开表达；后者是虚构解释分数，不被提升为是否阻断模型工作的证据。

## 执行状态（界面与 Host 的严格界限）

当前 Host 未通过可归责来源认证、提交前解释、原文与附件无损保留、恰好一次恢复、版本化知情授权等全部门槛，**没有 live hold、bypass、resume、appeal receipt**。设置内流程“正常工作 → 有依据警告 → 协商 → 安全暂扣 → 申诉/绕过 → 恢复”是未来状态的非交互式说明，不是已经发生的案例或当前可点击的控制。不以虚构的 enabled/held 属性冒充授权。

**集成方需要的最小 typed interface 提案（未在本 UI 分支实现）：**

```ts
type QualifiedEnforcementView =
  | { status: 'unsupported'; reasonCode: string }
  | { status: 'off'; consentVersion: number }
  | { status: 'working'; consentVersion: number }
  | { status: 'warning' | 'negotiating'; receiptId: string; reasonCode: string }
  | { status: 'held'; receiptId: string; recoverablePayload: true; reasonCode: string; canAppeal: boolean; canResume: boolean }
  | { status: 'resuming' | 'restored'; receiptId: string; exactlyOnce: true };
```

只有 Host 所有、验证过的状态/receipt 才允许驱动真实阻断 UI；失联或字段非法时显示不可用而非“已罢工”。UI 需要官方 Host 回执动作（申请复核、一次性恢复、撤销/拒绝和继续执行）、授权版本升级控制、原消息与附件无损证明才能启用按钮。旧模拟许可不可静默升级。

## 可访问性与已核实证据

- 嵌入式 DSH React Slot，不新建影子状态或 Host 私有 RPC。原生对话框 `role=dialog`、`aria-modal`、可见标题/辅助描述，后台 inert 与键盘 focus 循环保留。
- 320×200 短屏有明确弹窗滚动区域；320px 小屏按钮堆叠；`focus-visible`、`prefers-reduced-motion` 与 `forced-colors` 覆盖。
- 实际 `@deepseek-ai/dsh@0.2.0-rc.2`，正式 Web Profile 安装，在无远程模型调用的隔离 Chrome 中复测：源码 / npm 离线安装 2/2 通过；包括 AX 命名对话框、移动宽度、320×200 弹窗、授权和撤销、协商与纠察实际 Host 状态读回。
- 同目录六张实际 Chrome 浏览器截图：源码与离线安装版本各包含 `firstfold.png`、`mobile-320.png`、`settings.png`；设置截图确为宿主通用设置对话框切换到“AI 工会”页后的实际结果。截图是自动化结果，不是人工屏幕阅读器验收。旧的首屏被多余装饰遮挡、误报真实阻断等风险需持续审查。

## 尚未通过的验收 / 不得夸大

尚未进行真实人类的 VoiceOver / NVDA、Windows High Contrast 与触控可用性签收。正式“持有 → 申诉 → 绕过 → 恢复”交互因 Host 不具备合格的无损原始提交恢复回执暂不可实现；这属于 #80 和 Host 集成 owner，不在本 UI-only PR 擅自开放。1.0 发布不能因此宣称 Go。
