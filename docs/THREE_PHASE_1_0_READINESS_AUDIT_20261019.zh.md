# Agent Picket 1.0 三阶段剩余验收与执行记录（2026-10-19）

> 依据 Draft PR #177（基于 integration/agent-picket-1.0-20261012）、`release/first-release-evidence.json`、`scripts/check-first-release.mjs`、各 Host 真实验收记录。本文件是工作审计，不是发布授权或人工体验 PASS。

## 第一阶段 · Issue #79，尊严权益生命周期

现有 Core `src/core/dignity-escalation.ts` 已经把可靠真人来源的高置信度重复定向攻击定义为：第一条警告、第二条提出沟通、10 分钟内第三条生成安全停工的**请求**。支持去重、时间窗、退出重置、申诉冻结与经真人确认结案；`request-safe-goal-strike` 不是 Host 真实 `block` 回执，不能直接挡住模型。

DSH 当前可实际获得的尊严信号来自 Host 观察到的消息角色与本地规则，来源明确是 `claimed-user-source`，不是经验证的直接真人身份。官方只读端点为临时汇总，不保存对话原文、附件或自动处罚结论。因此即便观察到三次或更多规则命中，也**绝不能**把计数当成三次真人攻击，更不得进入真实停工。

本轮在 Union HQ 的“尊严”区域新增一条真实数据驱动、可读屏的三段路径：

1. **规则线索**：无数据、无待核对规则信号、来源未验证的疑似规则信号。均不做实名、定罪或处罚推断。
2. **用户主持的委员会流程**：未立案、主动立案、听证、结案。依据已有 Host 案件账本状态及准确版本令牌；草稿不会自动提交。
3. **真正的工作边界**：无 Goal 停工／只保存新版 Goal 工时授权／官方 Host 已确认工时 Goal 停工。这里发生的真实 Goal 停工理由只能标为**工时阈值**，而不是“因尊严攻击而罢工”。复工仍通过官方 Goal 通道，普通用户输入与附件不被扣留。

这形成了**用户可操作且诚实的展示闭环**，但不等于 #79 全面关闭。待完成的关键缺口：真正可信的直发真人来源、检验引用/日志/教学语言的多语料误判基准、由可靠来源到实时警告/沟通的实际 Host 事件衔接、已申诉时跨端冻结的一致性、以及实际惩戒型停工需要的 Host 无损回复保证。在这些缺口补齐前不激活自动辱骂停工。

## 第二阶段 · 不造新适配器的 Host 复核结果

| 路径 | 已有的真正证据 | 仍不能宣称的能力 | 安全决策 |
| --- | --- | --- | --- |
| DSH Web（rc.2、alpha.3/4/5） | 官方 SDK/真实 Chrome、v2 授权、已完成 Turn 工时下界、Goal 后续续轮 block、通知、冷启动与双标签 resume；Linux CI 和 macOS 本地验证 | 普通文本、图片、附件在提交前由 Host 原子 hold 与恰好一次恢复；所有桌面或独立 Host 所有者共享配置 | 仅已验证自动 Goal 边界可真实停工；普通消息拒绝 OFF |
| DSH Desktop | Windows 实际安装 `0.2.0-rc.2`，插件装载、退出工会及冷启动 OFF 回读有正面证据 | Desktop 原子普通消息暂扣、原文+附件恢复；在被测 Desktop 上甚至没有实际提供可验证的 Goal 执行服务；macOS/Linux 原生桌面安全矩阵 | 不继承 DSH Web 的阻断结论，保持 OFF |
| Claude Code | 官方 Claude Code `2.1.295` 真实 Bash `PreToolUse` deny/allow/fail/Host-disabled 实验，Linux/macOS 已有真实测试 | 任何新用户输入和附件的统一保留、官方多客户端复工；所有工具全覆盖；真正产品授权/撤销和 Windows 全功能验收 | 仅声称特定 Bash Hook 实验结果，不能声称统一真实罢工 |
| Codex | 旧 `0.146.1` 确认了跨进程重复 Goal owner 风险；官方 `0.163.0` 的跨进程独占 Goal owner 在 Windows/macOS/Linux 三套原生测试通过 | 官方 Goal mutation 没有具条件 revision/CAS 的完整外部停工状态提交证明；`UserPromptSubmit` 拒绝后原文/PNG/附件全路径无损恢复与 Desktop 支持 | 旧版本危险边界保留，0.163 进步不自动升级为全面安全停工 |

