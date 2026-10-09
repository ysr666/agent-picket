# DSH Web Client Companion 生命周期测试

AgentPicket 通过 Cordis 插件自己的事件订阅机制注册 command/executed 回调，不创建全局 window 监听器，也不复制用户消息。

## 已通过的真实 Cordis 测试

tests/dsh-client-lifecycle.real.test.ts 使用 DSH 所带的 Cordis 4 运行时，验证：

- 同一插件连续挂载、卸载五轮，每轮两个独立 Session 仅各得到一条通知。
- 卸载后再次派发同样的命令事件不会触发旧监听器。
- 无关命令、失败命令、已消失的 Session 不会发送工会成功通知。
- 同时加载两个独立插件实例会各自收到事件；卸载其中一个后只留一个通知；全部卸载后没有通知。

这说明 Cordis Fiber 的 dispose 生命周期能正确清理 AgentPicket 的事件订阅，避免普通重载时积累幽灵监听器。

## 不可混淆的限制

这些结果不等于已经验收真正的 HMR 代码热替换。浏览器页面刷新后，AgentPicket 可以重新执行新命令，并在空白会话即时显示结果，第二标签页也能独立运行。

但 DSH Web 0.2.0-rc.2 旧命令卡片在页面重载后**偶尔仍不能显示**，目前尚未区分是 Session 选择、持久化回放还是 UI 渲染。即使点回原 Session，某些测试中仍出现未显示。因此不声称旧命令历史已经可靠恢复，不使用 AgentPicket 自建副本伪造记录。

后续调查需将 Host 持久化的 command/run、command/done 与浏览器 Session 事件回放对照。自动罢工依然关闭，输入、附件恢复问题仍需要独立验收。
