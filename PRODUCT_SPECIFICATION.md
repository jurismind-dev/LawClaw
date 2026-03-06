# 劳有钳 (LawClaw) 产品规格说明书（实现现状版）

> 本文档用于记录 LawClaw 当前版本的**实际实现状态**，作为开发、测试和产品沟通的基线文档。

**产品名称**：劳有钳 (LawClaw)  
**开发团队**：法义经纬 (Jurismind)  
**基于项目**：[ClawX](https://github.com/ValueCell-ai/ClawX) by ValueCell Team  
**版本**：0.1.16  
**最后更新**：2026-03-05

---

> **文档说明**：本规格为“实现快照”，仅描述当前代码中已实现能力；未实现内容会标注为“即将支持”或“需二次开发”，不代表路线图承诺。

---

## 目录

1. [产品概述](#1-产品概述)
2. [技术架构](#2-技术架构)
3. [页面架构总览](#3-页面架构总览)
4. [页面详细说明](#4-页面详细说明)
5. [组件库说明](#5-组件库说明)
6. [状态管理](#6-状态管理)
7. [国际化支持](#7-国际化支持)
8. [定制化指南](#8-定制化指南)

---

## 1. 产品概述

### 1.1 产品定位

LawClaw 是基于 Electron + OpenClaw Gateway 的桌面 AI 助手应用。当前版本重点提供：

- 首次启动图形化引导（Setup Wizard）
- AI Provider 配置、验证、默认切换
- 多频道接入配置（含 token 与 QR 两类流程）
- Chat 对话、流式输出、工具状态展示、附件发送
- LawClaw 会话强制绑定（仅允许 `agent:lawclaw-main:*`）
- Skills 浏览/启停/安装/卸载与技能配置
- 预置 Skills / Plugins 的清单式安装编排（Setup 首装 + 升级补装）
- Cron 定时任务管理
- 设置、更新与开发者工具入口

> 说明：法律场景专属能力（如法律模板中心、专用法律工具页）目前**未内置**，属于“需二次开发”范围。

### 1.2 目标用户

- 希望使用桌面化 AI 工作流的个人/团队用户
- 需要统一管理 Provider、Channel、Skill、Cron 的进阶用户
- 需要本地运行 OpenClaw Gateway 并进行可视化操作的开发/测试用户

### 1.3 当前版本核心价值

- **本地桌面体验**：无需命令行完成核心配置流程
- **可扩展架构**：Provider、Channel、Skill、Cron 均可配置与扩展
- **会话与路由可控**：LawClaw 对话会话与托管频道路由默认锁定到 `lawclaw-main`
- **可观测可调试**：Gateway 状态、日志、开发者控制台与 token 可视化
- **多语言支持**：界面支持 en / zh / ja 三语

---

## 2. 技术架构

### 2.1 双进程架构

```text
Electron Desktop App
├─ Main Process
│  ├─ 应用生命周期与窗口管理
│  ├─ Gateway 进程管理与 IPC 路由
│  ├─ Update 流程编排
│  ├─ PresetInstaller（预置 Skills / Plugins 安装状态机）
│  └─ 本地配置/密钥持久化（electron-store + OpenClaw 配置文件）
└─ Renderer Process (React)
   ├─ 页面与组件渲染
   ├─ Zustand 状态管理
   ├─ i18n 多语言
   └─ 与 Main Process 通过 IPC 通信

OpenClaw Gateway
├─ chat / sessions / skills / cron RPC
└─ 频道状态与事件上报
```

> 安全口径（现状）：Provider API Key 当前存储于本地 `electron-store`（明文），并同步写入 `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`（当前主流程涉及 `main` 与 `lawclaw-main`）供 Gateway 使用；当前未接入操作系统级密钥管理服务。

### 2.2 技术栈

| 层级 | 技术（当前实现） |
|------|------------------|
| 运行时 | Electron `^40.6.0` |
| UI 框架 | React `^19.2.4` + TypeScript `^5.9.3` |
| 样式系统 | Tailwind CSS `^3.4.19` + shadcn/ui |
| 状态管理 | Zustand `^5.0.11` |
| 动画 | Framer Motion `^12.34.2` |
| 图标 | Lucide React `^0.563.0` |
| 国际化 | i18next `^25.8.11` + react-i18next `^16.5.4` |
| 构建 | Vite `^7.3.1` + electron-builder `^26.8.1` |
| 测试 | Vitest + Testing Library + jsdom（另有 Playwright e2e 脚本） |

### 2.3 LawClaw 与既有 OpenClaw 兼容策略（最小侵入）

**状态：已实施**

为兼容用户已有 OpenClaw 环境并降低配置扰动，LawClaw 在模型默认值、会话键与频道路由上采用“专用 Agent 定向写入 + 应用层强制约束”：

- LawClaw 仅对 `lawclaw-main` 维护默认模型（默认值：`jurismind/kimi-k2.5`）
- 不主动覆盖全局 `agents.defaults.model`（避免影响用户既有主 Agent 与其他 Agent）
- 启动迁移会强制 `lawclaw-main.workspace = ~/.openclaw/workspace-lawclaw-main`，确保专用 Agent 与主工作区隔离
- 预设迁移支持 `bootstrap` 模式：当本地缺少当前快照时直接完成预设安装与状态落盘，避免首次启动进入冲突确认队列
- 启动迁移仅做缺失补齐：当 `lawclaw-main.model.primary` 缺失时自动补齐；若用户已显式配置则保持原值
- Provider 默认切换（Setup/Settings）仅更新 `lawclaw-main.model.primary`，不写全局默认模型
- Gateway 启动参数默认不附带 `--dev`（仅保留 `--allow-unconfigured`），避免落入 dev profile 引发 `agent:dev:*` 会话漂移
- IPC 层会话键规范化：`gateway:rpc` 与 `chat:sendWithMedia` 收到非 `agent:lawclaw-main:*` 的 `sessionKey` 时，统一回落到 `agent:lawclaw-main:main`
- 会话可见性收敛：`sessions.list` 在应用层仅回传 `agent:lawclaw-main:*`；历史非 lawclaw 会话保留在网关存储但在 UI 隐藏
- 频道路由托管：仅对“通过 LawClaw UI 成功保存”的频道强制绑定到 `lawclaw-main`（写入 `lawclawManagedChannels` 并维护唯一 binding）

兼容性边界：

- 仅 `lawclaw-main` 的工作区会执行强一致修正；`agents.defaults` 与其他 Agent 配置保持原状
- 对旧版/残缺配置采取“增量修复”而非“整体重写”
- 仅 `lawclawManagedChannels` 内频道会被路由改写；未被 LawClaw UI 托管的频道保持原状
- 非 lawclaw 历史会话只做隐藏，不做数据删除

---

## 3. 页面架构总览

### 3.1 页面路由

应用使用 `HashRouter`。逻辑路由如下：

- `/setup/*` → 初始设置向导
- `/upgrade-installing` → 升级预置组件安装页（阻塞页）
- `/` → Chat（主对话页）
- `/dashboard` → Dashboard
- `/channels` → Channels
- `/skills` → Skills
- `/cron` → Cron
- `/settings/*` → Settings

补充行为：

- 当 `setupComplete=false` 时，应用会自动跳转到 `/setup`
- 当 `setupComplete=true` 且 `presetInstall:getStatus.pending=true` 时，应用会自动跳转到 `/upgrade-installing`
- 主进程支持 `--force-setup` 或 `FORCE_SETUP=true` 强制进入 setup

### 3.2 页面层级关系

```text
App
├─ /setup/* -> Setup
│  ├─ Welcome
│  ├─ Runtime
│  ├─ Provider
│  ├─ Channel (optional)
│  ├─ Installing
│  └─ Complete
├─ /upgrade-installing -> UpgradeInstalling
└─ MainLayout
   ├─ TitleBar
   ├─ Sidebar
   └─ Content
      ├─ /
      ├─ /dashboard
      ├─ /channels
      ├─ /skills
      ├─ /cron
      └─ /settings/*
```

---

## 4. 页面详细说明

### 4.1 Setup (初始设置向导)

**文件位置**：`src/pages/Setup/index.tsx`

Setup 当前保留 6 步流程：Welcome → Runtime → Provider → Channel → Installing → Complete。

#### 4.1.1 Welcome (欢迎页)

- 展示品牌信息与功能简介
- 可直接切换语言，语言来源为 `SUPPORTED_LANGUAGES`（en / zh / ja）

#### 4.1.2 Runtime (环境检查)

- Node.js：前端固定标记为可用
- OpenClaw：通过 `openclaw:status` 检查 package/built/version/路径
- Gateway：读取 store 状态，支持手动启动
- 支持查看最近日志与打开日志目录

#### 4.1.3 Provider (AI 供应商配置)

- 使用统一 Provider 元数据驱动 UI，支持 11 种类型：
  - `jurismind`
  - `moonshot_code_plan`
  - `glm_code_plan`
  - `anthropic`
  - `openai`
  - `google`
  - `openrouter`
  - `moonshot`
  - `siliconflow`
  - `ollama`
  - `custom`
- 按 Provider 类型动态显示字段：API Key / Base URL / Model ID
- 支持实时验证 `provider:validateKey`
- 保存时执行：`provider:save` + `provider:setDefault`

#### 4.1.4 Channel (频道连接，可选)

- 该步骤可跳过，不阻塞 setup 完成
- 展示主频道集合：`jurismind`、`feishu`、`telegram`、`discord`、`whatsapp`
- 当前仅展示 `connectionType=token` 的频道配置入口
- `jurismind` 在元数据中为 `comingSoon=true`，在 UI 中不可选择
- 对 token 频道支持：读取历史表单值 → 凭证校验 → 保存配置

#### 4.1.5 Installing (组件安装)

- 该步骤按“环境准备 + 预置清单安装 + 可选 QQ 插件兜底”执行：
  1. 调用 `uv:install-all`，完成 bundled uv 校验与托管 Python 安装
  2. 调用 `presetInstall:getStatus` 读取预置清单（manifest）并渲染安装项
  3. 调用 `presetInstall:run({ phase: 'setup' })` 执行预置 Skills / Plugins 安装
  4. 如本次 Setup 选择了 QQ 频道，执行 `openclaw:installBundledPlugin('qqbot')` 兜底安装 QQ 插件
- 安装进度来自主进程事件 `presetInstall:progress`，并在 UI 中逐项展示状态（pending / installing / completed / failed）
- 失败支持“重试安装”，成功后将安装项名称传递到 Complete 页面展示
- 对预置 skill，安装后会写入 `~/.openclaw/skills/<skillId>/.clawhub/origin.json`，并同步 `~/.openclaw/.clawhub/lock.json`，以便在 Skills 页按 JurisHub 来源识别并执行卸载管理

#### 4.1.6 Complete (完成确认)

- 显示选中的 Provider
- 显示 Installing 步骤记录的组件列表
- 显示当前 Gateway 状态
- 点击完成后写入 `setupComplete=true` 并进入主页面

#### 4.1.7 Setup 后续升级拦截策略

- Setup 完成后，App 启动时会调用 `presetInstall:getStatus`
- 若 `pending=true`，则从任意业务路由重定向到 `/upgrade-installing`
- `presetInstall:statusChanged` 事件会实时触发前端路由纠偏：
  - 待安装：保持在升级安装页
  - 已完成/已跳过：退出升级安装页并回到 `/`

---

### 4.2 Dashboard (仪表盘)

**文件位置**：`src/pages/Dashboard/index.tsx`

#### 4.2.1 状态卡片

- Gateway 状态（state / port / pid）
- Channels 连接统计
- Skills 启用统计
- Gateway 运行时长（uptime）

#### 4.2.2 快捷操作

- 跳转 Channels
- 跳转 Skills
- 跳转 Chat（`/`）
- 跳转 Settings
- 开发者控制台入口（仅 `devModeUnlocked=true` 显示）

#### 4.2.3 已连接频道列表

- 列出最多 5 个频道
- 显示频道名称、类型、状态

#### 4.2.4 已启用技能标签

- 展示已启用技能标签（最多 12 个）
- 超出数量显示 “+N”

---

### 4.3 Chat (AI 对话界面)

**文件位置**：`src/pages/Chat/index.tsx`

**子组件**：

- `ChatToolbar.tsx`
- `ChatMessage.tsx`
- `ChatInput.tsx`
- `message-utils.ts`

#### 4.3.1 消息与流式区域

- 历史消息加载：`sessions.list` + `chat.history`
- 流式显示：支持 text/thinking/tool_use/tool_result/image
- 工具执行状态条：运行中、完成、错误、耗时、摘要
- 可切换“显示/隐藏思考过程”

#### 4.3.2 输入与发送

- 多行输入：Enter 发送、Shift+Enter 换行
- 发送中按钮切换为 Stop（可中止 `chat.abort`）

#### 4.3.3 附件能力（已实现）

- 支持三种入口：
  - 文件选择器
  - 粘贴文件（clipboard）
  - 拖拽文件（drag & drop）
- 附件先经 `file:stage` / `file:stageBuffer` 暂存到本地目录，再发送
- 图片可预览，非图片显示文件卡片

#### 4.3.4 `chat:sendWithMedia` 媒体发送策略

- 图像文件走“双通道”：
  - 作为 base64 `attachments` 发送（视觉模型可直接消费）
  - 同时在消息文本附加 `[media attached: ...]` 路径引用
- 非图像文件以路径引用形式附加在消息文本中

#### 4.3.5 会话锁定与迁移交互（已实施）

- 默认会话固定为 `agent:lawclaw-main:main`，新会话键固定为 `agent:lawclaw-main:session-<timestamp>`
- `loadSessions` 与 `switchSession` 仅接受 `agent:lawclaw-main:*`；非 lawclaw key 会回落默认会话
- `gateway:rpc(sessions.list)` 仅返回 lawclaw 会话；包含 `sessionKey` 的 RPC 参数会在 IPC 层自动归一化
- 当 Agent 预设迁移进入 `awaiting_confirmation` 时，Chat 顶部显示冲突处理提示，输入框临时禁用直到用户确认

---

### 4.4 Channels (频道管理)

**文件位置**：`src/pages/Channels/index.tsx`

#### 4.4.1 统计卡片

- 总频道数
- 已连接数
- 未连接数

#### 4.4.2 已配置频道列表

- 卡片展示频道图标、名称、类型、状态、错误
- 支持删除频道配置

#### 4.4.3 主展示频道类型

主展示列表来自 `getPrimaryChannels()`：

- `jurismind`（即将支持）
- `feishu`
- `telegram`
- `discord`
- `whatsapp`

补充：`CHANNEL_META` 中仍定义了 `signal/imessage/matrix/line/msteams/googlechat/mattermost` 等类型，用于元数据扩展，但当前主页面不全部展示。

#### 4.4.4 添加频道对话框

- Token 类型频道：
  - 输入配置字段
  - 调用 `channel:validateCredentials` 校验
  - 保存 `channel:saveConfig`
  - 本地 addChannel 后重启 Gateway
- WhatsApp（QR）频道：
  - 请求二维码 `channel:requestWhatsAppQr`
  - 监听 `channel:whatsapp-qr/success/error`
  - 成功后保存配置并重启 Gateway

#### 4.4.5 LawClaw 管理频道绑定策略（已实施）

- `channel:saveConfig` 成功后，将标准化 `channelType` 记录到 `lawclawManagedChannels`
- 对托管频道写入路由时会先清理该频道已有 binding，再写入唯一规则：`agentId=lawclaw-main` + `match.accountId='*'`
- `channel:deleteConfig` 删除托管频道时，会同步移除其 `lawclaw-main` 绑定并从管理集合中剔除
- 未被 LawClaw UI 托管的频道不会被自动改写（不做启动时全量回填）

---

### 4.5 Skills (技能管理)

**文件位置**：`src/pages/Skills/index.tsx`

#### 4.5.1 标签页

- `已安装`（Installed）
- `市场`（Marketplace）

> 备注：Bundles 页签目前是注释状态，未启用。

#### 4.5.2 已安装技能

- 搜索与来源筛选（all / built-in / marketplace）
- 支持启用/禁用
- 非 core 且非 built-in 的技能支持卸载
- 可打开本地 skills 目录

#### 4.5.3 技能详情对话框

- 信息页：描述、版本、作者、来源
- 配置页：
  - API Key
  - Environment Variables（可增删键值）
- 保存通过 `skill:updateConfig` 写入，再刷新技能列表

#### 4.5.4 技能市场

- 通过 ClawHub 搜索技能
- 支持安装 / 卸载
- 安装后会尝试自动启用

---

### 4.6 Cron (定时任务)

**文件位置**：`src/pages/Cron/index.tsx`

#### 4.6.1 统计卡片

- 总任务数
- 活跃任务数
- 暂停任务数
- 最近失败任务数

#### 4.6.2 任务卡片

- 显示任务名、计划描述、启用状态
- 显示消息预览、目标频道、上次执行、下次执行
- 支持操作：立即执行、编辑、删除、启停切换

#### 4.6.3 创建/编辑任务对话框

- 字段：任务名、消息、计划、目标频道、启用开关
- 计划支持预设与自定义 cron 表达式
- 兼容 Gateway `CronSchedule` 对象解析展示
- 选中 Discord 时要求填写额外 `channelId`

---

### 4.7 Settings (系统设置)

**文件位置**：`src/pages/Settings/index.tsx`

#### 4.7.1 外观设置

- 主题：light / dark / system
- 语言：en / zh / ja

#### 4.7.2 AI 供应商设置（ProvidersSettings）

- Provider 列表管理（新增、删除、设默认）
- 编辑 API Key / Base URL / Model ID（按类型）
- 提交前可执行 API Key 校验

#### 4.7.3 Gateway 设置

- 状态、端口、重启
- 应用日志查看与打开目录
- 预设迁移产物目录快捷入口（`agentPresetMigration:getArtifactsDir`）
- 开机自动启动 Gateway 开关

#### 4.7.4 更新设置（UpdateSettings）

- 检查、下载、安装更新
- 下载进度与版本说明展示
- 自动下载开启后，下载完成进入自动安装倒计时
- 支持取消自动安装倒计时

#### 4.7.5 高级设置

- 开发者模式开关（`devModeUnlocked`）

#### 4.7.6 开发者设置（仅开发者模式）

- 打开 Gateway 控制台 URL
- 加载并复制 Gateway token
- 查看并复制 OpenClaw CLI 命令
- macOS 非开发环境支持安装 `openclaw` 命令

#### 4.7.7 关于

- 应用信息、当前版本
- 文档与 GitHub 链接

### 4.8 UpgradeInstalling (升级预置组件安装页)

**文件位置**：`src/pages/UpgradeInstalling/index.tsx`

#### 4.8.1 触发条件

- `setupComplete=true` 且 `presetInstall:getStatus.pending=true`
- 典型场景：
  - 首次 setup 完成后，预置清单发生版本变化
  - 上一次预置安装失败（`blockedReason=last-failed`）
  - 启用 `FORCE_PRESET_SYNC=true` 触发强制重跑

#### 4.8.2 页面行为

- 进入页面后自动执行 `presetInstall:run({ phase: 'upgrade' })`
- 通过 `presetInstall:progress` 渲染逐项进度与状态
- 提供两类人工操作：
  - 重试：`presetInstall:retry({ phase: 'upgrade' })`
  - 跳过当前版本：`presetInstall:skipCurrent`（将当前 manifest hash 记录到 skip 列表）
- 成功或跳过后退出阻塞页并返回 `/`

---

## 5. 组件库说明

### 5.1 UI 基础组件（`src/components/ui/`）

| 组件 | 文件 |
|------|------|
| Badge | `badge.tsx` |
| Button | `button.tsx` |
| Card | `card.tsx` |
| Input | `input.tsx` |
| Label | `label.tsx` |
| Progress | `progress.tsx` |
| Select | `select.tsx` |
| Separator | `separator.tsx` |
| Switch | `switch.tsx` |
| Tabs | `tabs.tsx` |
| Textarea | `textarea.tsx` |
| Tooltip | `tooltip.tsx` |

### 5.2 布局组件（`src/components/layout/`）

| 组件 | 文件 | 用途 |
|------|------|------|
| MainLayout | `MainLayout.tsx` | 主体布局容器 |
| Sidebar | `Sidebar.tsx` | 左侧导航 |
| TitleBar | `TitleBar.tsx` | 自定义标题栏 |

### 5.3 通用组件（`src/components/common/`）

| 组件 | 文件 | 用途 |
|------|------|------|
| ErrorBoundary | `ErrorBoundary.tsx` | 错误边界 |
| LoadingSpinner | `LoadingSpinner.tsx` | 加载动画 |
| StatusBadge | `StatusBadge.tsx` | 状态标签 |

### 5.4 设置相关组件（`src/components/settings/`）

| 组件 | 文件 | 用途 |
|------|------|------|
| ProvidersSettings | `ProvidersSettings.tsx` | Provider 管理 |
| UpdateSettings | `UpdateSettings.tsx` | 更新状态与操作 |

---

## 6. 状态管理

### 6.1 Zustand Stores（`src/stores/`）

| Store | 文件 | 主要职责 |
|-------|------|----------|
| chat | `chat.ts` | 对话消息、流式状态、会话、附件映射 |
| channels | `channels.ts` | 频道状态、拉取、删除、连接辅助 |
| cron | `cron.ts` | 定时任务 CRUD 与触发 |
| gateway | `gateway.ts` | Gateway 状态、RPC、事件转发 |
| agentPresetMigration | `agent-preset-migration.ts` | 预设迁移状态同步、聊天锁定、冲突处理与重试 |
| providers | `providers.ts` | Provider 列表、密钥、默认项、校验 |
| settings | `settings.ts` | 主题、语言、启动/更新/开发者开关、setup 状态 |
| skills | `skills.ts` | 技能列表、市场搜索、安装/卸载、启停 |
| update | `update.ts` | 更新状态、下载进度、倒计时 |

### 6.2 关键状态说明

#### gateway store（核心字段）

```typescript
interface GatewayStatus {
  state: 'stopped' | 'starting' | 'running' | 'error' | 'reconnecting';
  port: number;
  pid?: number | null;
  error?: string | null;
  connectedAt?: number | null;
}
```

#### settings store（核心字段）

```typescript
interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  language: string; // 实际由 SUPPORTED_LANGUAGES 驱动（en/zh/ja）
  gatewayAutoStart: boolean;
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
  devModeUnlocked: boolean;
  setupComplete: boolean;
}
```

#### 主进程 AppSettings（核心新增字段）

```typescript
interface AppSettings {
  // ...省略已有字段
  lawclawManagedChannels: string[];
}
```

- 含义：记录“通过 LawClaw UI 成功保存过配置”的频道类型集合（标准化小写）
- 用途：仅对该集合中的频道执行 `lawclaw-main` 路由绑定维护，避免影响用户未托管频道

#### 预置安装状态（主进程 + IPC）

```typescript
interface PresetInstallStatusResult {
  pending: boolean;
  running: boolean;
  forceSync: boolean;
  manifestHash: string;
  presetVersion: string;
  blockedReason?: 'needs-run' | 'last-failed';
  plannedItems: Array<{ id: string; kind: 'skill' | 'plugin'; targetVersion: string }>;
}
```

- 状态来源：`electron/utils/preset-installer.ts` + `electron/utils/preset-install-state.ts`
- 前端消费点：
  - Setup 安装页（phase=`setup`）
  - UpgradeInstalling 升级阻塞页（phase=`upgrade`）
- 事件通道：`presetInstall:progress`、`presetInstall:statusChanged`

---

## 7. 国际化支持

### 7.1 支持语言

- English (`en`)
- 中文 (`zh`)
- 日本語 (`ja`)

### 7.2 i18n 资源结构

```text
src/i18n/
├─ index.ts
└─ locales/
   ├─ en/
   │  ├─ common.json
   │  ├─ setup.json
   │  ├─ upgrade.json
   │  ├─ dashboard.json
   │  ├─ chat.json
   │  ├─ channels.json
   │  ├─ skills.json
   │  ├─ cron.json
   │  └─ settings.json
   ├─ zh/
   │  ├─ common.json
   │  ├─ setup.json
   │  ├─ upgrade.json
   │  ├─ dashboard.json
   │  ├─ chat.json
   │  ├─ channels.json
   │  ├─ skills.json
   │  ├─ cron.json
   │  └─ settings.json
   └─ ja/
      ├─ common.json
      ├─ setup.json
      ├─ upgrade.json
      ├─ dashboard.json
      ├─ chat.json
      ├─ channels.json
      ├─ skills.json
      ├─ cron.json
      └─ settings.json
```

### 7.3 使用方式

```tsx
import { useTranslation } from 'react-i18next';

const { t } = useTranslation('chat');
// 示例：t('welcome.title')
```

---

## 8. 定制化指南

> 本章仅说明当前版本可直接改动点与需二次开发点。

### 8.1 品牌定制

#### 8.1.1 需要修改的文件

**状态：已支持**

| 文件 | 可定制内容 |
|------|------------|
| `package.json` | name / description / author |
| `README.md` / `README.zh-CN.md` | 文案与对外说明 |
| `src/assets/logo.svg` | 应用 logo |
| `resources/` | 打包图标资源 |
| `electron-builder.yml` | 应用标识与打包配置 |
| `src/components/layout/TitleBar.tsx` | Windows/Linux 标题栏文案与图标 |

#### 8.1.2 应用标题和图标

**状态：已支持**

- 窗口标题栏文案可在 `TitleBar` 组件中调整
- 打包图标由 `resources/` 与 `electron-builder.yml` 管理

### 8.2 功能定制

#### 8.2.1 添加法律专用功能页/模块

**状态：需二次开发（未内置）**

建议方式：

1. 在 `src/pages/` 新增业务页面（如 `LegalTools`）
2. 在 `src/App.tsx` 与 `Sidebar.tsx` 注册路由与导航
3. 根据需求接入 Gateway RPC 或本地服务

#### 8.2.2 修改系统提示词/业务策略

**状态：需二次开发（未内置）**

- 当前代码未提供“法律专用系统提示词管理页”
- 需在 Gateway/OpenClaw 配置层实现并接入设置页面

### 8.3 界面定制

#### 8.3.1 主题与视觉变量

**状态：已支持**

- 通过全局样式与主题变量调整视觉风格
- 可配合 `settings.theme` 提供多主题策略

#### 8.3.2 侧边栏导航调整

**状态：已支持**

- `src/components/layout/Sidebar.tsx` 中可调整导航项顺序、名称、图标与可见性

### 8.4 技能与插件预置定制

#### 8.4.1 预置安装清单（manifest）

**状态：已支持**

- 安装项由 `resources/preset-installs/manifest.json` 定义，支持 `skill` 与 `plugin` 两类
- 每个安装项需提供：`id`、`targetVersion`、`artifactPath`、`sha256`（可选 `displayName`、`installMode`）
- 当 `kind=skill` 时，`id` 必须是 JurisHub 商店 highlighted 技能 slug（构建阶段强校验，失败即阻断）
- Setup 与 Upgrade 均复用同一清单；是否触发安装由 manifest hash 与本地状态文件共同决定
- 当前仓库默认清单为 `items: []`（框架已接入，默认无内置预置项）

#### 8.4.2 升级安装阻塞页策略

**状态：已支持**

- 当 `presetInstall:getStatus.pending=true` 时，Setup 完成用户会被重定向至 `/upgrade-installing`
- 页面支持重试（`presetInstall:retry`）与跳过当前版本（`presetInstall:skipCurrent`）
- 若需关闭阻塞策略，可在应用层修改 `resolvePresetInstallRedirectPath()` 逻辑（`src/lib/preset-install-guard.ts`）

#### 8.4.3 技能市场集成

**状态：已支持（ClawHub） / 私有市场需二次开发**

- 当前已接入 ClawHub 搜索与安装流程
- 若需私有法律技能市场，需二次开发市场 API 与鉴权流程

### 8.5 预置产物与 QQBot 打包策略

**状态：已实施**

预置产物校验：

- 新增 `pnpm run bundle:preset-artifacts`，在构建/打包流程中校验 `resources/preset-installs/manifest.json`
- 校验内容包括：schema、去重、artifactPath 越界、artifact 存在性、SHA256 一致性、`kind=skill` 的 JurisHub highlighted 约束（fail-closed）

QQBot 插件包（`@sliverp/qqbot`，`resources/plugins/qqbot/*.tgz`）采用“构建时自动下载”策略：

- tgz 不作为源码资产入库（默认忽略，不参与版本管理）
- `pnpm package*` 流程在打包前自动下载并写入 `resources/plugins/qqbot/`
- 安装包产物仍会包含插件安装所需内容，普通 clone 用户可直接执行打包命令

离线/受限网络构建说明：

- 若 CI/内网无法访问 npm registry，需额外配置镜像或内部制品缓存作为兜底
- 该兜底方案不属于当前默认实现

---

## 附录

### A. 文件目录结构（核心）

```text
ClawX/
├─ electron/
│  ├─ main/
│  │  ├─ index.ts
│  │  ├─ ipc-handlers.ts
│  │  ├─ menu.ts
│  │  ├─ tray.ts
│  │  └─ updater.ts
│  ├─ gateway/
│  │  ├─ manager.ts
│  │  ├─ protocol.ts
│  │  └─ clawhub.ts
│  ├─ preload/
│  └─ utils/
│     ├─ preset-install-state.ts
│     └─ preset-installer.ts
├─ src/
│  ├─ components/
│  │  ├─ ui/
│  │  ├─ layout/
│  │  ├─ common/
│  │  └─ settings/
│  ├─ pages/
│  │  ├─ Setup/
│  │  ├─ Dashboard/
│  │  ├─ Chat/
│  │  ├─ Channels/
│  │  ├─ Skills/
│  │  ├─ Cron/
│  │  ├─ UpgradeInstalling/
│  │  └─ Settings/
│  ├─ stores/
│  │  ├─ agent-preset-migration.ts
│  │  ├─ chat.ts
│  │  ├─ channels.ts
│  │  ├─ cron.ts
│  │  ├─ gateway.ts
│  │  ├─ providers.ts
│  │  ├─ settings.ts
│  │  ├─ skills.ts
│  │  └─ update.ts
│  ├─ lib/
│  ├─ types/
│  │  └─ preset-install.ts
│  └─ i18n/
├─ resources/
│  └─ preset-installs/
├─ scripts/
│  └─ bundle-preset-artifacts.mjs
└─ tests/
```

### B. 开发命令

```bash
# 初始化（依赖 + bundled uv）
pnpm run init

# 开发
pnpm dev

# 代码质量
pnpm lint
pnpm typecheck

# 测试
pnpm test
pnpm test:e2e

# 构建
pnpm run bundle:preset-artifacts
pnpm run build:vite
pnpm build
pnpm package:win
pnpm package:mac
pnpm package:linux
```

> 说明：仓库当前测试主流程以 Vitest 单测为主，`test:e2e` 为可选补充脚本。

### C. 相关链接

- [ClawX GitHub](https://github.com/ValueCell-ai/ClawX)
- [Electron 文档](https://www.electronjs.org/docs)
- [React 文档](https://react.dev/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Zustand](https://github.com/pmndrs/zustand)
