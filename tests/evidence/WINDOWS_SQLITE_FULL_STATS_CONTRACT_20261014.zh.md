# Agent Picket · Windows SQLite 全量 DurableStats 接口适配器（实验分支）

时间：2026-10-14。基于 #138（官方 Node SQLite 的原生 Windows WAL/ACL 可行性）向完整工时统计语义推进。代码 `src/adapters/node/sqlite-durable-stats.experimental.ts` 是 **实验性适配器**，不会通过 `package.json#files` 进入正式 npm 包，正式 Windows `new DurableStats()` 仍 fail-before-I/O。#121 / 1.0 release 仍 **NO-GO**。

## 已实际实现

`SQLiteDurableStatsCandidate` 兼容已有统计对象的主要公开操作：`recordWork`、`recordDetection`、`snapshot`、`snapshotDays`、`trustedWorkDays`、`reset`、`close`、`classificationEnabled`。没有复制用户提示词、附件、原始 Agent/Session/Event ID。

- HMAC-SHA256 以随机持久密钥生成每个事件的不可逆数据库指纹。SQLite `PRIMARY KEY` + `BEGIN IMMEDIATE` 事务将事件唯一键及日／全量九项指标一并提交；保持当前 16,384 个指纹及 366 UTC 日的可见历史上限。
- 已完成 Turn 使用与原 `DurableStats` 一致的 **同进程起止配对** 规则；跨重启不凭空补时长，但重启后重复已完成事件仍不再计算。工时包含 Host Turn 墙钟时间及等待，不宣称为持续模型推理。
- 不当对待分类只有显式 `classificationEnabled=true` 时才写入汇总计数，而且分类输入须为直接人类 actor。
- 使用 SQLite 原生 `WAL` / `synchronous=FULL` / `trusted_schema=OFF`；打开时 `quick_check`，可信数据读取时再检验。事务异常及数据库文件路径与初次打开 inode 不一致时 fail-closed，不把旧八小时缓存当新授权。
- Windows 下复用项目现有 `createProtectedNtfsDirectory` 与 `verifyPrivateNtfsAcl`，仅创建新的私有目录，检查主数据库与 SQLite 自行创建的 WAL/SHM 实际文件 DACL。POSIX 下强制目录 0700 且只在受保护父目录中修正 SQLite 新生成文件的私有模式；预先存在的宽松权限文件会在连接前被拒绝。此处仍不能证明完全抵御竞争替换或同用户恶意回滚。
- `reset` 在单个事务里清理工作计数、去重记录、日汇总并轮换随机 HMAC 密钥；不调整 DSH Host 自有的工会授权及 Goal 状态。

## 真实测试及边界

新增 `tests/sqlite-durable-stats-integration.test.ts`，覆盖全部 Turn/工具计数、7h→8h 的 `completedUtcDayWork` 对接、重启去重、跨进程不凭空补未配对 Turn、分类 opt-in、清空、内容不落盘、关闭后不可当作可信统计，以及（POSIX）已打开数据库路径被替换的退化。Windows 下使用**真实受保护 NTFS 临时目录**运行适配器，不使用假的 win32 环境变量。

这是正式生产化之前的*接口与 OS 文件权限验收*：不能称为安装在 Windows DSH 中的真实 Goal 自动停工／复工。

## 未满足的生产门槛

1. **所有 SQLite 文件安全性**：DACL 校验与路径名称检查不等于同一原生打开句柄上的不可替换访问。仍需要 Windows 上多进程/竞态、文件替换、SQLite 锁和异常终止后的 ACL/完整性验收。
2. **可信工作证据**：SQLite 防数据库损坏和普通进程崩溃，不提供独立不可回滚证人。同一账户程序能够整库替换、修改可信时间或伪造事件，不能凭 SQLite `integrity_check` 证明曾真实工作八小时。须明确来源签名／外部独立锚点或收窄威胁模型。
3. **生产兼容与迁移**：现有 POSIX JSON+WAL 不能被静默当成 SQLite；Windows 原有 #125 实验侧车也不能自动迁移。需严格区分新建、迁移、拒绝，并验收完整 `DurableStats` 发布接口。
4. **Host Goal E2E**：正式 Windows npm 安装包仍未接入该后端，因此尚未跑真正 DSH Windows 下首次授权→7h 不停→8h 阻断→HQ 复工→重启／强杀恢复的全程。Host 授权和 Goal CAS 应继续完全由 DSH 官方管理。
5. **发布签收**：跨 Windows Desktop、Codex/Claude、多客户端、真人无障碍及物理断电测试均未获通过。Node 22 内置 SQLite API 在本分支的实际 OS CI 执行结果，应以当次日志为准。

此阶段的价值在于**替换自研 NTFS WAL 的主要逻辑复杂度，同时坚持真实罢工只能由可信工时证据驱动**，不是通过一个环境变量绕过 Windows 禁用逻辑。保持 Draft，不合并、不发布、不关 #121。
