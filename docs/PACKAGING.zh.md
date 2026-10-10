# AgentPicket 可分发包预览（本地 tarball）

> **目前不是 npm 正式发行版。** `package.json` 仍为 `private: true`、版本 `0.0.0`。这里只演示经隔离环境验证过的“构建 → 打包 → 离线安装 → DSH 加载”。不要把它描述为正式发布。

## 一、为什么需要预编译包？

DSH 的独立插件可以使用 Node.js/Cordis 原生插件机制加载。开发阶段我们直接从仓库路径加载 `src/adapters/dsh/plugin.ts`，但 Node 对 `node_modules` 中 TypeScript 类型剥离存在限制，不能假设已安装包的 TypeScript 源码可以直接使用。

AgentPicket 提供编译好的 JavaScript 入口，不需要消费者安装 TypeScript、不需要 postinstall、也无需修改 DSH 核心：

- `agent-picket` / `agent-picket/dsh`：**DSH/Cordis Host 插件入口**，两者是同一入口；
- `agent-picket/core`：**宿主中立 Core**，不能把包根入口当成 Core；
- `agent-picket/client`：**仅供 DSH Web 浏览器加载**，直接在 Node/SSR 中导入会因缺少 `window` 失败；
- `dist/**/*.d.ts`：对应类型声明；
- 包内不存在 `src`、`tests`、`node_modules`、测试 Mock Adapter。

Core 仍是独立代码；引入 Cordis 的只有专门的 DSH Adapter。

## 二、在仓库里构建

需要 Node.js 22.19+ 和 npm。

```sh
git clone https://github.com/ysr666/agent-picket.git
cd agent-picket
# 当前 main 尚无完整工会。只能检出准备审查的最新 Draft Head，示例：
git fetch origin test/67-keyboard-option-ready-gate-20261010
git switch --detach FETCH_HEAD
# 此分支是实验候选，不代表已发布或适合安装到真实用户配置。

npm ci
npm run check
mkdir -p /tmp/agent-picket-dist
npm pack --ignore-scripts --pack-destination /tmp/agent-picket-dist
```

生成 `/tmp/agent-picket-dist/agent-picket-0.0.0.tgz`，包的静态内容无需访问云端模型，不包含 API 密钥或任何用户会话内容。

## 三、安装到**单独的测试位置**

```sh
mkdir -p /tmp/agent-picket-installed
npm install --prefix /tmp/agent-picket-installed \
  --offline --ignore-scripts --no-audit --no-fund \
  /tmp/agent-picket-dist/agent-picket-0.0.0.tgz
```

安装后的入口位于：

```text
/tmp/agent-picket-installed/node_modules/agent-picket/dist/adapters/dsh/plugin.js
```

为测试 DSH 写一个只影响本次运行的补丁文件（示例路径为本机临时位置）：

```yaml
- insert:
    - id: agent-picket-distribution
      name: /tmp/agent-picket-installed/node_modules/agent-picket/dist/adapters/dsh/plugin.js
```

然后运行你单独安装、已确认兼容的 DSH：

```sh
DSH_HOME=/tmp/agent-picket-dsh-home \
  /path/to/isolated/dsh \
  --profile sdk-minimal \
  --patch /path/to/your/agent-picket.patch.yml
```

`sdk-minimal` 不提供完整 Web UI，因此斜杠命令可能只在支持命令面的 DSH 客户端可见。不要把 SDK 运行通过当成 Web UI 已全面兼容。

## 四、实际完成的验证

在隔离 DSH `0.2.0-rc.2`、Node.js `24.5.0` 环境中：

1. TypeScript `tsc` 构建后的 ESM JavaScript 和类型声明输出正确。
2. 打包清单没有 `tests/`、`src/`、`scripts/`、`node_modules/`。
3. 在全新目录以 `npm install --offline --ignore-scripts` 完成安装。
4. 已安装的 `dist/adapters/dsh/plugin.js` 能在真实 Cordis 命令服务中注册 `/union`，支持查询安全状态，手动模拟罢工；正常用户输入仍正常进入。
5. 从本地打包安装目录加载该 **JS 文件**，在完整 DSH SDK AgentLoop 中执行了一次真实的本地假模型对话，并收到成功的 `turn/end` 与助手消息；整个测试仅调用本地假模型一次。

此测试由 `tests/dsh-package.real.test.ts` 自动重复执行，前提是已提供隔离 DSH 路径：

```sh
AGENT_PICKET_DSH_HOST=/path/to/dsh/node_modules \
AGENT_PICKET_DSH_BIN=/path/to/dsh/bin/dsh \
npm run test:dsh:real
```

尚未完成：npm 官方发布授权、**DSH 0.2 新版首次授权场景的完整浏览器无障碍验收**、真人 VoiceOver/NVDA 与真实缩放、正式主线合并及多平台一致性验证。自动阻断不在当前发行范围；不应当把它列作即将打开的功能。

## 五、安全与卸载

- 没有 `postinstall` 或运行时拉取脚本；用户安装后不会被静默安装额外模型。
- 不自动发送检测文本到第三方；插件本身没有遥测外传，但 DSH 宿主可能照常向用户配置的模型服务联网。
- 自动罢工保持关闭；手动 `/union strike` 只是象征性演示，不会吞掉用户输入。
- 从 DSH 的运行命令移除本次的 `--patch`，停止进程后即可停用本地预览插件。确认不再需要后，用户可自行删除临时安装目录。


## 已追加：完整 Web 包安装测试

现在还通过了本地 tarball **离线安装后在真实 DSH Web 中启动 Chrome** 的端到端测试，并分别在源码加载版和安装包版验证了多标签页、浏览器刷新、空白会话即时通知。详见 [DSH_PACKAGED_WEB_E2E.zh.md](DSH_PACKAGED_WEB_E2E.zh.md)。

## 当前 DSH 0.2 官方插件安装方式（隔离 Profile）

前面的 `sdk-minimal`/手动 patch 示例保留给研究用途。对已测试的 DSH 0.2 Web，**优先使用 DSH 官方 `plugin --profile web add`**，不要误以为必须手工编辑系统补丁文件：

```sh
# 先独立安装并检查 DSH 版本，不要覆盖现有用户 DSH。
DSH_BIN=/absolute/path/to/isolated/node_modules/.bin/dsh
PACK=/tmp/agent-picket-dist/agent-picket-0.0.0.tgz
TEST_HOME="$(mktemp -d /tmp/agent-picket-test-home-XXXXXXXX)"
DSH_HOME="$TEST_HOME" "$DSH_BIN" plugin --profile web add "$PACK"
DSH_HOME="$TEST_HOME" "$DSH_BIN" plugin --profile web list
```

安装测试使用临时 `DSH_HOME` 和编译后的本地 tarball，**不连接真实模型，不覆盖已有 Profile**。只有在独立 Host + 浏览器运行时经过验证之后，才可进入 Web UI 测试。删除测试目录前务必结束它自己的 DSH 进程，避免误删正在使用的数据。

导出兼容性：`agent-picket` 和 `agent-picket/dsh` 是 DSH Host 插件；`agent-picket/core` 才是无 Host 依赖的核心库；`agent-picket/client` 只能由 DSH Web 浏览器加载，Node/SSR 中导入 `window is not defined` 不属于受支持行为。更完整的分支依赖、人工无障碍缺口和隐私审计见 [合并及发布审计](PR_STACK_RELEASE_AUDIT_2026_10_10.md)。
