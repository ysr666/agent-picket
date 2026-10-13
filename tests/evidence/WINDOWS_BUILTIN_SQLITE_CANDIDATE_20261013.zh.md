# Agent Picket · Windows 持久账本现成方案对照：Node 内置 SQLite

日期：2026-10-13。实验基于集成分支 `2e0b3d7b`，**尚未启用 Windows 生产 DurableStats，也没有声称 Windows DSH Goal E2E**。

## 为什么不必自己写 NTFS WAL

NTFS 是 Windows 的默认文件系统之一，不是必须自研的日志协议。SQLite 数据库通常也是普通 NTFS 文件。项目现在已经有一个 `windows-ledger-writer.experimental.ts`，但自研 WAL 需要自行维护提交原子性、唯一事件去重、崩溃后日志截断、并发 writer、锁身份和检查点。SQLite 经过长期使用，可以替代大部分这类基础存储工作。

已有项目的要求是 Node >=22.19.0。Node 官方 `node:sqlite` 自 Node 22.13 即不需要 `--experimental-sqlite` 才能导入；Node 24.15 起进入 release-candidate 阶段，**仍应视为较新的接口，Node 22 的 API 和行为也必须单测**。不需要 `sqlite3`/`better-sqlite3` 第三方原生插件，所以无需引入 Windows 专属预编译依赖或扩大 npm tarball。

参考：
- https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
- https://www.sqlite.org/wal.html
- https://www.sqlite.org/pragma.html
- https://www.sqlite.org/howtocorrupt.html

## 本轮真实实验覆盖

代码：`scripts/windows-sqlite-ledger-candidate.mjs`（实验脚本，**不在 npm files 中**），`scripts/windows-sqlite-crash-worker.mjs`，`tests/windows-sqlite-candidate.test.ts`。

每个候选 SQLite 数据库使用 `PRAGMA journal_mode=WAL`, `PRAGMA synchronous=FULL`, `PRAGMA trusted_schema=OFF`；严格约束已完成工作时长不为负、UTC 日期合法。以**已在应用侧匿名化/加密哈希后的** 64 字符指纹为 `PRIMARY KEY`，在单个 `BEGIN IMMEDIATE … COMMIT` 事务中执行指纹唯一写入及当日时长增量。重复指纹不增加时长。

测试还会启动一个独立 Node 子进程、提交完成事件后强制结束；随后重新打开数据库核对已提交的数据。另一轮在事务未提交时强制结束，重开确认未提交的完成事件不存在、可正常重试。没有重放原始用户提示词，也没有复用 DSH Host 中的授权或 Goal 状态。此脚本不是正式 `DurableStats.recordWork` 的完整实现，且故意不接受原始 Session/Event ID。

### 验收矩阵（随实际 CI 更新）

| 证据 | 当前状态 |
|---|---|
| macOS Node24 原生 SQLite 事务、去重、重开、进程强制终止 | 已实测 PASS |
| Ubuntu Node22.19 / Node24 CI | 待执行 |
| Windows Server Node24 原生 SQLite | 待 CI 实测 |
| 实际正式 npm 包体积、不包含实验脚本 | 待完整构建审核 |
| Windows 私有 DACL、当前用户/跨账号 ACL、junction/reparse point | **未实现 / NO-GO** |
| 生产 DurableStats 全事件语义、可信失败降级、迁移旧 JSON/WAL | **未实现 / NO-GO** |
| 单独防篡改/防回滚 witness 与可信时间来源 | **未实现 / NO-GO** |
| 真实 Windows DSH Goal 授权→低于八小时不阻断→达到阈值阻断→人工复工 | **未测试 / NO-GO** |
| 真实断电后的持久性 | **没有物理断电测试，不能声称通过** |

## 安全结论和接入方向

**优先选择“Node 自带 SQLite WAL + FULL 同步 + 现有 DurableStats 事件语义适配”，放弃为基础事务管理自写 NTFS WAL。** 但必须把身份安全单列：

1. SQLite 的事务和崩溃恢复 ≠ NTFS 目录/文件权限安全。需复用并审核 #125 已研究的私有 DACL 检查或更简洁可信的 Windows 系统 API；不能只用 POSIX `0o600` 判断。
2. 数据库 `quick_check/integrity_check` 只检查数据库内部一致性，**不能证明没有被同权限程序修改或回滚**。不要把内部 SQLite 元数据伪装成不可篡改证据。若要防同权限攻击，需要另行定义独立的可信来源、外部锚点或明确收缩威胁模型，且既有 #125 的问题不会因换 SQLite 自动消失。
3. 只有完成生产 `DurableStats` 的全工作事件去重、完成 Turn 的 UTC 日归集、故障时返回“证据不可用”以及重启验收，才能交给已有 Goal 限时逻辑。Host 授权、blocked / active 与 CAS 仍由 DSH 官方管理。
4. 当前已发布的 Windows `DurableStats` fail-before-I/O 保持不变。此实验 PR 不更改任何生产持久化构造函数、不放开罢工阈值、不放松 1.0 release gate。

**这是一条减少自行维护数据库基础设施的替代路线，并不是把旧研究 PR #125 的全部安全问题都宣布解决。**
