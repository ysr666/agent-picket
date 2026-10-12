# Agent Picket · DSH 隔离安装与验证（当前开发版）

> **更新：2026-10-12。不是正式发行安装教程。** 当前公开的 `main` 已包含经过合并的工会基础版（截至 #70），但最新 1.0 候选仍位于 [Draft PR #110](https://github.com/ysr666/agent-picket/pull/110)，**没有合入 main，也没有发布 npm**。当前 `package.json` 为 `0.0.0`、`private: true`。请不要误认为安装 `main` 能得到 PR #110 中所有新功能。

**推荐入口：** [当前研发状态](STATUS.zh.md) · [构建本地私有包与官方 DSH 安装](PACKAGING.zh.md) · [1.0 候选集成审计](RELEASE_1_0_INTEGRATION_AUDIT_20261012.zh.md)。

## 一、适用版本和保护措施

- Node.js 22.19+；不要直接覆盖用户已有的 DSH 安装、`DSH_HOME`、Web Profile 或其他插件。
- 在隔离真实浏览器测试中，**DSH 0.1.2-rc.1 与 0.2.0-rc.2** 均已分别完成当前 1.0 候选的源码/离线安装验证（每个版本 2/2）；此证据只适用于当时的确切构建及测试场景，不表示所有 DSH 版本正式兼容。
- **DSH 0.2 的 Web 插件首选官方 `plugin --profile web add` 命令**，不需要对 Host 核心打补丁，也不应为了安装而修改用户的真实 Profile。早期以 `sdk-minimal --patch` 加载源码的方案仅是历史研究路径，不能作为目前面向用户的 Web 安装步骤。
- 这些命令默认只用临时目录，不调用真实云模型，也不需要模型 API 密钥。

## 二、从已合并 main 构建本地私有包

在全新的工作目录运行：

```sh
git clone https://github.com/ysr666/agent-picket.git
cd agent-picket
git switch main
npm ci --ignore-scripts
npm run check

mkdir -p /tmp/agent-picket-dist
npm pack --ignore-scripts --pack-destination /tmp/agent-picket-dist
```

目前版本的包文件名为 `agent-picket-0.0.0.tgz`。**上述代码来自 main，而非未合并的 PR #110。** 审查 1.0 候选的开发者应明确检出 PR #110 的实际提交，重新跑相同构建和验收；不得借用旧版测试结果。

## 三、用官方命令安装到隔离 Web Profile

请先单独安装一份准备验证的 DSH，确认实际二进制路径和版本（下例路径须由本地真实目录替换）：

```sh
DSH_BIN=/absolute/path/to/isolated/node_modules/.bin/dsh
PACK=/tmp/agent-picket-dist/agent-picket-0.0.0.tgz
TEST_HOME="$(mktemp -d /tmp/agent-picket-test-home-XXXXXXXX)"

DSH_HOME="$TEST_HOME" "$DSH_BIN" plugin --profile web add "$PACK"
DSH_HOME="$TEST_HOME" "$DSH_BIN" plugin --profile web list
```

之后仅在该 **测试用** `DSH_HOME` 中启动相应 DSH Web Profile，并使用浏览器检查官方欢迎页、工会面板与设置。不要将旧开发分支、源码路径或编译包冒充已发布的 1.0 版本。原始编译包测试、实际安装回归及可用配置详见 [PACKAGING.zh.md](PACKAGING.zh.md) 和 [DSH 0.2 实机测试说明](DSH_02_OFFICIAL_RIGHTS_AX_E2E.md)。

## 四、现在的工会行为

- **首次明确授权**：工会权益模拟默认 OFF；用户可选启用或暂不开启。授权由官方 DSH Host Settings 保存，之后可以撤销。长期工作统计与权益模拟分开管理。
- **象征性工会行动**：已授权时，Web 举牌/收牌只需点击一次，Host 负责记录及核验状态；不额外强制重复确认。原生 `/union strike` 与 `/union resume` 也是非阻断的象征性工会命令。模拟动作不会暂停、丢弃、拒绝或修改真实任务。
- **工会诉求**：有用户可以参与的模拟休息/加班提案、反提案、接受/拒绝、结案与 Host 记录。历史资料的可导出、删除受各自权限与数据范围限制，**不可恢复的删除才需要额外明确确认**。
- **本地检测**：授权后的合格用户源文本通过本地规则观察；结果是保守信号，不是对辱骂行为的确定判决。没有授权或撤销后不自动检查内容，不保存完整聊天和附件到工会账本。
- **真实罢工阻断**：目前仍然 **OFF**。已知 DSH `agent/pre-step` 拒绝可能吞掉原始消息或附件，缺少安全的恢复/继续/绕过证明。不能将象征性行动说成真实拦截。真实阻断未来需要全新版本化知情许可及 #80 的官方 Host 无损验证。

实际能力依 DSH 版本和 Host 提供的官方 API 变化，缺失功能应显示不可用而不是伪造数据或成功结果。

## 五、复测、停用与发布限制

```sh
npm run check
# 仅在独立安装的真实 DSH 及相应测试依赖就绪后：
AGENT_PICKET_DSH_HOST=/absolute/path/to/isolated/node_modules \
AGENT_PICKET_DSH_BIN=/absolute/path/to/isolated/node_modules/.bin/dsh \
npm run test:dsh:real
```

源码自测或 CI 通过不等于真实浏览器、真人无障碍或正式发布验收。停止隔离 DSH 进程、移除该测试 Profile 的插件或在确认无其他用途后清理临时目录；**不得在不确定数据归属时清除真实 `DSH_HOME`**。导出与擦除工会账本不能覆盖 Host 原有对话或工作统计。

当前 1.0 Release Candidate 仍需 [真人无障碍签收](HUMAN_ACCESSIBILITY_SIGNOFF.zh.md)、隐私/安全/兼容性独立审查，以及维护者对合并、打标签和公开发布的明确批准。
