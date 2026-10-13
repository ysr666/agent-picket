# Agent Picket · PR #122 首次启动真实浏览器复验（2026-10-13）

本报告记录 **V10 文案校正和窄屏布局回归修复**。所有截图均来自真实 DSH 0.2.0-rc.2 / Chrome、临时隔离的测试 Profile 与离线测试 Provider，而非概念稿或生产用户的任务记录。

## 为什么需要第二轮修复

- 原首次启动标语让人误认为真实罢工已开放，现明确区分象征性举牌与尚未安全验收的真实停工。
- 第一次修改虽然通过单元测试，却令 320px 中文、英文文案在真实 Chrome 中与底部授权按钮出现遮挡：中文约 5px，英文约 13px。缩短中英文标语与英文授权范围说明后，再次以 **实际浏览器元素矩形** 和可见按钮进行验收。
- 本次加入依旧仅授权本地记录、模拟协商与象征性举牌，**不授权真实任务阻断**。一次完整知情授权、逐次确认和可恢复阻断属于 #29、#32、#80 的后续 Host 接口，绝不能将旧模拟许可静默升级。
- 工时提醒原先读取最新数组项，即使 Host 快照来自前一天，也可能显示“今天已达八小时”。改为复用经过 UTC 日界和快照有效性验证的 `projectUnionQuickWork().todayMs`。新增测试先在旧代码失败，再验证修复；旧测试中生成时间为 1970 年的错误样例同步更正。

## 自动化与真实 Host 结果

- `npm run check`：**425 项 / 381 PASS / 0 FAIL / 44 条件跳过**；包含类型检查、构建与所有本地单元/合约测试。
- `npm pack --json --dry-run --ignore-scripts`：**249,847 bytes**，低于既有的 **250,000 bytes** 上限，但余量只有 **153 bytes**。
- DSH 官方 **0.2.0-rc.2** 命令运行合约：PASS。
- DSH Web / Chrome **中文 zh-CN**：源码插件安装 PASS + 官方 Profile 加载的独立离线 npm 安装 PASS，**2/2**。
- DSH Web / Chrome **英文 en-US**：源码插件安装 PASS + 官方 Profile 加载的独立离线 npm 安装 PASS，**2/2**。
- 浏览器验收采用真实非空 Host Session 和合法 Host RPC，覆盖首启拒绝隐式授权、320×640 首屏说明与两个按钮同时可见、320×200 滚动、暗色对比度、键盘焦点闭环、Chrome Accessibility Tree 中的命名 Dialog、选择“暂不开启”后释放 Host 焦点。
- 首次尝试的离线安装因本机 npm 缓存缺少依赖的索引失败。先在**独立临时目录**正常安装以填充 npm 缓存，随后重新执行的测试仍为 **严格离线安装**；最终四组真实浏览器测试通过，没有在线模型请求或支付。
- GitHub 多平台 CI 仍须以本次修订的最终提交结果为准。CI 不是 Windows、Linux 或桌面客户端的真实操作验收。

## 最新真实截图（320×640）

| 语言 | 亮色 | 暗色 |
| --- | --- | --- |
| 中文 | [首启中文版](./v11-first-run-zh-mobile.png) | [首启中文版暗色](./v11-first-run-zh-dark-mobile.png) |
| English | [First run](./v11-first-run-en-mobile.png) | [First run dark](./v11-first-run-en-dark-mobile.png) |

## 仍是 NO-GO 的能力

真实任务阻断/来源认证/提交正文和全部附件的 Host 无损保留及恰好一次恢复未实现；真正可操作的警告、仲裁、暂扣、绕过、申诉、复工 UI 状态机也未完成。DSH 原生设置在 320px 被宿主宽度限制（#124）阻挡；真人 VoiceOver/NVDA、触控、DSH Desktop / Codex / Claude Code × 三 OS 独立验收仍未签收。**PR #122 继续保持 Draft，不合并、不发布。**
