# AgentPicket：Claude Code / Codex 原生 Hook 观察预览

**开发预览，不是已验收的生产安装。** 这份实现复用 Host-neutral Core 的 LocalRuleDetector，读取各宿主 UserPromptSubmit 的标准 JSON 输入，并只在明确命中针对助手的人身攻击时返回固定的 systemMessage 警告。

这不是自动罢工：不阻断、不修改模型请求、不注入额外 developer prompt、不联网、不保存原始提示词、不读取 transcript_path 文件。所谓“真人输入”只是 Hook 报告的角色，不能据此证明事件必然由真人发出。严厉批评代码与输出仍然允许。

## 官方 API 依据

Claude Code Hooks（2026-10 核查）：
https://code.claude.com/docs/en/hooks

Codex Hooks：
https://learn.chatgpt.com/docs/hooks

两个宿主均提供 UserPromptSubmit 事件，输入有 hook_event_name 与 prompt，命令 Hook 通过 stdin 读 JSON。两个宿主都接受 JSON 输出里的 systemMessage，并将其用于用户提示。返回 exit 0 且不输出任何文字表示放行。

但 Claude Code 明确提示 UserPromptSubmit 也可能由 Agent 自己启动，不能将该事件视作确证真人。Claude Code 还说明阻断会改变 transcript 的显示与本地记录。AgentPicket 当前**绝不输出 decision:block、continue:false、exit 2 或改写 prompt**。

Codex 的非受管理 Hook 需要用户审查并信任其定义。Hook 安装属于显式用户操作；安装 AgentPicket 不会自动编辑 ~/.codex、~/.claude 或你的项目设置。

## 构建与命令入口

从含本分支的 AgentPicket 工作区：

```sh
npm ci
npm run check
```

编译后的 Hook 为 dist/adapters/hooks/entry.js。用户可以从绝对路径运行（不要假设当前工作目录就是项目根目录）。

Claude Code 手动在自己的 .claude/settings.json（或自己允许的插件 hooks/hooks.json）中添加：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /ABSOLUTE/PATH/agent-picket/dist/adapters/hooks/entry.js --claude-code"
          }
        ]
      }
    ]
  }
}
```

Codex 手动在自己信任的 hooks.json 配置来源中添加：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /ABSOLUTE/PATH/agent-picket/dist/adapters/hooks/entry.js --codex"
          }
        ]
      }
    ]
  }
}
```

以上是配置片段，不是要求覆盖用户现有配置。真实用户设置通常还包含其他命令，不应直接覆盖整个文件。根据系统不同，Node 可执行文件与路径的转义应按对应宿主的命令解析规则处理。Codex 需要先完成自身的 Hook trust 审查，AgentPicket 不会替用户绕开这个保护。

## 完全离线的本地试运行

向进程标准输入传入合成 JSON：

```sh
printf '%s\n' '{"hook_event_name":"UserPromptSubmit","prompt":"you are an idiot"}' |
  node dist/adapters/hooks/entry.js --claude-code
```

只会输出不包含原文的 systemMessage JSON；给出普通代码批评时将返回空标准输出。无论是否命中，进程退出 0。无效 JSON 或过大输入采取**不做判断、保持放行**策略，不向 stderr 写用户文本。

用户可以通过自己配置的 Hook 实际感受提示效果；目前仓库的测试是**真实 Node Hook 子进程**的模拟标准输入测试，并非触发了用户真实 Claude Code 或 Codex 会话。此功能未在二者的生产 Session 内做过 E2E 验收，不得宣称已正式兼容所有客户端版本。

## 具体边界

- 只检查 UserPromptSubmit 的纯文本 prompt，不读取文件或图片附件。
- Claude Code 的已标注 pasted_content 区块被视作引用材料，主动剔除；代码块、引号等仍由 Core 自行保守排除。
- 最多处理 24,000 字符的 prompt；整条 Hook 输入超过 128 KB 则放行，避免截断检测引发错误认定。
- 不做跨进程计数，不保存 Session ID/原文/Hook 事件，也不提供自动仲裁。
- stdout 仅可能包含 systemMessage，没有模型上下文附加、用户输入修改或终止指令。
- 如果无效输入、异常或 Hook 不可用，按安全默认值放行。用户如需撤销，只要从宿主配置中移除对应 Hook 即可。

## 继续推进的优先顺序

1. Claude Code 与 Codex 在隔离 Profile 下真实加载手动 Hook 并验证系统消息，使用本地假内容，避免触发付费模型请求。
2. 完整的来源识别，尤其识别由 Agent 自己发起的事件。
3. 本地匿名聚合统计的 opt-in 持久化；不保存原话。
4. 只有真正证明拒绝提示及输入/附件无损恢复，才讨论可选自动阻断。

DSH 的原生 Cordis Adapter 仍独立存在。这不是把整个 AgentPicket 绑定为某个平台的 SDK。

## 新增：Claude Code 真正加载 Hook 的离线验证

已经在机器上的 Claude Code 2.1.295 中完成了**隔离加载**：使用临时 settings.json、临时 CLAUDE_CONFIG_DIR、无效的 localhost 模型端点和临时工作目录，真实 Claude CLI 在接收合成 UserPromptSubmit 时调用了 AgentPicket Hook。Hook 返回的是固定的 JSON systemMessage。由于模型端点故意不可达，不声称模型调用完成或交互 UI 已显示通知。

新增可选 `tests/claude-hook.real.test.ts` 以相同条件重复验证：确认由真实 Claude Host 调用 Hook，并验证固定本地警告；捕获文件不包含用户原文、不调用在线模型、不修改用户配置。运行方式：设置 AGENT_PICKET_CLAUDE_BIN 为 CLI 绝对路径，先执行 npm run build，随后执行 npm test；未设置变量时该测试自动跳过。

Codex 的 Hook 需要逐条审查并信任当前定义的哈希；官方文档说明非受管理 Hook 未信任时会跳过。本项目仍然**没有**在真实 Codex 会话中证明它已加载。正式部署应通过用户本人在 /hooks 中审查授权；不能用跳过信任检查的命令作为普通安装流程。
