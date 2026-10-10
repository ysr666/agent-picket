# DSH 0.2 工会权益真实 Chrome / AX 验收 — 官方插件安装

> 2026-10-10，实验 Draft。这里的 **Chrome Accessibility Tree、键盘焦点、样式、窄屏与状态持久化测试属于自动化**；不等于人工 VoiceOver、NVDA、Windows 系统高对比度或真实浏览器 200%/400% 缩放认证。

## 为什么之前的两条 0.2 E2E 没通过？

原来的 `tests/dsh-rights-browser.real.test.ts` 用 DSH 0.1.x 时代的 `--patch` 路径运行，并强制假设启动后一定出现 Agent Picket 欢迎窗。对于全新 DSH 0.2：

1. 没有已验证的非空 Session 时，**Agent Picket 不应凭空出现主动首次邀请**；侧栏仍然可以通过用户真实操作打开，权益模拟必须默认 OFF。
2. 单纯 `--patch` 虽能在某些环境中显示 Union 侧栏，却没有提供与当前 Web 插件一致的**可写 Host Settings**。测试在“支持 AI 权益 / Enable Simulation”按钮缺失时失败，不能据此认定按钮对比度或键盘焦点不合格。
3. 权限必须通过 **官方 DSH `plugin --profile web add`** 在隔离 `DSH_HOME` 安装后才能进行完整的可写授权、跨标签、Host 重启及 Host CAS 测试；不能从测试脚本伪造 `welcomeDecision` 或使用非官方 RPC 写入代替 UI。

此判断来源于对现有 DSH 0.2 的本机源码/编译包以及真实 Chrome 两种启动路径的比较。**不声称所有未来 DSH 版本禁止使用 `--patch`**，只说明本项目当前权益端到端合同必须使用已验证的官方安装路径。

## 自动化脚本

仓库根目录已构建依赖、单独安装了目标版本 DSH、Playwright Core 和 Chrome 后：

```bash
export AGENT_PICKET_DSH_BIN=/absolute/path/to/dsh/node_modules/.bin/dsh
export AGENT_PICKET_DSH_HOST=/absolute/path/to/dsh/node_modules
export AGENT_PICKET_PLAYWRIGHT_ENTRY=/absolute/path/to/playwright-core/index.mjs
export AGENT_PICKET_CHROME_BIN=/absolute/path/to/Google-Chrome
bash scripts/verify-dsh-rights-a11y.sh
```

- **DSH 0.1.x** 保留既有 `--patch` 的真实 Chrome 源码构建与离线包测试。
- **DSH 0.2.x** 由脚本构建编译包和私有 npm tarball，在**两份各自新建的 Profile** 中分别通过官方 DSH CLI 安装，运行 `source`（来自当前本地源码的编译打包产物）与 `OFFLINE INSTALLED`（另附 npm 离线安装验证）两组完整 E2E。二者**都使用正式 Host 插件安装**，不存在绕开 Host Settings 的手工注入。
- 浏览器只允许回环 HTTP(S)，不会联系真实模型，也不复用用户正式 `DSH_HOME`。默认数据仅是临时测试目录中的模拟协议和统计数据。
- 每个测试都要真实点击 UI 启用后再做申诉/模拟还价/协议、关闭重新打开、跨标签、Host 重启及官方 Host CAS 负向测试。测试会检查 Chrome AX Tree、命名对话框、焦点、CSS reflow 与 forced-colors 模拟。
- **全量失败如实计数**：每个 Flavor 的安装、构建、E2E 是否失败单独写入日志，任何一次失败都让脚本返回非零。输出的日志保存在独立临时路径，不应分享带真实身份的日志；UI 检查不得采集 prompt、凭据或原始 Session ID。

## 真实版本验收记录

| DSH | 加载方式 | 结果 | 结论 |
|---|---|---|---|
| **0.1.2-rc.1** | 旧版 `--patch` 源码构建+离线安装 | **2/2 通过**（之前和本次旧版回归） | 旧版真实 Chrome AX/焦点/布局继续有效 |
| **0.2.0-rc.2** | 旧 `--patch` | 历史 **0/2**，未到 AX 检查 | 因 Host 权益不可写/首次邀请假设错，**不能算无障碍失败** |
| **0.2.0-rc.2** | 官方全新 Web Profile 安装 | **2/2 通过** | 真实 Chrome AX/布局/权益与持久化联动通过 |
| **0.2.1-alpha.2** | 官方全新 Web Profile 安装 | **2/2 通过** | 同上；当前测试样本有限 |

完整命令和各 Flavor 的 PASS/FAIL 由本脚本负责，表格只记录本轮有限样本。**不要将 2/2 自动化通过写成已完成无障碍认证。**

## 仍然没有完成

本地 [人工无障碍验收表](HUMAN_ACCESSIBILITY_SIGNOFF.zh.md) A1–A8 继续全部 **PENDING**：真人 macOS VoiceOver Safari/Chrome、Windows NVDA Chrome/Edge、浏览器实际 200%/400% 放大、Windows OS High Contrast、语言与断连时的可理解性测试。插件总发布链 #23 及 #69 的整合授权仍未完成；不得合并 `main`、公开发布 npm 或引入真实 Agent 阻断。
