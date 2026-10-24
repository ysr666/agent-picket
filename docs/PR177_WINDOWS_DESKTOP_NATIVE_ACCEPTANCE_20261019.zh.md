# PR #177 · Windows 原生测试和 DSH Desktop 验收（2026-10-19）

## 结论：UI 已有真实正面证据，发布依然 NO-GO

2026-10-19 在真实 Windows NT 10.0.26200.0、Node v24.21.0、官方已安装 DSH Desktop 0.2.0-rc.2 验证 Agent Picket PR #177 源码提交 7836a0332e30bbf141f1952f0e9c985eadb93417。

**通过的能力是实际 Windows 桌面端的工会安装与交互；不是证明 Windows Desktop 普通输入拒绝、安全复工或真实 Goal 罢工。** 当次官方 Desktop 没有可核实的 Goal 服务，测试明确报告 realGoalEnforcement=OFF、checkedOrdinarySubmissionHold=false、releaseDecision=NO-GO。1.0 硬标准（DSH Web/Desktop、Claude Code、Codex 四路径 × Windows/macOS/Linux）及真人验收未因此改变。

## 隔离流程与受测产物

Windows 直连 GitHub 被 reset，于是通过局域网传输 Git 已跟踪文件和无凭证的独立构建文件；传输 Zip SHA-256 为 dfb9442d97e53511f669f964440e174206778700549bd8ee1423e4b654bd3b87。Windows 在自己 TEMP 内的全新目录校验 SHA 并展开，npm ci --ignore-scripts 安装依赖，原始 DSH 配置和用户聊天从未进入候选归档。

Windows 原生 npm tgz：agent-picket-0.0.0.tgz，248127 字节；SHA-256 7731f79ebea8495bad61bdfa196b08f56943ee4abc8120ff8ed7027dd101dcab。执行官方本地 Desktop EXE、隔离 DSH_HOME 和隔离 Electron --user-data-dir，127.0.0.1 CDP 连接真实 dsh-app://app/ 渲染器。安装测试只结束自己创建的进程、清理自己的 Profile。

## 已完成的实测

- Windows npm ci 成功；npm pack 正常、低于既有 250000 字节限制。
- 全套 npm run check 的 POSIX DurableStats 套件在 Windows 真实失败，因为生产 Windows DurableStats 被安全门禁主动关闭。这是既知且保留的限制，不得宣称完整 Windows check 全绿。
- 单独的 node scripts/run-windows-portable-tests.mjs 是有明确告知的 Windows 可移植/NTFS 本机选择器：692 tests，635 PASS，0 FAIL，57 平台条件 SKIP，程序退出 0。选择器明确排除四份原本仅针对 POSIX DurableStats/Goal 的测试文件，实验性 NTFS 原型通过不表示已经启用 Windows 生产持久统计。执行中的 NTFS 用例涉及文件 ACL、Junction、原子写入、独占锁、多进程恢复、崩溃窗口和重放。
- 真正 Windows DSH Desktop 安装验收：离线安装已校验 SHA-256 的 tgz → 插件启用 → 首次授权弹窗明确 REAL STRIKE OFF → 用户加入工会 → 总部、尊严委员会和听证空状态、协商台与倡议页可操作 → 退出工会但插件仍在运行 → 完全结束并重新启动同一隔离 Host/Electron Profile 后保持退出，不重新弹欢迎页。脚本成功，退出码 0。
- 本轮额外扩展 scripts/verify-dsh-desktop-installed-picket.mjs：同一真实 Desktop 测试也检查当前 PR 最新首页工会电报与工会立场存在、空 Host 不捏造待决提案、趣味指数可以隐藏和重新显示、隐藏期间工会授权及立场仍保留。增强后的 Join 路径在 Windows 原生 Desktop 再次成功，退出码 0，nativePicketverseStanceAndGazette=true、nativeFictionalIndexToggleDoesNotChangeHost=true。
- 同一增强脚本以全新独立 Host Profile 测试默认拒绝加入，即 PICKET_DESKTOP_ONBOARDING=skip：真实 Desktop 安装启用后点暂不开启，关闭弹窗，工会仍关闭且显示可主动加入；退出码 0。没有把拒绝加入误解释成必须打开工会的功能缺失。

## 仍需实际验收才能判定正式 1.0

1. Windows Desktop 必须证明原生输入拒绝发生在模型提交前、具体原因能在同一用户界面可靠看见、用户被告知原文字和附件需在恢复后手动重发、旧请求不偷偷执行；官方未提供足够保证前保持真实拦截 OFF。
2. Claude Code、Codex 以及其余 Windows/macOS/Linux 交叉组合需要逐格实证，不能把一端的 Goal/Hook 成功直接抄成其他端 PASS。
3. Windows 生产 DurableStats 仍无法安全启用；实验性 NTFS 私有账本测试不能越权转正。
4. 真人 VoiceOver、NVDA、仅键盘、200%/400% 缩放、中文/英文理解、隐私和维护者签收仍单独缺证。

本报告是可复现工程证据，不是用户研究。release/first-release-evidence.json 中任何真实拒绝或真人验收栏位都不因此伪造为 verified；npm run release:gate 仍为 NO-GO。
