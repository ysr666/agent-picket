# Agent Picket 1.0 · PR 链收敛审查（2026-10-16）

## 边界

此分支从现有 `integration/agent-picket-1.0-20261012`（PR #110，基线 `2e0b3d7`）独立建立，**只提出进一步集成候选，不合并到 main，不发布，也不确认真实停工安全。** 合并时保留来源提交历史；优先复用已有 DSH、Claude、Codex 适配器和官方 Host 接口。

## 已集成、已独立复核的工作线

- #147→#154：官方 DSH SessionPersistence 工作证据预览、真实 Web/Chrome Goal 测试与重启后附件字节校验。这些测试不能证明普通消息可原子拒绝并无损恢复。官方 list() 容错不另建 SQLite/WAL。
- #139→#155：现有 Claude Code 官方 PreToolUse Bash Hook 与 Linux/macOS 真机 CLI 验证。不把 Bash-only 拒绝称为全模型/全输入真实停工。
- #158：只有 Host 回读确认成功，HQ 才可声称加入或退出工会。
- #159：工会退出后仍可通过官方 Host 设置撤回既有 Goal 停工授权；工会关闭状态下不能新授予。
- #160：CLI 语言测试明确设置模拟 Host 区域偏好，不改变用户默认自动语言选择。
- #164：仅回移两个彼此独立的 Core 提交（`src/core/dignity-escalation.ts` 与对应测试），修复申诉/重置后已验证事件重放导致重复警告，以及超出有界事件记录后的错误继续受理；保留原提交与回归测试。未在此整体合并 #161→#163 的 UX/案件分支。

#158 与 #159 在同一测试文件尾部冲突，分别保留全部新增测试并重新闭合代码块，没有删除测试绕过检查。

## 第一阶段低冲突候选验收（历史快照）

- macOS 独立克隆，`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm run check`：547 tests / 479 pass / 0 fail / 68 opt-in skip；TypeScript 与 build 通过。
- `npm pack --dry-run --json`：234,164 bytes、114 entries（不含本文）；限额严格保持低于 250,000 bytes。
- `git diff --check` 通过。合入不代表 12 格原生 Host/操作系统签收。

## 已解决的分叉冲突与仍需处理的独立分支

1. **#126→#169→#170→#171→#176 已合流（本轮第二阶段）**：这条 Codex 原生安全取证 / DSH alpha.3 否定性拦截审查 / 工会行动 UI 分支从旧共同祖先分叉，直接合并出现五个实际文件冲突。如今已在独立审核分支以真实 Git merge 双亲保留来源历史并手工解决：保留 V12 `DshRightsPort.chooseFirstRun`、Host CAS 授权、可恢复 Goal 与产品 CSS；在 V12 四房间布局中整合四入口行动板、协商状态和下一步、真实 Host 案件申诉、听证二次确认和可编辑本地倡议。按钮先选择可见房间，然后在 React 切换后聚焦标题；移除了同室重复正式申诉 CTA。中英文词条按键合并未产生重复 key，V12 与新交互测试均未删减。**这不等于原 PR #176 全部自动 UI 静态布局被无条件保留；以 V12+实测交互集成为审核结果。**
2. **#161→#163 已按功能收敛**：保留旧来源测试，#161 回移 stale Host 进度单向安全门槛到 `union-story` / `union-experience` / Gazette，过时或不完整 Host 快照不可生成工作进度与追单倒计时；#162 在原案已结案且没有待决诉求时提供用户主动**新建** Host 后续诉求，检验相同 Session、案件编号、修订号和新 pending 案状态，不篡改已归档结案；#163 的 Host 尊严申诉则与 #176 的单一入口**去重融合**，新增状态（未证实 / 已立案 / 正在听证 / 已结案），必须核实新增 `question-rule` 案的 scope、新 ID、stage、outcome、可验证写入 token 才提示成功。Host 无响应、写入 no-op、重放旧 token 或切换会话不会显示假成功。对 `#163` 未简单整体覆盖 #176 的较新听证复核/取消/确认流程。
3. **#136 不合并旧生产账本实现**：该早期 Draft 依赖 `DurableStats` / Windows NTFS 私有 WAL、writer lock 来认定真实 DSH Goal 的工时可信度；其针对故障需 fail-closed 的安全原则正确，但已由维护者 2026-10-15 在 #121 重申「三端官方 Host 机制优先、不额外造存储」，且本集成已经使用官方 DSH `SessionPersistence` 已完成 Turn 下界和官方 Goal CAS。把 #136 旧 `plugin`/`integration`/`durable-stats` 改动直接 cherry-pick 会改变已验证的官方数据源，甚至重新制造第二套凭证账本，因此只保留 Draft 和原研究证据，不移植其旧架构。正常展示用的 DurableStats 与生产真实停工授权须明确分离。Windows 原生客户端/宿主验收仍按 #121 独立审核，并未因暂缓 #136 就默认通过。
4. #84/#117/#118/#119/#121/#127/#80/#86 及 `release/first-release-evidence.json` 的验收持续开放；Codex Goal 多进程所有权竞态、DSH 普通文本与附件预提交无损阻断、DSH Desktop、Windows 真实 Host 及人工读屏仍未签收。

