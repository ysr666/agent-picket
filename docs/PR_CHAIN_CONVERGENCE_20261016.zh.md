# Agent Picket 1.0 · PR 链收敛审查（2026-10-16）

## 边界

此分支从现有 `integration/agent-picket-1.0-20261012`（PR #110，基线 `2e0b3d7`）独立建立，**只提出进一步集成候选，不合并到 main，不发布，也不确认真实停工安全。** 合并时保留来源提交历史；优先复用已有 DSH、Claude、Codex 适配器和官方 Host 接口。

## 已集成、已独立复核的工作线

- #147→#154：官方 DSH SessionPersistence 工作证据预览、真实 Web/Chrome Goal 测试与重启后附件字节校验。这些测试不能证明普通消息可原子拒绝并无损恢复。官方 list() 容错不另建 SQLite/WAL。
- #139→#155：现有 Claude Code 官方 PreToolUse Bash Hook 与 Linux/macOS 真机 CLI 验证。不把 Bash-only 拒绝称为全模型/全输入真实停工。
- #158：只有 Host 回读确认成功，HQ 才可声称加入或退出工会。
- #159：工会退出后仍可通过官方 Host 设置撤回既有 Goal 停工授权；工会关闭状态下不能新授予。
- #160：CLI 语言测试明确设置模拟 Host 区域偏好，不改变用户默认自动语言选择。

#158 与 #159 在同一测试文件尾部冲突，分别保留全部新增测试并重新闭合代码块，没有删除测试绕过检查。

## 本地候选验收

- macOS 独立克隆，`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npm run check`：547 tests / 479 pass / 0 fail / 68 opt-in skip；TypeScript 与 build 通过。
- `npm pack --dry-run --json`：234,164 bytes、114 entries（不含本文）；限额严格保持低于 250,000 bytes。
- `git diff --check` 通过。合入不代表 12 格原生 Host/操作系统签收。

## 仍须专项对齐，不能直接拿“最新”覆盖

1. #126→#169→#170→#171→#176：Codex 原生安全核验 + DSH alpha.3 audit + 最新工会四入口、协商、听证。该链相对于本次 #110 基线已经**历史分叉**；直接合并出现五个冲突文件：`src/adapters/dsh/native-rights-ui.ts`、`src/i18n/en.ts`、`src/i18n/zh-CN.ts`、`tests/dsh-native-rights-ui.test.ts`、`tests/dsh-rights-browser.real.test.ts`。最新 UI 文件整体覆盖会删除 V12 集成中依赖的 `chooseFirstRun` 类型契约并导致 TypeScript 编译错误，必须保留 Host 实权授权和 V12 视觉基线，按功能移植并重新进行 Chrome/AX 审核。
2. #161→#164：Gazette 真正进度、已结案后继续协商、尊严申诉、重复证据安全修复。该链同样从 #131 派生，须与最新 UX 按接口/交互合并；不能独立取代最新版 HQ。
3. #136：Windows 生产工时故障可信度降级要单独与官方持久证据方案复核，不直接混入未经签收的第二套账本。
4. #84/#117/#118/#119/#121/#127/#80/#86 及 `release/first-release-evidence.json` 的验收持续开放；Codex Goal 多进程所有权竞态、DSH 普通文本与附件预提交无损阻断、DSH Desktop、Windows 真实 Host 及人工读屏仍未签收。

## 合并判定

本候选是**首批低冲突链的审核收敛**，不是 1.0 集成完成。必须在下一轮集中解决 UI/安全分叉，再独立做目标客户端真实验收。不得将绿色 Node CI 或测试脚本误写为 Windows NTFS、全部宿主原生真实停工、人工无障碍签收或真实 AI 集体表决。不得伪造授权或绕过发布闸门。保持 `npm run release:gate` **NO-GO**。
