# 预置 Skills 与 Plugins 操作手册

## 1. 目标与范围

本手册用于维护 LawClaw 的预置组件安装能力，覆盖：

- 预置清单（manifest）维护
- 产物路径与哈希校验
- Setup 首装与 Upgrade 补装行为
- 失败重试、跳过与强制同步

不包含：ClawHub 市场技能安装流程（该能力独立于预置清单）。

---

## 2. 核心文件与目录

- 预置清单：`resources/preset-installs/manifest.json`
- 构建校验脚本：`scripts/bundle-preset-artifacts.mjs`
- 主进程状态与安装器：
  - `electron/utils/preset-install-state.ts`
  - `electron/utils/preset-installer.ts`
- 前端升级阻塞页：`src/pages/UpgradeInstalling/index.tsx`
- 前端路由守卫：`src/lib/preset-install-guard.ts`
- 类型定义：`src/types/preset-install.ts`

运行时状态文件：

- `~/.LawClaw/preset-installs/state.json`

预置组件目标安装位置：

- Skill：`~/.openclaw/skills/<skillId>`
- Plugin：由 OpenClaw CLI 安装到 `~/.openclaw/extensions/<pluginId>` 等受管路径

---

## 3. manifest 结构说明

`manifest.json` 结构示例：

```json
{
  "schemaVersion": 1,
  "presetVersion": "2026.03.05.1",
  "items": [
    {
      "kind": "skill",
      "id": "example-skill",
      "displayName": "Example Skill",
      "targetVersion": "1.2.3",
      "artifactPath": "skills/example-skill",
      "sha256": "64位小写十六进制哈希",
      "installMode": "dir"
    }
  ]
}
```

字段约束：

- `schemaVersion`：当前固定为 `1`
- `presetVersion`：预置版本号（建议随发布递增）
- `items[].kind`：`skill` 或 `plugin`
- `items[].id`：同一 `kind` 下唯一
- `items[].artifactPath`：相对 `resources/preset-installs/` 的路径，禁止越界
- `items[].sha256`：产物哈希（64 位 hex）
- `items[].installMode`：可选，`dir` 或 `tgz`（不填时按后缀自动推断）
- 当 `items[].kind=skill` 时，`id` 必须对应 JurisHub 商店“精选（highlighted）”技能；该约束由 `pnpm run bundle:preset-artifacts` 强制校验（fail-closed）。

当前仓库默认清单内置 1 个 highlighted skill：`contract-review-jurismind@1.0.0`。

---

## 4. 新增/更新/删除预置项流程

### 4.1 新增/更新预置项（含 JurisHub 精选校验）

1. 准备产物目录或 tgz 包，放入 `resources/preset-installs/` 下。
2. 计算产物 SHA256（目录会按“文件路径+内容”聚合计算）。
3. 更新 `manifest.json` 的 `presetVersion` 与对应 `items`。
4. 执行校验：

```bash
pnpm run bundle:preset-artifacts
```

> 说明：该命令除校验 `sha256/artifactPath` 外，还会对 `kind=skill` 的条目调用 JurisHub API 校验是否为 highlighted。若网络错误、接口异常或 skill 非 highlighted，会直接失败并阻断发布流程。

5. 执行相关测试：

```bash
pnpm test -- tests/unit/preset-installer.test.ts
pnpm typecheck
```

### 4.2 从预置列表删除 Skill/Plugin（保留用户已安装包）

适用目标：包不再作为“预置项”下发，但不删除用户机器上已安装包。

1. 打开 `resources/preset-installs/manifest.json`。
2. 在 `items` 中删除目标项（按 `kind + id` 精确匹配）。
3. 递增 `presetVersion`（建议随发布版本递增）。
4. 执行校验与验证：
   - `pnpm run bundle:preset-artifacts`
   - `pnpm typecheck`
   - （可选）`pnpm test -- tests/unit/preset-installer.test.ts`
5. 发布后预期：
   - 新安装/新同步用户：不会再预装该包。
   - 已安装该包的用户：默认保留，不会被自动卸载。

