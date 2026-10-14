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

## 2026-10-15 维护者结论：沿用官方行为，不作为单独发布门禁

此前将“必须证明 `list()` 返回全部 Session”列为 1.0 的前置条件，是 Agent Picket 的**额外工程要求**，并非 DSH 的接口合同，也不是产品必需条件。现明确撤回：

- **DSH 的损坏 Header 跳过行为是正常容错**，不要求它改成抛错，不要求官方增加严格枚举接口，也不再主动对此向 DSH 上游提 Issue。
- Agent Picket 直接调用现有官方 `sessionPersistence.list/open/read`；只根据**实际可读取、已完成且有效的 Turn**计算可证实工时。未知或损坏的记录不补造，也不把它们冒充正常工时。
- 已证实的有效工时达到设定阈值，**不因为可能另有未枚举文件就禁止已授权的 Goal 停工**。可能遗漏的工时影响计数覆盖程度，但不会推翻已观察到的有效时长。保持诚实的统计口径即可。
- **不会因为这一正常容错行为额外增加 SQLite / NTFS WAL / 私有全量目录扫描**。现有日志健全性校验仅用于避免错误计数，不用来重定义 DSH 的接口。
- 原先本文声称“必须决定是否允许以可靠下界停工”以及“优先请求上游严格枚举 API，否则考虑后备库”的内容作废。此处已经由维护者作出决定，不再列为 #121 的发布障碍。

本文件的真实 Provider 损坏 Header 复现实验仍仅作历史技术记录；不得将其错误解释为 DSH 缺陷或上游改造任务。

**未改变的独立发布条件**：真实 Host 授权、正确停工/复工、普通用户输入/附件安全、AI 工会权益及 UI、多个正式客户端和系统验收仍按原定 1.0 需求执行。未变更 `release:gate`、未合并/发布。

相关：#77、#121、#151。
