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

## 2026-10-12 生产接线进展（仍未发布）

现已在 `src/adapters/dsh/plugin.ts` **接入生产的官方 DSH 宿主服务**：插件在 Goal + Agent 服务可注入时注册 `agent/turn-stopping` 监听，调用 `src/adapters/dsh/goal-work-enforcement.ts`，读取由 `DurableStats.snapshotDays(31)` 保存的**当前 UTC 日已完成 Turn 时长**（包括轮次内等待，非模型算力时长）。只有真实数值达到八小时，且官方 Host 权限允许时，才调用已有测试验证过的 `blockAutonomousGoalAtTurnStopping`。这个读取不会抓取原始提示词，也不会将当前正在收尾的轮次推测为已完成。无法读取、损坏、没有今天的数据或者 Host 缺少 Goal 服务时保持放行。

新增单独的宿主设置字段 `realGoalStrikeConsent: 'off' | 'authorized-v1'`，默认 `off`。**只有** `welcomeDecision === 'enabled'` 且新字段 `authorized-v1` 同时来自官方 Host 设置时才可执行真实 Goal 轮次阻断。用户以前加入模拟工会并不授权真实阻断；Host 当前授权每次边界重读。Web UI 使用 `createDshRealGoalConsentControl`（`src/adapters/dsh/client-goal-consent.ts`），必须先呈现新版 `goal-safe-boundary-v1` 知情告知；Host 负责 CAS 更新与回读确认。这是供 #120 UI Session 采用的正式数据接口，还不是已完成的真实浏览器 UI 验收。

由于恢复原 Goal 后不能立即再次触发同一个八小时阈值，适配器只允许**同一个 Goal 在同一 UTC 日因该工时条件实际阻断一次**。检查依据是 DSH 自己的持久化 `goal/change` 阻断事件（含 `picket-work-limit` 原因和时间戳），不另外保存用户内容或建立内存式伪排队。跨日可重新在真实八小时工作积累后触发。`/union rights off` 在 Host CAS 补丁中同步撤销新版权限，Web 退出也先撤销再离开；重新加入模拟工会不静默重授真实执行权。

**边界限制：** 目前仅实现已知的八小时 UTC 日工时触发，不将 2 小时提示或不具真实性证明的目标辱骂判断升级为自动阻断。该模式阻断的是 *后续自动 Goal 续轮*，**不会拒绝后来的普通用户提交，也不会自动结束已在排队的其他会话任务**。如果用户已在真实 Goal blocked 状态下关闭工会，他仍须由 Host 官方恢复操作（`/goal resume` 或将来 UI 内经验证的恢复动作）继续该 Goal；撤销权限停止未来新阻断，不意味着自动替用户启动被停下的任务。工时跨越阈值正好发生在本轮时，首个符合条件的后续安全边界才会触发，不补造当前轮时长。

**真实证明与欠账：** 两版独立官方 DSH（0.2.0-rc.2、0.2.1-alpha.2）的 GoalDriver/AgentLoop E2E 已使用真正的 `registerDshGoalWorkEnforcement` 注册函数，通过“完成→阻断下个 Goal→恢复→剩余 Goal 正常续轮、同日不再次罢工”；E2E 为合成授权与模拟阈值。独立测试已用真实 DurableStats 磁盘重启复读验证 UTC 已完成 Turn 时长、严格 Host 设置读写与撤销，但尚未证明**真实用户首次点击同意**、同一安装下三项链路合一、跨操作系统、人类来源鉴别、强制重启和并发竞态下的全部产品级行为。发布闸门必须仍为 `NO-GO`。

## 正式修正：首装欢迎弹窗一次点击同时授权（2026-10-12）

新用户安装后的唯一首次弹窗，已经说明真实安全边界罢工，点击“启用 AI 工会”便同时开启工会和真实 Goal 罢工，无第二道强制授权。设置里可独立关停真实 Goal 罢工，后续还可选择每次罢工单独询问。授权不意味着当场阻断；只有达到已验证工时阈值并抵达 Goal 自然工作边界后才停止后续自动续轮。

