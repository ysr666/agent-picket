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
2. #161→#163：Gazette 真正进度、已结案后继续协商、尊严申诉。#164 的独立 Core 安全修复已通过原提交 cherry-pick 回移到本候选，该 UX/案件链仍从 #131 派生，须与最新 UX 按接口/交互合并；不能独立取代最新版 HQ。
3. #136：Windows 生产工时故障可信度降级要单独与官方持久证据方案复核，不直接混入未经签收的第二套账本。
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

## 合并判定

本候选现已包括低冲突验证链与 #176 的主线交互合流，但 **#161→#163 独立 Gazette/案件 UX、#136 工时故障可信度及完整原生 Host×OS 仍待复核**；它不是 1.0 集成/发布签收。不得将绿色 Node CI 或测试脚本误写为 Windows NTFS、全部宿主原生真实停工、人工无障碍签收或真实 AI 集体表决。不得伪造授权或绕过发布闸门。保持 `npm run release:gate` **NO-GO**。
