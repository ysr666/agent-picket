# Windows SQLite 候选账本：批量原生 DACL 校验（P0 实验）

日期：2026-10-14。基于 Draft #140 最新 `b63e3ae`，单独提交给产品/NTFS 研究负责人审查。正式 Windows `DurableStats` 的安全禁用保护不变；本文件描述的是实验适配器，**不是**已安装 Windows DSH Host 罢工验收。

## 根因与最小修改

#140 真实 Windows Server 2025 / Node 24 运行日志记录：完整工作事件接口测试约 33 秒，7h→8h 约 18 秒。当前每次 `recordWork` / `trustedWorkDays` 都会针对 SQLite 目录、主数据库以及存在的 `-wal/-shm` 文件逐项启动独立 `powershell.exe`，每次均进行严格 NTFS owner/ACE/reparse point 检查。因反复创建 Powershell 进程而使每个 Turn/工具事件成本过高。

新增 `verifyPrivateNtfsAclBatch`：直接复用现有原生 PowerShell 检查脚本的**逐文件完全相同**主体，只将 1–4 个路径在**一次** Powershell 进程内依次审查。所有路径在 JS 层仍预先检查实际类型、不允许符号链接、文件必须仅有一个硬链接，并对目录/SQLite 主文件/WAL/SHM 重新检查本机 Windows ACL。输出必须精确包含与路径数相同的成功确认行；权限不明、路径缺失、非私有 ACE、进程异常、额外输出或者不匹配一律返回 false。无权限缓存、没有放宽 ACL 条件。

实验 `SQLiteDurableStatsCandidate` 每次可信性检查先检查文件名单、SQLite 主文件身份是否与初次打开一致、每个文件的类型及硬链接数；然后对目录及所有存在的 SQLite 文件进行**一次批量** DACL 校验。仍然逐次验证，不会因为降低 Powershell 进程数而接受旧的缓存 DACL。构造函数对已经存在的文件继续逐项先行验证，避免改动已有数据后再拒绝。

## 回归与证据状态

- 继承 #140 的完整 `DurableStats` 工时与分类接口测试、7h/8h UTC 阈值、重启去重以及 SQLite WAL 恢复。
- 原生 `tests/windows-private-acl.test.ts` 的正向用例要求批量校验和独立校验同时接受 owner-only DACL；在同一文件加入 Everyone 读取 ACE 后，两者必须同时拒绝。
- Windows CI 将给出**真实**批量校验结果及测试执行耗时。与 #140 Actions #38431224945 的原始 33s、18s 比较，必须以实际数字说话，不预设性能提升率。
- 不复制用户原始提示词或附件；不改变 DSH Host 的授权、Goal 状态与 CAS。
- 批量 Powershell 校验**不是原子句柄绑定**，无法证明本地同权限程序在检查后替换数据库、WAL 回滚或物理断电无损。SQLite `integrity_check` 也不能证明没有同权限篡改。

**结论：实验性性能与权限一致性修复，尚待 Windows Runner 验证；Windows 生产 DurableStats 和正式安装的 DSH Goal 八小时停工/恢复仍为 NO-GO。此 PR 保持 Draft，不合并、不发布、不关闭 #121。**
