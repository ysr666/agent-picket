# DSH 0.2.0-rc.2 官方 Session 历史枚举的严格完整性限制

2026-10-14 · Agent Picket 1.0 · Draft #151 · **仅工程取证，不是 Release PASS**

## 确认的事实

官方源码 `packages/session/session-persistence-jsonl/src/index.ts` 的 `listArtifacts()`：
- `readGenerationHeader()` 返回 `undefined` 时执行 `continue`；
- 遇 `SessionFormatUnsupportedError` 或 `SessionPersistenceCorruptionError` 亦可能跳过；
- `list()` 返回的是**成功解析的 Session 快照**，不是携带缺失数量、错误明细或覆盖证明的完整清单。
- `open(id,'read')` 的校验只保证**已知 id 的可见日志**可读，无法证明未知或被跳过 id 不存在。

官方源码路径：[JSONL provider](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.2/packages/session/session-persistence-jsonl/src/index.ts)。

## 真实原生复现实验

`scripts/verify-dsh-official-list-gap.mjs`：
1. 在全新临时 Session root、以 **官方 DSH 0.2.0-rc.2** Provider 新建并 flush 两份 Session；
2. 关闭真实 Provider，将其中**一份合成 Session 的 Header 第一行**改为非法 JSON；
3. 构造一个新 Provider（不沿用先前缓存）后 `list()`；
4. 实际只得到**一份正常 Session**，并且 `inspectOfficialPersistedDay()` 只能给出该可见 Session 的 8h 已完成 Turn；
5. 明确要求结果为 `coverage: 'durable-prefix-lower-bound'`，绝不冒充 `complete`。

用来复现的记录、损坏的文件全部在隔离目录；脚本结束清理，不读取用户历史或附件。原生 CI 包括 Windows、macOS、Ubuntu，必须以实际 PASS 结果为依据。

## 一起修复的误停工边界

`official-persisted-work-preview.ts` 当前只做**已观察到的 completed Turn 起止墙钟时间**，不声称是模型算力使用时长，不代替产品“连续工作”指标。

- 已验证的事件 `seq` 连续仍不足以防工作重复：**Turn 序号也必须严格递增**，否则整次汇总 unavailable。
- 同一 Session 不能让后一个 Turn 的起始时刻早于前一个已结束 Turn（时间回拨/重叠）；否则不计为可信时长。
- “跨 UTC 午夜的 Turn 完整计入结束日期”可能把前一天工时误算为当日并造成 8h 假阳性。跨日统计口径尚未由 #77 决定，因此先对**结束在今天但开始于前一个日期**的 completed Turn 返回 unavailable，不自动重分配，也不凭空补时长。
- 未完成的 Turn 不以启动时间臆造结算；失败、取消等 Turn 的口径依旧待 #77 产品决定。

## 关键发布裁决仍未解决

1. **允许用可信下界触发停工吗？** 如果已有真实、去重、有效的 completed Turn 证据累计达到 8h，某些不可枚举 Session 只能使累计下界偏低，不能凭空消除这 8h；但这需要产品明确采纳“正向下界可用于停工”的原则。否则，不可枚举 Header 必须被视为覆盖未知，需等待官方严格完整性 API。两种策略**不能被工程测试擅自替用户决定**。
2. 现有 DSH 0.2.0-rc.2 `list()` 不提供严格枚举结果或可校验的全量 Session 清单。不要将源码 `list()` 调用、SQLite 的 `integrity_check` 或 CI 绿灯称作历史覆盖证明；也不要私自新增扫描真实用户 Profile 的第三套索引。
3. 保留默认 OFF 的开发预览、Host 授权、官方 Goal CAS 和 `npm run release:gate` NO-GO。下一步如果需完整覆盖证明，优先向 DSH 官方寻求公开的严格枚举/错误反馈接口，再审查是否确实需要 #143 SQLite 的单一后备；不能重启 NTFS 自研 WAL。

相关：#77、#121、#136、#144–#150。
