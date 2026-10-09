# AgentPicket — DSH 源码安装预览

> 如需不依赖源码 TypeScript 的 JS 安装预览，参见 [本地 npm tarball 构建与安装](PACKAGING.zh.md)。
>
> 仅供开发测试：**不是正式发布的 npm 插件**，尚未经过 Web UI、多版本兼容、完整冷恢复的最终验收。当前只监测和统计，**绝不自动拒绝、取消或修改用户请求**。

## 一、前置条件

- Node.js 22.19+（已有实测为 Node 24.5.0）
- 一个支持 Cordis 4 的 DSH 环境；当前仅实际验证 `@deepseek-ai/dsh@0.2.0-rc.2`
- 不需要云端分类 API、额外密钥、本地 LLM 或后台进程

如果你已有 DSH，**不要**因为安装 AgentPicket 而直接升级或覆盖全局 DSH，也不要覆盖原有的 DSH profile / `dsh-vision-router` 工作目录。

## 二、隔离测试安装

下面的演示将 DSH 安装到独立临时目录。选择你自己的安全测试目录，并从 AgentPicket 仓库根目录执行：

```sh
git clone https://github.com/ysr666/agent-picket.git
cd agent-picket
# 在相关 PR 合并前，请切换到含有原生插件入口的开发分支：
git switch feat/dsh-monitor-plugin
npm ci

# 不触碰全局 dsh，可换成你自己的临时目录
mkdir -p /tmp/agent-picket-dsh-test
npm install --prefix /tmp/agent-picket-dsh-test --ignore-scripts \
  @deepseek-ai/dsh@0.2.0-rc.2

# 在 AgentPicket 根目录，以独立的 DSH_HOME 启动
DSH_HOME=/tmp/agent-picket-profile-test \
  /tmp/agent-picket-dsh-test/node_modules/.bin/dsh \
  --profile sdk-minimal --patch ./cordis.patch.yml
```

`cordis.patch.yml` 会添加 `agent-picket-monitor` 一行，加载 `src/adapters/dsh/plugin.ts`。这里使用源码 TypeScript；需要 Host 运行 Node 的原生类型剥离能力。路径解析已在上述受测 DSH 版本中验证。

**注意：** `sdk-minimal` 是 SDK/无界面 Profile，不保证开放聊天 UI 中的斜杠命令；它主要用于 SDK 集成测试。使用提供 `commands` 服务的交互式宿主时，才会注册并显示 `/union`。

## 三、已有能力

在支持 DSH 命令面的客户端：

| 命令 | 实际功能 |
|---|---|
| `/union status` | 当前监测状态；自动罢工关闭 |
| `/union stats` | 本地轮次、工具次数和已完成轮次经过时间 |
| `/union report` | 中英文保守规则的本地分类计数，不含原话 |
| `/union strike` | **手动开启象征性罢工演示**，显示仲裁状态；不暂停任何请求 |
| `/union resume` | 结束象征性罢工演示，不影响真实模型运行 |
| `/union reset` | 清空本会话的内存计数 |
| `/union help` | 显示可用命令 |
| `/union safety` | 展示为什么当前版本尚不允许真实阻断（来源、提示、恢复等安全条件） |

**没有实现的能力：** 自动/真实阻断、跨重启持久统计、完整人工来源证明、可自动触发的劳动仲裁。注意 `strike` 和 `resume` 目前只控制会话内存中的**演示状态**。

所有计数只存在于插件进程内存，重启消失；`/union report` 的分类是**实验性规则命中**，不等于确认用户辱骂。AgentPicket 自身不发送额外网络请求；但 DSH 的模型服务仍可能按宿主原有配置正常联网。

## 四、测试与卸载

纯 Core + 模拟适配测试：

```sh
npm run check
```

要运行真实 DSH 测试，使用两个环境变量明确指向**隔离安装**：

```sh
AGENT_PICKET_DSH_HOST=/tmp/agent-picket-dsh-test/node_modules \
AGENT_PICKET_DSH_BIN=/tmp/agent-picket-dsh-test/node_modules/.bin/dsh \
npm run test:dsh:real
```

卸载本源码安装，只需**停止测试 DSH 进程并移除命令行中的 `--patch ./cordis.patch.yml`**。该插件无后台守护进程，也不会修改 DSH 核心代码。临时 profile 目录仅在确认不再需要时由你手动清理。

## 五、明确的安全限制

DSH 的 `source.kind:'user'` 目前只作为“声称来自真人”处理，不能作为确证；拒绝输入还可能消耗已领取的消息，且 UI 不一定有清晰可恢复的拒绝提示。因此当前适配器无论规则分类为何，都会继续传递原请求，**不会触发自动罢工**。

详见 [真实阻断安全条件](BLOCKING_SAFETY.md)、[本地检测说明](LOCAL_DETECTION.md)、[工作统计](WORK_TRACKING.md) 和 [DSH 实测证据](DSH_INTEGRATION.md)。
