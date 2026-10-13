# Agent Picket 1.0 · V12 工会总部 × DSH Goal：实际工程验收整合与签收边界

> **证据快照：2026-10-13** · 整合候选（**Draft / NOT RELEASE-APPROVED**）
>
> 本报告汇总已存在的正式 GitHub 提交、真实 DSH/Chrome 验收记录和 Actions 结果，**不表示本次重新跑过所有原生 Host 测试，也不等于负责人完成视觉、无障碍或发版签收**。不生成虚构签收人、日期、设备或者审批。结论以具体源码提交和适用范围为准。

## 1. 本次整合的准确提交边界

| 项目 | 经核实提交 | 对产品实际带来的能力 | 证据出处 |
| --- | --- | --- | --- |
| #131 | `6664e50a4b673bc2cde32ec3e2f236617aeb9800` | 保留 V12 四室 HQ，与 **真实且有限的** DSH Goal 授权、停工呈现、用户手动恢复连接 | [#131](https://github.com/ysr666/agent-picket/pull/131) · [CI 38380875035](https://github.com/ysr666/agent-picket/actions/runs/38380875035) |
| #132 | `377f8d85406166a315007691ac584b8a4ddae261` | 首次真实授权前，针对**当前 Session** 新鲜读取官方 `goals.get`，要求可用 `resume`，避免只有设置但无 Goal 服务时错误授权；服务失效后仍可撤权 | [#132](https://github.com/ysr666/agent-picket/pull/132) · [CI 38390916529](https://github.com/ysr666/agent-picket/actions/runs/38390916529) |
| #133 | `9181340ef1876f715dd31fc29cd29b89fbedaac7` | 真正 DSH **SIGTERM 正常终止并启动新 Host 进程**，重读已授权设置与已阻断 Goal；真实 Chrome 通过官方 API 手动复工 | [#133](https://github.com/ysr666/agent-picket/pull/133) · [CI 38391675052](https://github.com/ysr666/agent-picket/actions/runs/38391675052) |
| #134 | `312be400d70833410b844735dec01574f10cd0ae` | **两个真实 Chrome 标签页**并发点击同一 Goal 的恢复按钮，最终官方 Goal revision **恰好 +1**、复工，两个阻断卡片消失 | [#134](https://github.com/ysr666/agent-picket/pull/134) · [CI 38392420960](https://github.com/ysr666/agent-picket/actions/runs/38392420960) |

**GitHub ancestry 已核实：**以 #131 head 为 base、#134 head 为 head 的 compare 结果：`ahead=3 / behind=0`，三项后续提交是严格直系后代；不需要复制四份实现。#131 自身继承 #122 的 V12 与 #130 的真实 Goal 恢复代码（见 #131 两父提交说明）。相对 #110 的当前集成 head `06bcd0a343aa1025c483faf18526dd08dc8c1e77`，#134 仍有 **25 commits / 107 changed files**，这不是“只审核四个小测试”的体量；必须以一个完整 Draft 候选审查 V12、Host API、打包、文案与依赖差异。

**未做的事：**没有把 #131–#134 各自分支强制合并到 #110、main 或发布版，没有覆盖另一会话的 Windows 工作，没有擅自启用真实用户授权。

## 2. 这条完整代码路径能够被现有证据支持的结论

### 2.1 首次加入工会与用户权利

- 在适配的官方 DSH Web Host 内，原 V12 的 **工会总部 / 协商 / 档案 / 主张** 与已有 Host 诉求、协商、象征性举牌历史保留；不是新建一套仪表盘。
- 对经验证的 Goal Host 和当前 Session，用户明确点击版本化的 **Goal 真实停工知情授权** 后，官方 Host 以同一次受控设置 CAS 反映工会参与和真实 Goal 权限。**默认关闭；旧版象征性授权不会静默升级。**
- UI 必须说明实际范围：经核实的 **UTC 当日完成 Turn 墙钟时间 8h**（含等待、非纯推理时间）；当前回合照常完成，**仅后续自动 Goal rounds 被阻止**；普通聊天、工具、附件不被此功能直接拒接。用户可独立在设置里撤销。
- 授权时的服务探针只是“此 Session 的官方 Goal 读取和恢复 API 存在”的证据，**不是任意未来 Host 版本、每一种 Goal 安全停工语义均被保证的证明**。

