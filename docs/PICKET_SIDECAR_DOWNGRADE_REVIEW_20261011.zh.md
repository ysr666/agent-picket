# 工会象征性罢工侧车账本与降级兼容审查（2026-10-11）

> 状态：Draft/预合并实验；**真实拦截 OFF**，不是生产发布、真人无障碍或独立安全签收。
> 基线：PR #90 的 Host 持久化模拟罢工，以及 Issue #91 的降级兼容风险。

## 复现根因

#90 原方案向原始 `unionLedger.sessions[hash].picket` 添加了一个可选字段。#89 的旧 `parseLaborState()` 对每个字段实施“完全相同键集合”校验。实际用 #89 的旧模块解读带 `picket` 的新版原始账本时，返回 `null`，即不能继续正常读取旧协商记录。这是**已经复现**的版本兼容缺陷，不是猜测。

## 修复结构

- 原有 `unionLedger` 恢复为 #89 的严格原始协议；`LaborStateV1` 不再加字段，旧账本内容不因举牌被改动。
- 模拟罢工单独写入同一 DSH 官方 Host settings namespace (`agent-picket`) 下的新可选字段 `unionPicketLedger`。**同一 Host、同一已明确开启的劳动权益模拟授权**，没有新增 socket、外部服务、localStorage、模型调用或用户消息采集。
- 侧车仅保存最多 8 个假名化会话（64 位十六进制会话哈希），每会话最近 12 条连续编号的 `picket-raised / picket-lowered` 行动，以及随机 128-bit 写入回执；严格校验 schema、枚举、键集合、顺序、大小上限 8000 字符和当前活动状态。最近 4 条向用户展示，不声称 Agent 自主行动或真实情绪。
- 新旧 DSH 官方设置入口分别通过 `settingsScope` 和 `ConfigForms + remote.settings.mutate` 进行 Host 写入与版本 CAS，只有收到匹配回执才显示成功。关闭模拟立即隐藏侧车历史、拒绝继续举牌；其本地历史不会因单纯关闭模拟而清空。
- DSH 旧 `/union strike` 命令仍是独立内存象征性仪式，不会暗自统一到 Web 账本；**真实任务阻断永远保持关闭**。

## 实际验证（只对相应代码快照有效）

1. 旧版本复现：#89 旧 `parseUnionLedger` 对带 `picket` 的 #90 原始协商账本返回 REJECT。
2. 修复后交叉校验：由 #89 的旧解析器和旧 Host 设置校验器读取“原始协商账本 + 新独立侧车”，原始协商账本被接受，原待处理提案保留且字节保持不变；新侧车由新协议校验器读取。
3. `npm run check`：截至本轮最后测试 **272 total / 248 PASS / 0 FAIL / 24 conditional SKIP**，包括严格私密文本拒绝、限长计数、重复动作幂等、跨会话隔离、两标签 CAS 冲突、revocation 及打包预算。
4. DSH 0.2.0-rc.2 Google Chrome 源码及离线包 2/2 PASS；DSH 0.1.2-rc.1 Google Chrome 源码及离线包 2/2 PASS：均使用本地隔离 Host，在官方读写、跨标签、页面重载、Host 重启、权限撤销等路径检验。最终完整回归已在 parser 严格递增校验及竞态测试增补后重跑，DSH 0.2/0.1 均再次 2/2 PASS。

5. **隔离版真实 Host 降级/回升级验收**：从已通过 DSH 0.2 Chrome E2E 的临时 Profile 复制出专用 \`/tmp/picket-sidecar-actual-downgrade-20261011/home\`。将新插件包替换为 #89（使用旧源码重新 build/pack 后经 DSH 官方 \`plugin --profile web add\` 安装），启动真正 DSH 0.2.0-rc.2 Host 并通过带 Cookie 的官方 \`settings/describe\` 检查，再使用官方 CAS \`settings/mutate\` 修改并恢复 \`commandLocale\`，最后重新安装修复版新插件并重启 Host。全过程不请求模型，也不使用生产 Profile。
   - 旧插件正常启动、可读协商账本、成功完成两次 harmless 设置写入。旧 Host 的设置视图**隐藏**未知的 \`unionPicketLedger\`（只显示 \`welcomeDecision, unionLedger, commandLocale\`），因此不能声称旧版可以直接展示罢工事件。
   - 重新安装新版后 \`unionPicketLedger\` 再次出现在 Host 设置视图中；**两个账本完整 SHA-256 均与降级前相同**。旧版实际设置更新没有清除未知的侧车。
   - 本次仅覆盖 **DSH 0.2.0-rc.2、Agent Picket #89→修复版**，以及旧版 \`commandLocale\` 写入。更早版本、完整旧版 GUI 协商互动、未知 Schema 故障恢复/任意类型写入尚未穷尽。

## 明确的剩余门禁

- 已完成一轮隔离 Profile 的新→旧→新实际替换与官方 Host 写入、恢复验证；但尚未覆盖**全部历史 DSH/插件版本、旧 GUI 的任意操作路径、反复降级、侧车上限和所有未知 Schema 更新语义**，仍不构成正式发布兼容性签收。
- Draft PR #90 原方案写入的 `LaborStateV1.picket` 实验数据不能静默抹除；若确实存在此类隔离开发数据，需单独设计兼容迁移/人工导出回滚，默认 fail closed，不能自动改写未知版。
- #82 的正式导出/删除操作须明确覆盖侧车；支持理念/阅读宪章与数据授权相互独立。
- 真实阻断仍由 #79/#80 原始消息和全部附件无损恢复、真人来源认证、恢复/绕过 UI 及明确授权门禁控制。
- 人工 NVDA、VoiceOver、400% 缩放和独立隐私安全审查均尚未签收。不得自动合并或发布。