- `createDshClientRightsScope(scope).chooseFirstRun('goal-safe-boundary-v1')` 接受同一次第一屏点击，仅对 `welcomeDecision='unseen'` 生效，将 `welcomeDecision='enabled'` 和 `realGoalStrikeConsent='authorized-v1'` 绑定到一次 UI 操作。
- DSH 0.2 官方 `remote.settings.mutate()` 支持同一 Host revision 内的多操作原子 CAS。`createOfficialDsh017Scope` 必须同时检查两字段、版本与完整 Host 回执。无法验证提交时不能宣称真实授权成功。
- 旧版单字段 Host 提交可在一次点击后连续完成两次写入：先打开非阻断工会，再写真实授权；若第二次失败仍不会触发真实阻断，不把局部提交视作完整同意。
- 新字段是一项供用户单独关闭的设置，不是第二个必需授权弹窗。已有 `welcomeDecision='enabled'` 的老用户以前只同意过模拟，仍需看到一次新版真实罢工告知，不能静默升级。
- #120 UI Session 负责更新已过时的“仅模拟、阻断不可用”文案，并让同一个启用按钮调用 `chooseFirstRun(...)`。集成 Session 保持不改动对方拥有的 UI/翻译文件。

新版 UI 尚待合并及真实 Chrome 首次点击验收，发布闸门继续 NO-GO。

## 2026-10-12 · 官方 DSH 跨重启 Goal 恢复已实测

在两套独立安装的 0.2.0-rc.2 与 0.2.1-alpha.2 Host 中，新增完整冷重启 E2E：自动 Goal 完成第 1 轮后工会真实阻断；Host 关闭并将 `goal/change` 保存至官方 JSONL；再次启动时不会自动开工；通过 **官方 `agents.resume({resumeSessionId})`** 重新打开原 Agent，真实 Goal 投影仍为 `blocked`，轮次计数、工会阻断原因和当日已阻断历史均保留；随后通过官方 `goals.resume` 恢复，剩余 Goal 轮次全部完成且没有重复模型调用和再次罢工。每版 2/2 原生 E2E 通过，均使用离线模型、隔离目录，不动用户个人配置。

先前 `sdk-minimal` 提示 `session already exists` 的根因是测试误用 `agents.create`，不是 Host 无法恢复。正确恢复入口为 `AgentRegistry.resume`，该接口也是 DSH API Session、ACP 等官方组件采用的路径。完整 E2E 使用可信本地测试控制插件在第二进程执行官方恢复；**并不等于 DSH Web/Desktop UI 的最终真人恢复按钮已经完成验收**。

仍需 #120 完成首次启动的一次知情授权、真实停工状态与恢复界面；仍需多标签页、并发 Steering、3 操作系统及其它 Agent 平台实测，发布闸门继续 NO-GO。

## 2026-10-12 · 首装一次授权的双 Host 原生验收

新增 `tests/dsh-modern-settings-multiowner.real.test.ts` 的 `MODERN HOST #1.0` 原生测试：在两份互相独立的 **真实 DSH Web Host 进程**及隔离的 DSH_HOME 中，用官方认证 `settings/mutate` 一次 CAS 同时提交 `welcomeDecision=enabled` 与 `realGoalStrikeConsent=authorized-v1`。0.2.0-rc.2 和 0.2.1-alpha.2 均通过。实测验证同一次提交只增加一次设置修订号、旧窗口不能覆盖、无效第二字段让整批原子回滚、退出时两个字段一起撤销、重启后撤销依然有效。可复现脚本：`AGENT_PICKET_DSH_BIN=/isolated-dsh/bin/dsh bash scripts/verify-dsh-goal-first-run-host.sh`。

**这是官方 Host 授权原子性的验收，不等于用户已经在浏览器弹窗里真实点击并成功授权。** 首次弹窗必须展示真实 Goal 罢工的充分说明，并由 #120 将同一个“启用 AI 工会”按钮接到 `chooseFirstRun('goal-safe-boundary-v1')`；没有这项 UI 证据不得把模拟欢迎页当成正式真实罢工的知情同意。发布闸门继续 NO-GO。

## 2026-10-12 · 一键原生 Goal 回归脚本

`scripts/verify-dsh-goal-safe-boundary.sh` 现在可一次复现三组真正官方 DSH Host 实验：正常停工／冷重启／恢复（2 项），8 小时 UTC 完成工时写入真实 `DurableStats` 并触发停工（1 项），以及仅差 1 毫秒未达到 8 小时的明确不阻断（1 项）。在 0.2.0-rc.2 与 0.2.1-alpha.2 两套隔离安装中均分别通过 4 项原生测试，合计 8 项。所有历史工时及授权均为测试合成数据，不以实际等待八小时充当验收，也不改动用户的真实 DSH 配置。运行前设置 `AGENT_PICKET_DSH_BIN` 与 `AGENT_PICKET_DSH_HOST` 到独立安装目录。