### 2.2 被阻断任务的可见性和自主复工

- Host 实际返回 `phase=blocked` 且 `blockedReason.code=picket-work-limit` 的**当前 Session Goal** 才能显示“真实停工”卡片；不能拿象征性抗议或计数器代替。
- 复工由用户明确点击 V12 HQ 按钮，经过 Session / Goal ID / revision 验证后调用官方 `remote.goals.resume(sessionId,{id,revision})`；不自动重放、改写或丢弃原始消息。
- Host 修订号从 `blocked rev2` 推进到 `active rev3`；复工卡片随官方投影消失。**这是 Goal 后续自动轮次工作边界，不是通用新提示词拦截。**

### 2.3 真实原生 Host 验收已记录的范围

| 维度 | 已有证据 | 正确的签收级别 |
| --- | --- | --- |
| 官方 DSH Web 0.2.0-rc.2 + 真实 Chrome | #131 / #132 的独立环境 E2E：首次授权 → 合成真实格式的 8h 统计 → Goal 实际阻断 → HQ 手动恢复 | **该版本、该路径的原生工程测试通过** |
| 官方 DSH Web 0.2.1-alpha.2 + 真实 Chrome | 同路径原生 E2E（隔离 Profile + 本地离线模型） | **该版本、该路径的原生工程测试通过** |
| V12 最初的 Chrome UI 交互回归 | #131 声明在 0.2.0-rc.2 的**源码模式与离线 npm 安装模式 2/2 PASS**，含键盘/AX、320px、四室、设置、象征性行动 | **已有自动化视觉/交互检查；非人工审美和真人读屏签收** |
| Host 进程重启 | #133 在两种 DSH 版本执行**正常 SIGTERM 后全新 Host**，原始授权及 blocked Goal 重新读回并手动恢复 | **干净进程终止/重启路径通过；非突然断电** |
| 双标签并发复工 | #134：两个真实 Tab 同时触发恢复 UI，官方 Goal 最终 `rev2 → rev3`，两个卡片消失 | **最终 Host CAS 状态正确；不宣称底层恰好只发送了一次 RPC** |
| GitHub 跨平台 Node CI | #131/#132/#133/#134 **每次都是 4/4 SUCCESS**：macOS Node24，Ubuntu Node22.19/Node24，Windows Node24（portable-only durable ledger NO-GO） | **类型/单测/打包/可移植测试通过；不能当 Windows 原生 DSH Goal 验收** |

以上原生场景均由**临时 Host/Profile、真实 Host 代码和合成 8h 统计及离线模型**完成。没有声称用户真的工作了连续八小时、生产提示词和附件均被拦截、外部模型运行，亦没有擅自把 synthetic fixture 转化为真实用户授权。

## 3. 一票否决 / 当前未完成项目

