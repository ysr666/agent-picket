# Windows DurableStats v1 WAL 恢复：只读验证（2026-10-13）

Agent Picket 的持久工时记录不是原始对话，而是本机 UTC 日汇总、分类计数与 HMAC 键控的事件去重指纹；这些信息依然属于应当保护的个人活动元数据。

本轮实现 `src/adapters/node/windows-wal-replay.ts`（**明确排除在 npm 发行包之外**）。它按现有 `DurableStats` v1 磁盘格式，在内存中验证并重建快照和 WAL 序号与计数；提供 `replayVerifiedV1SnapshotWal(snapshotText, bytes)` 纯函数和 `inspectPrivateNtfsWalReplay(directory)` NTFS 只读入口。入口首先通过独立私有 DACL/路径/文件清单验收，拒绝在存在工作锁或恢复锁时读取，才读取受大小限制的快照和 WAL。任何不受信任或损坏的完整条目都返回 `unconfirmed`；不会删锁、抢锁、截断 WAL、替换快照、启动生产写入，也不会返回事件指纹、密钥或原始用户标识。

验收重点：

- 真实 `DurableStats` 生成的快照及 SHA-256 HMAC 日志，经纯函数重放后计数和连续序号完全一致，不重复计时。
- 已落盘且完整的日志按连续序号与 HMAC 校验，遇到跳号、重复序号、重复指纹或签名损坏则拒绝；一个末尾缺换行的半写入条目只被报告为 `tornTail`，**绝不由只读验证器擅自截断**。
- 清空统计会更换快照密钥，且可能在旧 WAL 还没替换时崩溃。因此序号小于等于快照序号的历史日志按生产规则忽略，不用新密钥验证旧记录，更不能将被清除的计数“复活”；只有新日志才按新密钥签名验证并累计。
- Windows 原生测试在临时的、确实设置私有 ACL 的目录中，创建合成快照及有签名的 WAL，检查正确重放、末尾截断只读行为、完整篡改拒绝、存在锁时拒绝。不会读取已有用户资料，所有测试目录可清理。

**没有完成的部分：** 读前的 DACL 检查与真正打开文件句柄之间仍有 TOCTOU 窗口；文件 ID/句柄绑定、原子化锁接管、真实 Windows `DurableStats` WAL 重放及持久写入、崩溃/并发压测均没有完成。当前验证器只是独立验收组件，不是可用于启用真实罢工的 Windows 账本，也不能计入完整 12 平台格验收。`npm run release:gate` 必须继续 `NO-GO`。
