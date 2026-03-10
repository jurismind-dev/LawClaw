# LawClaw 预设升级简化技术报告

## 1. 背景

旧版预设升级链路依赖 Gateway、planner、`lawclaw-upgrade` skill、队列重试和人工冲突确认。该方案实现复杂，状态分叉多，且把本地文件升级问题升级成了运行时的模型合并问题。

本次改造目标是将升级逻辑收敛为确定性的本地文件比较流程，降低失败面和排障成本。

## 2. 历史方案问题

历史上以下提交逐步引入了复杂升级链路：

1. `35e9c4e feat(agent-preset): migrate to dedicated lawclaw-main flow`
   - 引入 planner、内部 migration session、`need_confirmation`。
2. `c009f4f fix(migration): bootstrap preset install and isolate migration UX`
   - 引入聊天锁定、排队提示、手动重试。
3. `fb0f4ba fix(agent-preset): replace per-file backups with folder snapshots`
   - 备份能力保留，但当时仍服务于 planner/queue 流程。

旧方案的主要问题：

1. 升级依赖 Gateway 与 RPC 可用性。
2. 冲突处理需要人工选择，启动期状态不稳定。
3. `SOUL.md` 的 capability append 和 `lawclaw-upgrade` skill 形成额外行为分支。
4. `queue.json`、`jobs/`、会话过滤等外围逻辑扩大了维护面。

## 3. 新方案总览

新方案改为：

1. 启动时先执行 provider migration。
2. 再执行 agent preset migration。
3. 迁移完成后再启动 Gateway。

升级过程完全本地化，不再依赖：

1. Gateway RPC
2. LLM / planner
3. `lawclaw-upgrade` skill
4. `queue.json`
5. 人工确认与聊天锁定

## 4. 升级时机

主进程初始化顺序调整为：

1. `runProviderStartupMigration()`
2. `runAgentPresetStartupMigration()`
3. `gatewayManager.start()`

这样做的原因：

1. 预设升级本质是本地文件同步，不需要等待 Gateway。
2. 启动前完成升级，可以确保 Gateway 启动时直接看到最新 workspace 与配置。
3. 删除队列和延迟执行后，状态模型更简单。

## 5. 升级判定模型

### 5.1 模式判定

迁移分为三种模式：

1. `bootstrap`
   - 本地不存在 `v_current` 快照，视为首次安装。
2. `noop`
   - 当前快照 hash 与新模板 hash 相同，且没有 `forceLawclawAgentPreset`。
3. `upgrade`
   - 已存在 `v_current`，且新模板 hash 与当前快照不同。

### 5.2 单文件判定规则

对每个 `manifest.workspaceFiles` 文件执行三方比较：

1. `baseOld`
   - `v_current/<source>`
2. `baseNew`
   - `v_update/<source>`
3. `userCurrent`
   - 用户 workspace 当前 `<target>`

判定规则如下：

1. `userCurrent === baseNew`
   - 记为 `noop`
2. `userCurrent === baseOld`
   - 记为 `overwrite`
3. `baseOld === undefined && userCurrent === undefined`
   - 记为 `create`
4. `baseOld === undefined && userCurrent === baseNew`
   - 记为 `noop`
5. 其他情况
   - 记为 `skip`

`skip` 代表用户本地已有修改，不自动覆盖。

## 6. 执行流程

### 6.1 bootstrap

1. 从资源目录同步 `v_update`
2. additive merge `configPatch`
3. 确保 `lawclaw-main` agent 配置存在且 workspace 固定为 `~/.openclaw/workspace-lawclaw-main`
4. 将模板文件直接写入 workspace
5. 将 `v_update` 提升为 `v_current`
6. 写入 `state.json`

### 6.2 upgrade

1. 从资源目录同步 `v_update`
2. 计算每个受管文件的 `noop / overwrite / create / skip`
3. 若存在会覆盖的已有文件，则先创建目录备份
4. 写入 `overwrite / create` 文件
5. additive merge `configPatch`
6. 将 `v_update` 提升为 `v_current`
7. 更新 `state.json`
8. 若存在 `skip` 文件，则状态记为 `warning`

### 6.3 noop

1. 不修改 workspace
2. 不修改 `v_current`
3. 状态设为 `idle`

## 7. 备份策略

### 7.1 触发条件

只有在 upgrade 中存在“覆盖已有本地文件”的场景时，才创建目录备份。

不会触发备份的场景：

1. 仅新建文件
2. 全部 `noop`
3. 全部 `skip`
4. 仅 `configPatch` merge

### 7.2 目录结构

备份目录位于：

`~/.LawClaw/agent-presets/backups/`

单次备份目录名称格式：

`<ISO时间戳>-<taskId>-<targetHash前8位>`

目录内包含：

1. `backup-meta.json`
2. `workspace/lawclaw-main/<target>` 形式的原始文件快照

## 8. 配置补丁策略

`configPatch` 沿用 additive merge 逻辑，但不再经过 planner。

策略如下：

1. `bootstrap` 时自动 merge
2. `upgrade` 时也自动 merge
3. 仅追加缺失项，不覆盖已有字段
4. merge 失败视为真实技术失败

## 9. 状态模型

状态收敛为四种：

1. `idle`
2. `running`
3. `warning`
4. `failed`

### 9.1 `warning`

出现条件：

1. 升级整体成功
2. 但存在 `skip` 文件

状态中会包含：

1. `skippedFiles`
2. `skippedTargets`
3. `message`

### 9.2 `failed`

出现条件：

1. manifest 非法
2. 模板文件缺失
3. 配置读写失败
4. 备份失败
5. 其他文件系统异常

失败时不提升 `v_current`，下次启动会再次尝试。

## 10. 删除与保留的部分

### 10.1 删除

1. planner / LLM merge
2. `lawclaw-upgrade` skill 下发
3. `append_capabilities`
4. `queue.json` 读写
5. `jobs/` 快照
6. `resolveConflict`
7. `retryNow`
8. 聊天输入锁定

### 10.2 保留

1. dedicated `lawclaw-main` workspace 约束
2. `v_update` / `v_current` 快照机制
3. `state.json`
4. 目录备份能力
5. 旧 migration session 过滤逻辑

## 11. 人工处理路径

当状态为 `warning` 时：

1. 聊天页展示非阻塞 warning banner
2. 用户可打开迁移产物目录
3. 手动对比：
   - `v_current`
   - `v_update`
   - 当前 workspace 文件

## 12. 排障建议

重点检查目录：

1. `~/.LawClaw/agent-presets/v_current`
2. `~/.LawClaw/agent-presets/v_update`
3. `~/.LawClaw/agent-presets/backups`
4. `~/.LawClaw/agent-presets/state.json`

若升级失败：

1. 先看日志中的 manifest/template 路径异常
2. 再看 `v_update` 是否完整同步
3. 最后检查 `openclaw.json` 是否可解析、可写入
