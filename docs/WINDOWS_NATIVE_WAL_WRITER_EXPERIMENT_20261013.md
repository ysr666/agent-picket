# Windows NTFS WAL 实际写入实验 · 2026-10-13

这是 Agent Picket 对真实 Windows 持久账本的下一步独立验证，但**绝不是已经具备生产安全保证的存储后端**。

`src/adapters/node/windows-ledger-writer.experimental.ts` 是刻意被 `package.json` 排除的研究模块，任何已安装的 DSH、Claude Code 或 Codex 插件都不能调用它。其 `ExperimentalNtfsWalWriter` 仅在 Windows 可实例化，使用既有 DurableStats v1 的 JSON 快照和逐行 HMAC-SHA256 WAL 结构，而不是创建不兼容的新账本。每个合成 tool-start 写入都要先确认受保护目录、受控文件清单和本进程锁身份，写入日志并 `fsync` 后才更新内存中的累计计数；恢复时通过 v1 只读重放模块确认签名、顺序和数据完整性，并恢复指纹去重集合。实验 API 只接收合成事件 ID，不用于拦截或记录用户对话。

安全范围严格受限：只自动创建全新、空的、受保护 NTFS 目录；现有旧锁、恢复锁、坏快照、受损 WAL、最后一条未完成日志均拒绝。只允许**没有未验证接管的正常 close→open**，不自动抢占死进程锁。没有实现 WAL checkpoint，硬性限制最多 255 条已确认记录；超过限制拒绝后续写入，避免无界日志增长或误称可生产使用。整个原型不进入 npm 包，不改变当前 `DurableStats` 在 Windows 上构造之前即拒绝的行为。

`tests/windows-ledger-writer.real.test.ts` 在真正的 Windows Runner 和临时私有 NTFS 目录上执行三个验收：

1. 新建真实账本、写两条带签名和 fsync 的记录、同 ID 去重、拒绝第二个同时取得锁的写入者；正常关闭后重新打开，确认序号/累计计数/去重不变，新增记录仍保持连续序号；通过独立 WAL 验证器复核，再验证完整日志记录被篡改时拒绝写入且保留坏日志原文。
2. 启动独立 Node 子进程，写入并 fsync 一条记录后强制终止进程；锁必须保留，下一写入者必须拒绝接管，但独立只读重放仍能验证已经确认的计数未丢失。
3. 在非 Windows 系统上，即使存在合法路径也不允许误启用该实验性 NTFS 写入器。

**仍需验收：** 一次性锁创建后文件句柄与 NTFS DACL 检查之间的 TOCTOU、跨进程死锁身份比较及原子删除、Windows 上已打开文件的 checkpoint/原子替换、真实完整 `DurableStats` 功能和所有被跳过的 Windows 测试、实际安装的各 Host×OS 兼容矩阵。任何已验证的“独立实验写入”都不等于“可以让工会真实罢工”；1.0 发布闸门继续 NO-GO。