注意：
要满足“仅停止预装、不删除已安装”的目标，请不要启用
`FORCE_PRESET_SYNC=true` 或启动参数 `--force-preset-sync`。

---

## 5. 运行时行为

### 5.1 Setup 首装阶段（phase=setup）

Setup 的 Installing 步骤执行顺序：

1. `uv:install-all`：准备 uv 与托管 Python
2. `presetInstall:getStatus`：读取安装计划
3. `presetInstall:run({ phase: 'setup' })`：安装预置项
4. 如用户配置 QQ 频道，再执行 `openclaw:installBundledPlugin('qqbot')` 兜底

进度事件：

- `presetInstall:progress`
- `presetInstall:statusChanged`

### 5.2 升级补装阶段（phase=upgrade）

当 `setupComplete=true` 且 `presetInstall:getStatus.pending=true` 时：

- 前端会跳转到 `/upgrade-installing`
- 页面自动触发 `presetInstall:run({ phase: 'upgrade' })`
- 用户可选择：
  - 重试：`presetInstall:retry({ phase: 'upgrade' })`
  - 跳过当前版本：`presetInstall:skipCurrent`

---

## 6. 状态判定规则

`pending=true` 的常见原因：

- manifest hash 与本地 `state.currentManifestHash` 不一致（新版本/新清单）
- 上次同一 hash 的结果是 `failed`
- 开启强制同步（`FORCE_PRESET_SYNC=true` 或启动参数 `--force-preset-sync`）

`pending=false` 的常见原因：

- 当前 hash 已成功处理
- 用户对当前 hash 执行了 skip（记录在 `state.skipHashes`）
- 当 manifest 删除某个预置项并发布后，manifest hash 会变化并触发同步；
  在默认模式（未启用 `FORCE_PRESET_SYNC`）下，仅停止后续预装，不会清理本地已安装包。

---

## 7. 常见问题排查

### 7.1 `SHA256 mismatch`

- 检查 `manifest.json` 中 `sha256` 是否与实际产物一致
- 重新执行 `pnpm run bundle:preset-artifacts` 复核

### 7.2 `artifactPath escapes root directory`

- `artifactPath` 只能指向 `resources/preset-installs/` 内部
- 禁止 `../`、绝对路径等越界路径

### 7.3 插件安装失败

- 确认本地 OpenClaw CLI 可用
- 检查插件产物结构和 `installMode`
- 查看应用日志中 `presetInstall` / `openclaw` 相关报错

### 7.4 不希望阻塞升级页

- 临时：在升级页点击“跳过当前版本”
- 代码级：调整 `src/lib/preset-install-guard.ts` 的重定向规则

### 7.5 删除预置项后，为什么用户机器上包还在？

这是预期行为：删除预置项的目标是“停止后续预装”，不是“远程卸载用户本地包”。
如需真正卸载，应走单独卸载流程，不应通过删除 manifest 项实现。

### 7.6 为什么提示 “JurisHub highlighted validation failed”？

常见原因：

- 该 `skill id` 在 JurisHub 商店不是“精选（highlighted）”
- JurisHub 校验接口暂时不可用（超时、5xx、网络异常、返回格式异常）
- `id` 与商店 slug 不一致（必须精确匹配）

排查建议：

- 在 JurisHub 商店确认该 skill 是否带“精选”标签
- 检查构建环境网络连通性（可访问 `https://lawhub.jurismind.com/api/v1/search`）
- 复核 `manifest.json` 的 `id` 是否与商店 slug 完全一致

---

## 8. 发布前检查清单

- `manifest.json` 语义正确、版本号已更新
- `pnpm run bundle:preset-artifacts` 通过
- `pnpm typecheck` 通过
- 关键单测通过（至少 `preset-installer`、升级路由守卫相关）
- `PRODUCT_SPECIFICATION.md` 与本手册已同步更新
- 删除预置项时，已确认运行环境未启用 `FORCE_PRESET_SYNC` / `--force-preset-sync`。
- 若包含 `kind=skill` 预置项：已确认 `pnpm run bundle:preset-artifacts` 中 highlighted 校验通过，且不存在 API 异常被阻断的情况。