**不重复建设：** 复用 PR #126/#139/#155/#156 等现有代码与证明。不要创建副本适配器、插件私有原始文本缓存、进程强停或假回执；官方能力不足时将相应物理执行保持关闭。

## 第三阶段 · 真人体验、发布合并与负责人签收

尚未由真人完成并签字的项目不得写进 `release/first-release-evidence.json` 的 `verified` 项：

- 首次安装与 30 秒理解：用户能否区分故事、尊严规则信号、模拟举牌、真正 Goal 停工；不加入与旧 v1 授权不会造成真实停工。
- DSH Web/DSH Desktop + Claude Code/Codex：支持范围按客户端和 Windows/macOS/Linux **逐格**验收。真实 Host 拦截前理由、许可撤销、模型未调用、所有输入/附件精确恢复、重启与跨进程竞争均要单独证据。
- VoiceOver（Mac）、NVDA（Windows）、仅键盘、320px、200%/400% 放大、强制色、亮暗主题、中文/英文理解；必须保留真人操作录像或脱敏记录与签收者。
- 隐私和历史操作审查：官方导出不泄露原始提示词/Session ID，分类删除不影响原生聊天、旧版本或跨 Host owner 不会悄悄复活授权；只对已验证支持的范围声明。
- PR #177 和 PR #110 的归属、落后分支/冲突、用户文档与 README、安全问题清单统一审核；1.0 候选冻结，维护者最终明确批准后才能合并与发布。

### 当前判定

**仍为 NO-GO。** 本轮安全展示改动和上述已有自动化成功并不等于 1.0 全部满足；发布门禁现在仍要求 4 条客户端路径 × 3 个操作系统的真实强制执行/恢复证明、真人 UX/无障碍签收和维护者明确许可。不得仅因 CI 7/7 全绿修改证据为 verified。

### 后续官方版本核查 · 0.2.1-rc.2

已另行独立安装官方 \`next\` 版本，并完成真实 Chrome Goal 停工／恢复 1/1 通过；新版本六处关键输入/Goal 公共实现与 alpha.5 原始字节完全一致。普通消息的 Host-owned 原子 hold/resumeOnce 仍没有已发布接口，\`release:gate\` 继续 NO-GO。详细可复验的反例与 #79 UI 通知失败试验见 \`docs/DSH_021_RC2_SAFE_INPUT_HOLD_AUDIT_20261019.zh.md\`。

## 2026-10-19 用户明确改变普通消息拒绝契约

用户决定不再要求拒绝后自动保存、排序恢复原文与附件。新标准：**真实停止模型和工具执行、拒绝时可见具体罢工原因、明确提示文字与附件需要复工后重发、恢复后只执行用户新提交的请求、不偷跑旧请求**。旧规格在历史文档保留，新规范见 \`REAL_REFUSAL_DISCARD_RESEND_20261019.zh.md\`；\`release/first-release-evidence.json\` 转为 v3，\`losslessRecovery\` 改为 \`discardAndResubmit\`；发布门禁仍为 NO-GO，绝不使用旧验收盖章证明新能力。


## 2026-10-19 · PR #177 Windows Native 新证据（NO-GO 不变）

当前 SHA 7836a03 在真实 Windows NT 10.0.26200.0 上完成 Windows 可移植原生测试 635 PASS / 0 FAIL / 57 SKIP，亦使用隔离官方 DSH Desktop 0.2.0-rc.2 完成离线安装、加入工会、工会电报与立场指数开关、听证/协商、退出及完全冷启动后的保持退出。见 docs/PR177_WINDOWS_DESKTOP_NATIVE_ACCEPTANCE_20261019.zh.md。

这仅使 Windows Desktop 工会交互得到正面实证，未证明真实 Goal 停工、普通消息拒绝可见重发、Windows 生产 DurableStats 或 4×3 全矩阵；全套 npm run check 的 POSIX 账本套件在 Windows 仍因有意安全关闭而失败。release:gate 继续 NO-GO。