## 集成 CI 暴露的 UTC 运行时钟问题与验证

首轮 GitHub DSH Web 官方工时 Goal E2E 在 **UTC 06:15** 触发 `round-limit`（预期 `picket-work-limit`），rc.2/alpha.3 均复现。原因不是放宽工时规则的理由：测试夹具在当前 UTC 日尚未过去八小时时，向官方 SessionPersistence 注入了前八小时的「当日」模拟劳动，开始时间跨至前一 UTC 日；生产 `inspectOfficialPersistedDay` **正确拒绝跨日的八小时假证据**。此红灯是测试时间依赖，不能调整生产门槛或声称已真实拦截。

修复严格限制在 `tests/dsh-goal-welcome.real.test.ts`：只给**临时 DSH_HOME 的子 Host 进程**注入测试期 UTC 正午的偏移时钟，重启保持同一偏移；不修改插件生产逻辑、正式 Host 配置、主测试进程和最终 npm 包。时间本来就是合成离线测试记录，不冒充真人八小时。Mac 真正安装的 **DSH 0.2.1-alpha.3 + Chrome** 完整官方持久工时 E2E **1/1 PASS**，证明首次授权 CAS、自动 Goal round 0 真正阻断、真实 Host 人类文本与文件持久写入、冷重启后文件字节 SHA-256 一致、两标签人工复工与 revision 正确增长。GitHub 独立跨版本/跨系统结果须以新提交运行记录为准。

## 第二阶段实测（最新审查 HEAD）

- **Mac 本地完整检查：581 tests / 508 PASS / 0 FAIL / 73 opt-in SKIP**，TypeScript/build 通过，严格 npm tarball 低于 250,000 B（具体字节以最新头部 `npm pack --dry-run --json` 为准）。
- **官方 DSH 0.2.1-alpha.3 + Chrome，Mac 临时 Profile，真实宿主界面**：源码构建插件 **1/1 PASS**、OFFLINE npm-installed 分发包 **1/1 PASS**，均开启离线合成尊严案件/听证流程及 320px 房间重排，真正走了一次首次授权、设置、总部交互、案件立案与复核、结案结果、键盘及 Chrome AX。均未使用用户真实密钥或原始会话。自动 AX 通过不等于人类 VoiceOver/NVDA 验收。
- 官方 alpha.3 的全局 Settings 入口实际位于**账号菜单**，修正老测试假定的侧栏「设置」直达路径；保留真实菜单访问及 native Settings 工作流，不通过 DOM 伪造 Settings。
- 新旧工会 UI 叠加后在尊严委员会产生两个含义相同的 Host `question-rule` 立案按钮；已移除多余的二次提交入口并增加真实 Chrome 无重复 CTA 校验。
- **跨平台已安装 DSH Goal 测试夹具**：初次 CI 六格在 UTC 约 06:25 全部未触发工会阻断，失败原因是早于 UTC 08:00 时模拟「8 小时已完成劳动」跨日。仅给临时 SDK 子 Host 加虚拟 UTC 正午日期，不改变生产存储、时间规则、授权和停工 API。Mac 使用真实安装 DSH alpha.3 实测 **7 小时+授权不阻断、8 小时+未授权不阻断、8 小时+授权真正阻断**，全部 PASS。Windows/Linux 与 rc.2 的更新 CI 必须单独确认后才可签字。
- Codex 多进程 Goal 所有权竞争仍是严格 NO-GO 的**真实负面证据**；此处集成的是证据/发布门禁，不是假称 Codex 已安全解决这个官方宿主缺陷。

