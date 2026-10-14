# DSH 已发布 JSONL provider 原生冷读取专项（2026-10-14）

## 可验证结论与边界

- 交接基线：Agent Picket integration/agent-picket-1.0-20261012@2e0b3d7；#144@08e267a 属于接口替身投影测试，不是官方已发布 provider 的原生执行。
- 官方 DSH dsh-v0.2.0-rc.2 的 packages/bundle/base/cordis.patch.yml 默认插入 `session-persistence-jsonl` 行，根目录为 `dshHomePath('sessions')`，且 packages/bundle/base/package.json 实际依赖同版本 provider。Web 基于该 base，但用户 Profile 或自定义组合可覆盖 / 禁用该服务。
- 官方 packages/goal/goal-round-driver/src/index.ts 的 drive() 在 needsCheckpoint 时先 await ctx.sessions.flush(agent.session)，再要求 goal.phase==='active' / activation==='armed' 后发出新 round；packages/core/agent-loop/src/agent.ts 的 agent/turn-stopping 发生在 turn/end 之前。**这使得后续模型执行前的 official pre-step / checkpoint 调度检查值得优先实证研究，而非在 turn-stopping 前虚构当前已完成工时。**

## 本 PR 增量验证

新增 `scripts/verify-dsh-official-native-provider.mjs` 及独立 GitHub Actions workflow。原生 runner 从 npm 安装 **官方实际发布的** dsh-v0.2.0-rc.2 Session / persistence / JSONL 实现（临时 `.dsh-provider-probe`，不影响 production package.json）。

每个 runner 在系统临时目录中创建两个**离线合成 Session**：

1. 官方 Service create/append/flush/close：一个有真实 turn/start + completed turn/end，一个仅有未完成 turn/start；
2. 关闭并 dispose 原提供服务的 Cordis Context；
3. **开启全新的 OS 子进程和 JSONL provider 实例**；
4. 使用官方 `list()`、`open(id, 'read')`、`read()`、`close()` 校验事件 seq 连续、完成 Turn 保留、未完成 Turn 未被虚构完成；
5. 只向 CI 返回完成/未完成数，不读取真实 DSH_HOME，不触发任何模型、Goal block、授权或原始提示词。

矩阵：Ubuntu Node 22.19/24，macOS Node 24，Windows Node 24。CI 尚未通过时不得写 PASS。

## 不能推出的结论

这个原生测试**不等于**通过 DSH Web/Desktop 正式安装路径加载 Agent Picket，也不证明：

- 已部署 profile 必定启用 persistence provider，第三方插件的 inject 权限确实生效；
- Goal service 与 sessionPersistence 在真实 Host 同时可注入；
- 当前的 Goal 自动 round 之间有可供插件无损检查的稳定异步窗口；
- `list()` 涵盖所有当天实际工作 Session，尤其不保证损坏 header 被显式报出；
- Fork 真实拷贝、跨进程强制结束、Windows 正式 DSH Host 的 block/resume 和 HQ revision；
- 已完成而失败、取消、token 上限等结束原因的工时口径已获批准。

因此 #121 与 #77 保持 OPEN，#110 不合并，release:gate 继续 NO-GO。不要为了通过测试引入私有工时 WAL / SQLite。**下一步**：具备真正安装 DSH 的隔离 profile 后，通过正式 plugin loading + ctx.inject 联合验证 provider、Goal 及 flush 后的下一轮预提交边界；实测成立再决定是否从 #144 的安全投影收敛生产实现。

## 官方源码链接

- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/bundle/base/cordis.patch.yml
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/bundle/base/package.json
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/goal/goal-round-driver/src/index.ts
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/core/agent-loop/src/agent.ts
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/session/session-persistence/src/handle.ts
