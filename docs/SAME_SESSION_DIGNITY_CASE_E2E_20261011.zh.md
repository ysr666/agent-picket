# Agent Picket · 真正同一会话的自动检测 → 用户立案 → 模拟听证（2026-10-11）

> Draft #104 的产品闭环验收依据。本文件保留在 GitHub，不包含在 npm 用户安装包中。

## 为什么这项测试重要

此前 #103 验证了在同一个真正的 DSH 0.2 Web Host 内，通过正式 `session/prompt` 提交用户消息、AgentLoop 自动触发 Agent Picket 规则检测，随后官方鉴权读取接口可以返回当前 Session 的规则命中；#102 则独立验证了工会案件 UI 的立案、模拟听证、结案与 Host 重启恢复。

不过两个测试单独成功，**不能证明**浏览器当前显示的就是刚才自动检测的 Session。本轮把两段接在同一条真正的 Session 生命周期里，而不是给工会强制注入一个伪造的 sessionId。

## E2E 场景

在用户主动授权工会后，真实 Chrome 同时运行正式 Host、正式 DSH Web UI 和本地离线模型适配器（只用于隔离验收）。

1. 使用真实 DSH Web 页面上已存在的工作区 ID，经官方鉴权 `session/create({workspaceId})` 创建一个归属明确的普通 Session，而不是创建可能被折叠在“未分组”的不可见 Session。
2. 正式 `session/selectModel` 选择纯离线模型，再通过 `session/prompt` 发送专用虚构测试句（仅用于测试，没有用户私人内容）。
3. 同一 Host 上 `agent/pre-step` 自动检测，并通过官方鉴权 `/api/agent-picket/dignity/v1` 只返回哈希 Session Key 下的规则计数；不回显原文。
4. 关闭工会抽屉，用 **DSH 自己的工作区侧栏 Session treeitem** 导航到刚创建的 Session（真实 `mainView` 选择）。
5. 重新打开工会抽屉，待读取完成后能看到本 Session 的规则讨论建议与正式异议入口。
6. **规则命中不会自动立案**；用户明确点击“正式提出规则异议”才会通过官方 Host revision-CAS/回执写入编号案件。
7. 用户点击“召开模拟听证会”，再选择“撤回未经证实的指控”，界面显示由用户选择的模拟结案结果。
8. 通过正式 `settings/describe` 独立读取 `unionDignityCases`，验证相同哈希 Session Key 下的案件确实是 `question-rule → closed → withdraw-claim`，不含敏感原句。

不使用直接调用本地检测器、伪造浏览器返回、工会内部 Session 选择注入、云端模型 API 或外部网络。全部进行于 throwaway DSH Profile，保留原先严格工时/协商/Host 重启验收的独立时序。

## 证据与边界

官方 DSH `0.2.0-rc.2` **Google Chrome 源码版与离线 npm 安装版 2/2 PASS**；同一验收脚本额外执行真正 DSH 0.2 CommandRuntime 的独立严格设置存根测试 1/1 PASS。

此测试覆盖的是单个有文本内容的正常用户来源会话；Host 仍然标注来源为 `claimed-user`，不是经密码学证明的真人。没有调查 Agent 的真实意愿，不声明 AI 感受到伤害，不执行用户惩罚、任务阻断或真正独立的仲裁。文件/图片消息字节级安全恢复仍由 #80 作为单独门禁。检测器在第三组未调参样本中依然明显误判（#83）；工会只能给用户可质疑的线索与模拟行动选项。

没有人工 VoiceOver/NVDA、400% 放大、独立安全审计或正式 npm 发布。所有上游 PR 仍为 Draft，`main` 不变。