## 第三阶段：#161–#163 与 Windows #136 决策（当前候选）

- 真实对比 PR #161 / #162 / #163 的每个核心修改与 #177 的最新 #176：#161 和 #162 以原提交最小修改移植，最新 #176 已有尊严申诉/听证而拒绝重复按钮，只补 #163 更严格的 Host 回读证据和不误导状态；保留所有增量与负例测试。
- Mac `npm run check`：**591 tests / 518 PASS / 0 FAIL / 73 opt-in SKIP**（含最新 Host no-op、重放写令牌、Session 切换、无 Host 能力回退、stale 工时与结案再申诉）。真正 DSH Chrome 源码/离线安装包回归需以本阶段重跑日志及新的 GitHub CI 为准；之前第二阶段的 2/2 不能替代本阶段签收。
- #136 在本次审查记录为「早期研究性故障停工账本分支，和官方 SessionPersistence 主线不兼容，暂不合入」，其 **故障 fail-closed 原则保留**；不创建 SQLite/NTFS WAL、不更改官方 Host、不擅自关闭该 PR。仍要审核 Windows 真正 Host 工作的异常处理。

## 第四阶段：#80/#136 的实际生产阻断来源收口（2026-10-16）

审计发现默认插件 `apply()` 在官方持久 Session 预览开关为 OFF 时，仍旧自动注册了从私有 `DurableStats.snapshotDays()` 取得工时的 `agent/turn-stopping` Goal 停工处理器。这与维护者「只有官方 Host 已完成 Turn 可作为停工工时证据，不建第二套停工账本」原则不符。单独用户授权也不能弥补证据来源无保证问题。**现直接移除默认生产路径的旧停工注册**，但保留 DurableStats 的纯观测、工时展示及本地清理功能，避免授权状态意外绕过官方证据限制。

只有在**隔离 DSH Host** 上明确开启 `AGENT_PICKET_DSH_OFFICIAL_WORK_PREVIEW=on`，并已另行获得 Host 持久授权，才注册原有 `SessionPersistence` 已完成 Turn 下界 → 官方 Goal 自动续轮阻断。不会触及普通用户输入、图片与附件。#80 普通消息 pre-submit reject 仍 **OFF/NO-GO**；#169 Codex 多所有者 Goal 仍 **NO-GO**。保留旧 `registerDshGoalWorkEnforcement` 独立研究测试/fixture，但不再由正式 `plugin.ts` 注册。新增两项真正注册路径 + 普通用户输入不吞消息的运行时测试，不靠文档声明安全。

## 第五阶段：知情许可与已启用执行能力的诚实区分（#32 / #80）

第四阶段关闭了默认插件的私有账本真实停工处理器，因此不能仅因 Client 成功读取官方 `goals/get` / `resume` 和 Host 保存 `realGoalStrikeConsent=authorized-v1`，就宣称**真实停工已经启用**。这两类数据分别证明 Goal 服务可见和用户知情许可，均**不证明执行 Hook 已注册或官方工时证据完整**。本阶段在真实设置界面加入常显的中英文运行状态警示（`data-ap-goal-enforcement=unverified`），更新欢迎页知情文案，明确：默认安装仅观测，官方已完成 Turn Goal 阻断仍是隔离、显式开启的研究预览；授权可通过设置撤销，已停 Goal 须经官方 Host 恢复。保留首次一键知情授权决定，不擅自改为每次都弹窗。

新增三态可用性/授权/服务消失的 UI 断言与双语言合同测试，防止以后把 Host 服务存在当成「安全真实停工已经运行」。这不解决 #80 普通消息及附件的无损 Host pre-submit hold，也不修复 Codex 多进程 Goal 竞争，1.0 仍 **NO-GO**。

## 合并判定

本候选现已包括低冲突链、#176 工会总部整合以及 #161–#163 安全内容收敛；**#136 的自建 Windows 生产账本明确不移植**。正式原生 Host×OS、通用人类输入与附件原子拒绝/恢复、Codex 多进程 Goal 和真人辅助功能仍未放行；它不是 1.0 集成/发布签收。不得将绿色 Node CI 或测试脚本误写为 Windows NTFS、全部宿主原生真实停工、人工无障碍签收或真实 AI 集体表决。不得伪造授权或绕过发布闸门。保持 `npm run release:gate` **NO-GO**。
