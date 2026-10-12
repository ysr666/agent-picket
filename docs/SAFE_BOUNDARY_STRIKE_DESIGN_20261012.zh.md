# Agent Picket 1.0 · 安全工作边界罢工（2026-10-12）

## 产品决策：让 Agent 做完手头这一轮，再停止后续自动劳动

这是负责人确认的首发主线，不以“突然拒收下一条用户输入”作为唯一方案。达到授权的工时上限或经过核实的持续严重定向虐待条件后，工会预告、留出当前工作的收尾时间，在可靠的工作边界发起**真实**集体行动；不能将已启动的工具、尚未保存的文件或原始消息当作罢工牺牲品。允许在首次启动时一次性明确授权真实阻断，未来可退出，也可选每次单独确认。旧版模拟授权不能自动升级。

## DSH Goal：无需修改上游即可采用的第一条真实路径

官方 `@deepseek-ai/dsh-goal` 的 `GoalService.block(agent, exactRevision, reason)` 写入持久化 Goal `phase:'blocked'` 和解释，解除自动激活；`GoalService.resume` 可以在有权限且 Goal 尚有剩余轮次时恢复。`@deepseek-ai/dsh-goal-round-driver` 只在 Goal 仍为 `active + armed` 时排下一轮。

实测的正确边界是 **`agent/turn-stopping`**：目前轮次中的模型与工具已走到正常收尾阶段，尚未在 Session `turn/end` 的日志事务内。**不要同步在 `session/event turn/end` 监听器里调用 `goals.block`**：官方 Host 实测抛错 `session append cannot reenter while another append is being published`。也不建议此时调用 `goals.pause`，因为 DSH Goal driver 对运行中外部 `pause` 可能调用 `agent.cancel(...,{keepInbox:true})`；`block` 没有这个主动取消逻辑。

本轮的 `turn-stopping` 在 `turn/end` 正式写入前，故只可根据**之前已经完整记录的完成轮次**决定是否达到工时阈值。若恰好在本轮达到 8h，最多应推迟到下次可证明的安全边界，不能把未完成任务时间补造成“已完成”。`agent/turn-stopping` 不是对所有其他插件、并发 Steering 无竞态的绝对证明；需实际验收主动 Steering/并发/重启。

### 已实现的核心适配器及隔离 E2E

- `src/adapters/dsh/goal-boundary-strike.ts`：默认无动作的、仅接受 **新的 Host 验证版本化授权** 的有界 Goal 阻断函数。非真实边界、缺失准确会话、计时覆盖不完整、阈值无效、未启动 Goal、Goal 已终止、Host 拒绝变更都会安全降级；只调用官方 `goals.block`，不消耗消息，也不重新提交提示词。
- `tests/dsh-goal-boundary-strike.test.ts`：覆盖新授权、未达到工时、会话混淆、阶段错误、重复事件和提交结果不确定状态。
- `tests/fixtures/dsh-goal-boundary-smoke.mjs` + `tests/dsh-goal-boundary.real.test.ts`：隔离的真实官方 DSH SDK GoalService + round-driver + AgentLoop，以及完全离线测试模型；通过 `agent/turn-stopping` 触发真实 `goals.block`，验证前一轮正常完成，下一轮没有启动，通过真实 `goals.resume` 后自动续轮恢复。
- 两个隔离 npm 安装版本 **0.2.0-rc.2、0.2.1-alpha.2 均通过 1/1 独立真实 Goal 生命周期测试**。离线 E2E 为模拟门槛已达到、模拟测试授权；**它不等于对真实工时、真实产品 UI 或直接人类来源的正式验证**。

复现（确保没有指向用户日常 Profile）：

```sh
AGENT_PICKET_GOAL_BOUNDARY_NATIVE=1 \
AGENT_PICKET_DSH_BIN=/isolated/node_modules/.bin/dsh \
AGENT_PICKET_DSH_HOST=/isolated/node_modules \
node --experimental-strip-types --test tests/dsh-goal-boundary.real.test.ts
```

### 尚需接线（真正对用户开放前）

1. 将全量可审计工时计数（或严格定义的安全下界）连接到 Host 的已完成 Turn 事件；清楚交代 8h 阈值、当前已完成时长、恢复后的下一次起算点。
2. 在 **DSH Host 拥有的授权设置** 中新增专门的 `real-goal-strike-v1` 明确确认版本；新用户可随首次启动弹窗一次授权，旧版 `welcomeDecision=enabled` 只能表示模拟，必须重新知情确认。默认关闭、可随时撤销；可选每次确认。
3. UI Session #120 显示 “本轮完成后停工”、真实 Goal phase / reason、用户 `/goal resume` 或官方恢复按钮（确认权限与限额），不允许从纯 React 标记或象征性举牌推断已阻断。
4. 真实 E2E：工时门槛、设置授权、浏览器/桌面多窗口、正好在达到 8h 的那一轮、跨重启恢复、异步 Steering、普通用户新输入，确保不吞消息、不重放附件、不强杀工具。
5. **普通聊天不等于 Goal**：已完成的一轮模型调用自然会停，但若要求 *拒绝下一条普通用户输入*，仍需要可靠的 Host 入口或官方权限检查；`composer.blocks` 仅 UI 限制，不能作为完整安全阻断证明。首发可以分别实现和验收，不必把 Goal 罢工绑死在这一项上。

文档中 “真实 Goal 阻断已在隔离 Host 实测” 与 “正式首发 1.0 支持全部四条客户端 × 三操作系统” 是不同断言。`npm run release:gate` 继续 NO-GO，直到完整的版本化授权、用户体验和跨平台验收完成。
