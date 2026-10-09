# DSH Web：刷新后命令卡片偶发不见的分层证据

结论：受测 DSH 0.2.0-rc.2 的测试 Session 确实持久化了原生命令；前端刷新后的历史卡片仍偶尔不显示。目前最可疑的是 Client Session 选择、历史回放或者聊天节点重建，并不能在未经单独验证时宣称某个具体子系统有 Bug。

## 怎么得到证据？

在项目的真实 Chrome E2E 中，使用两种安装方式分别运行：
1. 仓库内构建后的 JS；
2. 本地 npm tarball 离线安装后的 JS。

两种方式均启动新的隔离 DSH Web，浏览器执行工会命令，再让 Host 退出并完成会话日志写入。随后读取这次测试自身的临时 DSH_HOME 下由宿主生成的压缩 JSONL Session 日志，只统计事件名称，不输出原文、附件、用户输入或完整 Session ID。

在现场取样的两次运行中，每个 Session 都发现 8 条 command/run 和 8 条 command/done，以及 2 条 turn/start、2 条 turn/end 和用户消息记录。这证明测试时被执行过的命令已经进入 Host 的持久化事件流，不能直接把“客户端卡片不见”当成“命令未执行”或“数据没保存”。

## 自动化新增的断言

tests/dsh-browser.real.test.ts 在浏览器测试完毕、测试 Host 退出后验证：

- 压缩的当前版本 Session 日志存在。
- 原生命令的 command/run 与 command/done 数量相同，且达到该测试预期的下界。
- 两条隔离的普通输入及其 turn/end 都有宿主持久化记录。
- 所有验证只面向测试自己创建的合成会话。
- 所有临时 Session 日志最后都会删除；测试失败时优先保留原始 UI 错误，不让附加磁盘检查覆盖主要错误。

这里使用受测版本的 JSONL/Zstd 帧布局进行测试专用验证，不把它引入 AgentPicket 正式代码，不暴露或复制用户真实聊天原文，也不承诺该底层文件布局跨 DSH 版本稳定。

## 什么还没有证明？

- 还没有把每一次偶发失败的浏览器画面与同一次失败时刻的 ClientSessions.eventSource 状态逐项对齐。
- 无法仅凭服务端事件存在，推断前端一定已经正确加载、过滤和渲染了这些事件。
- 没有试图在 AgentPicket 中劫持宿主的历史消息服务，更不会私建一份用户原文副本来“修补” UI。

下一步若要彻底定位，需要在测试客户端以官方的 Session Binding/EventSource 接口只记录事件类型、Seq 范围、会话选择状态与页面卡片是否显示，进行同一时间点的三方对照。跨重启统计持久化和实际自动阻断是不同任务，不应混淆。

详见 DSH_BROWSER_E2E.zh.md、DSH_CLIENT_LIFECYCLE.zh.md。
