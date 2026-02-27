# LawClaw Agent Preset Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 LawClaw 启动时执行版本化 Agent 预设迁移，支持“只加不破”的升级策略与 `--force-main-agent-preset` 强制覆盖主 Agent。

**Architecture:** 在 Electron 主进程启动链路中插入 `runAgentPresetStartupMigration`。迁移引擎读取 `resources/agent-presets` 的版本化清单与模板，执行配置增量合并、工作区文件迁移、能力块追加与状态落盘。通过单元测试覆盖首装、升级增量、用户改动保护与强制覆盖备份。

**Tech Stack:** TypeScript、Electron 主进程、Vitest、Node fs/path/os/crypto。

---

### Task 1: 失败测试（迁移核心行为）

**Files:**
- Create: `tests/unit/agent-preset-migration.test.ts`
- Modify: `package.json`（仅在缺依赖时）

1. 写“首装迁移创建默认文件与状态”的失败测试。
2. 写“升级仅追加新增能力/新增 agent，不覆盖用户改动”的失败测试。
3. 写“强制覆盖 main agent 并备份”的失败测试。
4. 运行 `pnpm test tests/unit/agent-preset-migration.test.ts`，确认失败原因正确。

### Task 2: 最小实现（迁移引擎）

**Files:**
- Create: `electron/utils/openclaw-json5.ts`
- Create: `electron/utils/agent-preset-migration.ts`

1. 实现 JSON5 读写工具，支持 openclaw.json 不存在时的空配置。
2. 实现 manifest/版本读取、状态读取与落盘。
3. 实现配置补丁“只加不改”合并（对象递归 + 数组按 id 合并）。
4. 实现文件迁移策略（缺失即创建、冲突保留、能力块追加）。
5. 实现 `forceMainAgentPreset` 覆盖与备份。

### Task 3: 启动接入与预设资源

**Files:**
- Modify: `electron/main/index.ts`
- Create: `resources/agent-presets/manifest.json`
- Create: `resources/agent-presets/versions/v1/*`
- Create: `resources/agent-presets/versions/v2/*`

1. 新增启动参数解析：`--force-main-agent-preset` 与 `FORCE_MAIN_AGENT_PRESET`。
2. 在 provider 迁移之后、gateway 启动前执行 agent 迁移。
3. 补齐最小可用的 main + 专业 agent + sub-agent 配置模板。

### Task 4: 绿色验证与回归

**Files:**
- Modify: `tests/unit/agent-preset-migration.test.ts`（若需补边界）

1. 跑新测试文件并修复直至通过。
2. 跑 `pnpm typecheck`。
3. 跑 `pnpm test` 做回归验证。
4. 确认迁移日志与统计输出可读。