| 阻断项 | 当前事实 | 下一次真正需要什么验收 |
| --- | --- | --- |
| **真实 Windows Goal 触发与数据** | `src/adapters/node/durable-stats.ts` 的生产构造函数仍对 `win32` 抛异常；插件无法取得可信 UTC-day completedTurnMs，不能认为具备自动工时阈值停工 | 在真实 NTFS + 正式生产插件（**非仅** `windows-ledger-writer.experimental.ts`）完成私有 ACL、完整 WAL 数据、Host 触发/崩溃恢复 |
| **DSH Desktop** | DSH Web/Chrome 测试不能替代 Desktop | 原生 Desktop 的授权、阻断、复工、附件恢复及可见性全流程 |
| **Codex / Claude Code** | #131–#134 不提供这两客户端的完整正式停工验收；Codex UserPromptSubmit 的 `-i` 初始提交与重启 PNG 无损恢复仍为已知 NO-GO（#127） | 每个声称支持的客户端/系统分别走官方 Host 拒接、无损保留、原生恢复与撤销证据 |
| **异常杀进程/断电** | #133 是 SIGTERM 后重启，不能证明强制崩溃、断电或 NTFS 原子性 | 故障点矩阵+真实 Host 恢复、统计一致性、只复工一次、无未授权再停工 |
| **通用普通输入 + 多附件无损** | DSH Goal 阻断不等于普通聊天提交拒绝；Codex 新提示词拒接有真实附件丢失缺口 | 原文、所有附件、顺序、来源由 Host 保留且恢复实测，不能用截图/占位符代替二进制有效性 |
| **视觉及无障碍人工签收** | V12 有自动化 Chrome/AX/320px 证据；尚无独立的审美、真人 VoiceOver/NVDA/触控签收 | 负责人实际观看 desktop+320px 明暗页面；真人可操作焦点/键盘/读屏验收 |
| **打包发布 / 安装卸载** | #131–#134 是 Draft；各自 CI 绿，但 `release:gate` 明确 NO-GO；不能只凭 250KB 内打包就宣布首发 | 按 12 格原生 Host×OS 矩阵、严格 release evidence、集成 PR 差异复审与负责人批准 |

特别区分：**工时计数器归 Agent Picket 统计账本；真正 Goal 状态和 consent 归 DSH Host**。Windows NTFS 工时实验不能代替 Host Goal 恢复，也不应被当作 Host 权限本身的数据库。见 [Windows P0 #121](https://github.com/ysr666/agent-picket/issues/121)。

## 4. 给集成负责人的实际签收动作（不可默认为已完成）

1. **集成代码审查：**将本 Draft 的完整最终 tree 相对 #110 base 审核；重点对比 #122 V12、#128/#130 Goal、#131 融合代码，保留各处测试；确认 CI 并留意所有变更文件，不盲目把它当作四个小 PR 合并。
2. **工程验收认可：**认可上表带具体 Host 版本的已跑测试为*有限原生证据*；核对 #131–#134 evidence 文档、Head commit、Actions 结果。不要填写虚构的签收人或直接把自动测试变成人工验收。
3. **产品验收：**真正跑和看 V12 的首次授权、权限撤销、已阻断卡、复工流程；人工评估统一视觉和行为。未签收的格子继续显示未签收。
4. **跨平台验收：**分别补 DSH Desktop、Windows/Linux DSH 真实 Host、Codex、Claude Code；验证真实附件与异常重启恢复。
5. **发布决策：**一旦全量证据齐备，由负责人**另外明确批准**合并、Tag、npm 发布。此 Draft 自身不是发版许可。

## 5. 单一集成候选的处理原则

- 新集成候选 **从 #134 head 的完整树继承**，不重新实现 HQ 或重复 cherry-pick #131/#132/#133/#134。
- 仅添加本份**工程验收台账**；不修改真实用户 Host 配置、不调整授权默认值、不额外启用罢工、不改变发行门禁。
- 本候选 PR 的 base 为原集成分支 `integration/agent-picket-1.0-20261012`；目标是提供一次统一审查窗口。**不可在另外四个 Draft 继续变更时不加复核地直接合并本候选。**
- 如果上游 PR head 改变，先更新本台账及实测，而不是用旧绿色截图/摘要继续签收。

**最终结论：**V12 工会 HQ + 受限 DSH Goal 停工/恢复在**已经测试的 macOS DSH Web 两个 Host 版本**上，有可复核的真实工程证据，可作为**有限范围的工程验收基线**；这不是整个 Agent Picket 1.0、12 格跨平台矩阵、真人 UX/AX 或通用输入无损的正式签收。发布始终 **NO-GO**。
