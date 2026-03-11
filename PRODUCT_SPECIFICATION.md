# 劳有钳 (LawClaw) 产品规格说明书（实现现状版）

> 本文档用于记录 LawClaw 当前版本的**实际实现状态**，作为开发、测试和产品沟通的基线文档。

**产品名称**：劳有钳 (LawClaw)  
**开发团队**：法义经纬 (Jurismind)  
**基于项目**：ValueCell Team 上游实现
**应用版本**：0.1.16
**OpenClaw 运行时基线**：`openclaw@2026.3.8`
**最后更新**：2026-03-11

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

LawClaw 是基于 Electron + OpenClaw Gateway 的桌面 AI 助手应用，当前版本重点提供：

- 首次启动图形化引导（Setup Wizard）
- OpenClaw 运行时检查、Gateway 启动与日志查看
- AI Provider 配置、校验、OAuth/Jurismind 绑定与默认切换
- 多频道接入配置，覆盖 token 流程、Jurismind 绑定流程与 WhatsApp QR 流程
- Chat 对话、流式输出、工具调用状态、附件发送与会话收敛
- Skills 浏览、启停、安装、卸载、配置，以及 JurisHub 技能市场接入
- 预置安装清单（preset installs）与升级补装阻塞页
- 专用 Agent 预设模板迁移与工作区快照升级
- Cron 定时任务管理
- 设置、更新与开发者工具入口

当前 LawClaw 的专用 Agent 预设迁移已改为**应用启动阶段执行的确定性升级流程**，不再依赖交互式冲突确认。

> 说明：法律场景专属能力（如法律模板中心、专用法律工具页）目前**未内置**，属于“需二次开发”范围。

### 1.2 目标用户

- 希望使用桌面化 AI 工作流的个人与团队用户
- 需要统一管理 Provider、Channel、Skill、Cron 的进阶用户
- 需要本地运行 OpenClaw Gateway 并进行可视化操作的开发与测试用户
- 需要在 LawClaw 专用 Agent 与既有 OpenClaw 环境之间做兼容隔离的使用者

### 1.3 当前版本核心价值

- **本地桌面体验**：无需命令行即可完成核心配置、安装和日常使用
- **专用 Agent 隔离**：LawClaw 通过 `lawclaw-main` 与独立工作区承载专用运行时约束
- **升级行为可控**：预置安装与 Agent 模板升级均可观测，模板升级采用快照比较、覆盖前备份与冲突跳过策略
- **会话与路由收敛**：LawClaw UI 默认只操作 `agent:lawclaw-main:*` 会话，并仅托管 LawClaw 管理过的频道路由
- **技能生态接入**：已接入 JurisHub 市场，内置预置技能安装与来源识别

---

## 2. 技术架构

### 2.1 双进程架构

```text
Electron Desktop App
├─ Main Process
│  ├─ 应用生命周期与窗口管理
│  ├─ Provider 启动迁移
│  ├─ Agent 预设模板启动迁移（先于 Gateway 自动启动）
│  ├─ Gateway 进程管理与 IPC 路由
│  ├─ Update 流程编排
│  ├─ PresetInstaller（预置 Skills / Plugins 安装状态机）
│  └─ 本地配置/密钥持久化（electron-store + OpenClaw 配置文件）
└─ Renderer Process (React)
   ├─ 页面与组件渲染
   ├─ Zustand 状态管理
   ├─ i18n 多语言资源
   └─ 与 Main Process 通过 IPC 通信

OpenClaw Gateway
├─ chat / sessions / skills / cron RPC
└─ 频道状态与事件上报
```

> 安全口径（现状）：Provider API Key 当前存储于本地 `electron-store`，并同步写入 `~/.openclaw/agents/<agentId>/agent/auth-profiles.json` 供 Gateway 使用；当前主流程涉及 `main` 与 `lawclaw-main` 两套 auth profile。当前未接入操作系统级密钥管理服务。

### 2.2 技术栈

| 层级 | 技术（当前实现） |
|------|------------------|
| 运行时 | Electron `^40.6.0` |
| OpenClaw 基线 | `openclaw@2026.3.8` |
| UI 框架 | React `^19.2.4` + TypeScript `^5.9.3` |
| 路由 | `react-router-dom@^7.13.0`（`HashRouter`） |
| 样式系统 | Tailwind CSS `^3.4.19` + shadcn/ui |
| 状态管理 | Zustand `^5.0.11` |
| 动画 | Framer Motion `^12.34.2` |
| 图标 | Lucide React `^0.563.0` |
| 国际化 | i18next `^25.8.11` + react-i18next `^16.5.4` |
| 构建 | Vite `^7.3.1` + electron-builder `^26.8.1` |
| 市场/安装 | clawhub `^0.5.0` |
| 测试 | Vitest + Testing Library + jsdom（另有 Playwright e2e 脚本） |

### 2.3 LawClaw 与既有 OpenClaw 的兼容策略与影响边界

**状态：已实施**

LawClaw 当前通过“专用 Agent 定向写入 + 应用层强制约束 + 启动期迁移”与既有 OpenClaw 环境共存。主要行为如下：

- 启动时会先执行 Provider 启动迁移，再执行 Agent 预设模板启动迁移，最后进入 Gateway 自动启动流程
- 启动迁移会强制保证 `lawclaw-main` 存在，并将其 `workspace` 固定为 `~/.openclaw/workspace-lawclaw-main`
- Agent 预设模板迁移当前只有 `bootstrap`、`upgrade`、`noop` 三种模式：
  - `bootstrap`：当前本地尚无快照时，直接写入模板并建立当前快照
  - `upgrade`：有旧快照且目标哈希变化时，按旧快照/新快照/用户当前文件做确定性比较
  - `noop`：当前快照哈希与目标哈希一致且未强制刷新时，不执行模板覆盖
- 模板升级使用 `~/.LawClaw/agent-presets/` 下的 `v_current`、`v_update`、`backups` 作为当前快照、目标快照与备份目录
- 升级时的确定性策略为：
  - 若本地文件仍等于旧模板，则自动覆盖为新模板
  - 若本地文件已被用户修改，则跳过该文件并进入 `warning` 状态
  - 若文件将在升级时被覆盖，则会先做目录级备份再写入新模板
- 不再走 LLM merge、冲突决策按钮、任务队列、聊天输入锁定或“立即重试”交互
- Setup 页在 provider 保存成功或 generic OAuth 成功后，会显式调用 `provider:setDefault`；Settings 页保存/绑定成功后仅保存配置，不自动抢占当前默认 provider
- `provider:setDefault` 只维护 `lawclaw-main` 的模型主值，不主动覆盖 OpenClaw 全局 `agents.defaults.model`
- 当前默认 LawClaw provider 被删除，或其最后一个有效凭据消失时，主进程会按“最近更新时间优先”自动补位到其他可用 provider；仅当 `lawclaw-main.model.primary` 仍是系统受管值时才同步补位
- Provider 相关运行时写入并不只局限于 `lawclaw-main`：
  - provider registry 会写入全局 `~/.openclaw/openclaw.json`
  - API key / OAuth token 会同步到 `main` 与 `lawclaw-main` 的 auth profile
  - custom/ollama 还会涉及 OpenClaw runtime provider 配置写入
- IPC 层会话键规范化：`gateway:rpc` 与 `chat:sendWithMedia` 收到非 `agent:lawclaw-main:*` 的 `sessionKey` 时，会统一回落到 `agent:lawclaw-main:main`
- `sessions.list` 在应用层仅回传 `agent:lawclaw-main:*`；历史非 LawClaw 会话仍保留在网关存储中，但在 UI 隐藏
- 仅对“通过 LawClaw UI 成功保存”的频道写入 `lawclawManagedChannels`，并为这些频道维护唯一的 `lawclaw-main` binding
- Gateway 启动参数默认不附带 `--dev`，仅保留 `--allow-unconfigured`，以避免会话漂移到 `agent:dev:*`

兼容性边界：

- `lawclaw-main` 工作区会执行强一致修正；`agents.defaults` 与其他 Agent 结构默认保持原状
- 预设模板升级采用“增量修正 + 冲突跳过”，而非整目录强制重写
- 被 LawClaw 托管的频道在删除配置时会移除自身写入的 binding，但不会恢复旧 binding
- 非 LawClaw 历史会话只做隐藏，不做数据删除

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

- 应用启动阶段会先执行专用 Agent 预设模板迁移，再进入 Gateway 自动启动
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

### 4.1 Setup（初始设置向导）

**文件位置**：`src/pages/Setup/index.tsx`

Setup 当前保留 6 步流程：Welcome → Runtime → Provider → Channel → Installing → Complete。

#### 4.1.1 Welcome（欢迎页）

- 展示品牌信息与功能简介
- 使用 `SUPPORTED_LANGUAGES` 渲染语言切换入口
- 当前前端资源包含 `en / zh / ja`

#### 4.1.2 Runtime（环境检查）

- Node.js：前端固定标记为可用
- OpenClaw：通过 `openclaw:status` 检查 package、built、version 与路径
- Gateway：读取 store 状态，支持手动启动
- 支持查看最近日志与打开日志目录

#### 4.1.3 Provider（AI 供应商配置）

- Setup 使用统一 Provider 元数据驱动 UI，当前支持 15 种 provider 类型：
  - `jurismind`
  - `moonshot_code_plan`
  - `glm_code_plan`
  - `anthropic`
  - `openai`
  - `google`
  - `openrouter`
  - `ark`
  - `moonshot`
  - `siliconflow`
  - `minimax-portal`
  - `minimax-portal-cn`
  - `qwen-portal`
  - `ollama`
  - `custom`
- 按 provider 类型动态显示 API Key、Base URL、Model ID 等字段
- 支持 `provider:validateKey` 实时校验
- API Key 流程保存时执行 `provider:save`，随后由 Setup 页面显式调用 `provider:setDefault`
- generic OAuth 成功后，Setup 页面也会显式调用 `provider:setDefault`
- Jurismind 提供商支持浏览器绑定/SSO 流程并自动回填 token_key
- Provider 步骤不再提供“跳过设置”全局出口；完成 Provider 后必须继续进入 Installing，以确保预置组件安装链路执行
- 上述“保存后设为默认”为 Setup 专属行为；Settings 页保存成功后不会自动切换当前 LawClaw provider

#### 4.1.4 Channel（频道连接，可选）

- 该步骤可跳过，不阻塞 setup 完成
- Setup 主展示频道来自 `getPrimaryChannels()`，当前为：
  - `jurismind`
  - `feishu`
  - `qqbot`
- `jurismind` 在 channel metadata 中仍为 `comingSoon=true`，但 Setup 对其使用独立的绑定提示面板与二维码/链接流程
- Setup 对非 Jurismind 主展示频道仅渲染 `connectionType=token` 的配置入口，因此不会在该步骤显示 WhatsApp QR 配置
- QQ 频道的选择结果会影响安装步骤是否需要执行 `openclaw:installBundledPlugin('qqbot')` 兜底安装

#### 4.1.5 Installing（组件安装）

- 该步骤按“环境准备 + 预置清单安装 + 可选 QQ 插件兜底”执行：
  1. 调用 `uv:install-all`，完成 bundled uv 校验与托管 Python 安装
  2. 调用 `presetInstall:getStatus` 读取预置安装清单并渲染安装项
  3. 调用 `presetInstall:run({ phase: 'setup' })` 执行预置项安装
  4. 如本次 Setup 选择了 QQ 频道，则执行 `openclaw:installBundledPlugin('qqbot')` 兜底安装 QQ 插件
- 预置安装步骤与用户选择的 Provider 类型无关；只要完成 Setup 主流程进入 Installing，就会执行内置 manifest 中的 skill/plugin 安装
- Setup 的 Installing 步骤当前不提供“跳过安装”入口；失败时仅允许重试，避免绕过内置 skill 安装
- 安装进度来自主进程事件 `presetInstall:progress`
- 当前默认预置清单仅内置 1 个 skill：`contract-review-jurismind@1.0.0`
- 对预置 skill，安装后会写入：
  - `~/.openclaw/skills/<skillId>/.clawhub/origin.json`
  - `~/.openclaw/.clawhub/lock.json`

#### 4.1.6 Complete（完成确认）

- 显示选中的 Provider
- 显示 Installing 步骤记录的组件列表
- 显示当前 Gateway 状态
- 点击完成后写入 `setupComplete=true` 并进入主页面

#### 4.1.7 Setup 后续升级拦截策略

- Setup 完成后，App 启动时会调用 `presetInstall:getStatus`
- 若 `pending=true`，则从任意业务路由重定向到 `/upgrade-installing`
- `presetInstall:statusChanged` 事件会实时触发前端路由纠偏：
  - 待安装：保持在升级安装页
  - 已完成或已跳过：退出升级安装页并回到 `/`

> 说明：`/upgrade-installing` 处理的是**预置安装清单**升级，不等同于专用 Agent 工作区模板迁移。后者发生在应用启动阶段，由 `agent-preset-migration` 机制单独处理。

---

### 4.2 Dashboard（仪表盘）

**文件位置**：`src/pages/Dashboard/index.tsx`

#### 4.2.1 状态卡片

- Gateway 状态（`state / port / pid`）
- Channels 连接统计
- Skills 启用统计
- Gateway 运行时长（uptime）

#### 4.2.2 快捷操作

- 跳转 Channels
- 跳转 Skills
- 跳转 Chat（`/`）
- 跳转 Settings
- 开发者控制台入口（仅 `devModeUnlocked=true` 时显示）

#### 4.2.3 已连接频道列表

- 列出最多 5 个频道
- 显示频道名称、类型、状态

#### 4.2.4 已启用技能标签

- 展示已启用技能标签（最多 12 个）
- 超出数量显示 `+N`

---

### 4.3 Chat（AI 对话界面）

**文件位置**：`src/pages/Chat/index.tsx`

**子组件**：

- `ChatToolbar.tsx`
- `ChatMessage.tsx`
- `ChatInput.tsx`
- `message-utils.ts`

#### 4.3.1 消息与流式区域

- 历史消息加载：`sessions.list` + `chat.history`
- 流式显示：支持 `text / thinking / tool_use / tool_result / image`
- 工具执行状态条：运行中、完成、错误、耗时、摘要
- 支持切换“显示/隐藏思考过程”

#### 4.3.2 输入与发送

- 多行输入：Enter 发送、Shift+Enter 换行
- 发送中按钮切换为 Stop（可中止 `chat.abort`）
- Gateway 未运行时，页面展示阻断提示；迁移 warning 不会阻塞输入框

#### 4.3.3 附件能力（已实现）

- 支持三种入口：
  - 文件选择器
  - 粘贴文件（clipboard）
  - 拖拽文件（drag & drop）
- 附件先经 `file:stage` / `file:stageBuffer` 暂存到本地目录，再发送
- 图片可预览，非图片显示文件卡片

#### 4.3.4 `chat:sendWithMedia` 媒体发送策略

- 图像文件走“双通道”：
  - 作为 base64 `attachments` 发送，供视觉模型直接消费
  - 同时在消息文本中追加 `[media attached: ...]` 路径引用
- 非图像文件以路径引用形式附加在消息文本中

#### 4.3.5 会话锁定与迁移 warning（已实施）

- 默认会话固定为 `agent:lawclaw-main:main`
- 新会话键固定为 `agent:lawclaw-main:session-<timestamp>`
- `loadSessions` 与 `switchSession` 仅接受 `agent:lawclaw-main:*`；非 LawClaw key 会回落默认会话
- `gateway:rpc(sessions.list)` 仅返回 LawClaw 会话；包含 `sessionKey` 的 RPC 参数会在 IPC 层自动归一化
- 当专用 Agent 预设模板升级进入 `warning` 状态且当前 warning 对该 `targetHash` 尚未被忽略时，Chat 顶部显示简化 warning banner
- warning banner 只显示简要说明，不暴露 `skippedTargets`、`v_current`、`v_update` 等工程细节
- 关闭 warning 后，会将 `targetHash` 写入本地 `localStorage`（键名：`lawclaw.agentPresetMigration.dismissedWarningTargetHash`）；相同目标哈希不重复弹出，新目标哈希会重新显示
- 当前已移除“保留用户设定”“优先新预设”“本次跳过”“立即重试”等交互按钮

---

### 4.4 Channels（频道管理）

**文件位置**：`src/pages/Channels/index.tsx`

#### 4.4.1 统计卡片

- 总频道数
- 已连接数
- 未连接数

#### 4.4.2 已配置频道列表

- 卡片展示频道图标、名称、类型、状态、错误
- 支持删除频道配置

#### 4.4.3 主展示频道类型

主展示列表来自 `getPrimaryChannels()`，当前为：

- `jurismind`
- `feishu`
- `qqbot`

补充说明：

- Channels 页面仅在 QQ 插件可用时显示 `qqbot` 主卡片
- `jurismind` 主卡片走独立绑定提示流程，而不是普通 token/QR 配置对话框
- `CHANNEL_META` 仍完整定义了 `whatsapp / dingtalk / telegram / discord / signal / imessage / matrix / line / msteams / googlechat / mattermost` 等类型，用于元数据扩展与后续接入

#### 4.4.4 添加频道与连接流程

- Jurismind：
  - 展示专用提示面板
  - 支持二维码/链接展示、复制链接、刷新、重新绑定、清除绑定
- Token 类型频道：
  - 输入配置字段
  - 调用 `channel:validateCredentials` 校验
  - 保存 `channel:saveConfig`
  - 保存后由主进程落盘配置并重启 Gateway
- WhatsApp（QR）频道：
  - 请求二维码 `channel:requestWhatsAppQr`
  - 监听 `channel:whatsapp-qr / success / error`
  - 成功后保存配置并重启 Gateway

#### 4.4.5 LawClaw 管理频道绑定策略（已实施）

- `channel:saveConfig` 成功后，会将标准化 `channelType` 记录到 `lawclawManagedChannels`
- 对托管频道写入路由时，会先清理该频道已有 binding，再写入唯一规则：`agentId=lawclaw-main` + `match.accountId='*'`
- `channel:deleteConfig` 删除托管频道时，会同步移除其 `lawclaw-main` 绑定并从管理集合中剔除
- 未被 LawClaw UI 托管的频道不会被自动改写

---

### 4.5 Skills（技能管理）

**文件位置**：`src/pages/Skills/index.tsx`

#### 4.5.1 标签页

- `已安装`
- `JurisHub`

> 备注：Bundles 页签目前仍是注释状态，未启用。底层 store 保留了 `clawhub / jurismindhub` 双市场抽象，但当前 UI 主标签页只直接暴露 JurisHub。

#### 4.5.2 已安装技能

- 搜索与来源筛选：
  - `all`
  - `built-in`
  - `jurismindhub`
- 支持启用/禁用
- 非 core 且非 built-in 的技能支持卸载
- 可打开本地 skills 目录
- 卡片会区分 core、bundled 与市场安装来源

#### 4.5.3 技能详情对话框

- 信息页：描述、版本、作者、来源
- 配置页：
  - API Key
  - Environment Variables（可增删键值）
- 保存通过 `skill:updateConfig` 写入，再刷新技能列表

#### 4.5.4 JurisHub 市场

- 当前主市场页使用 JurisHub 查询与安装流程
- 支持安装 / 卸载
- 安装后会尝试自动刷新技能列表
- JurisHub 市场页支持：
  - 排序：`createdAt / stars / downloads`
  - 分页
  - 官方标识（`officialBadge`）
- 已安装技能仍会根据 `.clawhub/origin.json` registry 识别 `clawhub / jurismindhub / unknown` 来源

---

### 4.6 Cron（定时任务）

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

### 4.7 Settings（系统设置）

**文件位置**：`src/pages/Settings/index.tsx`

#### 4.7.1 外观设置

- 主题：`light / dark / system`
- 语言按钮使用 `SUPPORTED_LANGUAGES` 渲染为 `en / zh / ja`

#### 4.7.2 AI 供应商设置（`ProvidersSettings`）

- Provider 列表管理（新增、删除、设默认）
- 编辑 API Key / Base URL / Model ID（按类型）
- 提交前可执行 API Key 校验
- Jurismind 绑定成功后仅保存配置；只有显式点击“设为默认”时才调用 `provider:setDefault`
- 仅 `custom` 允许创建多个实例；其余 provider 类型默认单实例
- 删除当前默认 provider，或删除/清空其最后一个有效 API Key 时，主进程会按最近更新时间自动补位到其他可用 provider；仅当 `lawclaw-main.model.primary` 仍是系统受管值时才同步补位

#### 4.7.3 Gateway 设置

- 状态、端口、重启
- 应用日志查看与打开目录
- 预设迁移产物目录快捷入口（`agentPresetMigration:getArtifactsDir`）
- 开机自动启动 Gateway 开关

> 当前该产物目录主要用于查看专用 Agent 模板迁移产生的快照与备份，而不是处理交互式冲突任务队列。

#### 4.7.4 更新设置（`UpdateSettings`）

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

---

### 4.8 UpgradeInstalling（升级预置组件安装页）

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
  - 跳过当前版本：`presetInstall:skipCurrent`
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
| channels | `channels.ts` | 频道状态、配置拉取、删除与连接辅助 |
| cron | `cron.ts` | 定时任务 CRUD 与触发 |
| gateway | `gateway.ts` | Gateway 状态、RPC、事件转发 |
| agentPresetMigration | `agent-preset-migration.ts` | 预设迁移状态同步、warning 可见性与按 `targetHash` 的本地忽略记录 |
| providers | `providers.ts` | Provider 列表、密钥、默认项、校验 |
| settings | `settings.ts` | 主题、语言、启动/更新/开发者开关、setup 状态 |
| skills | `skills.ts` | 技能列表、安装来源、市场搜索、安装/卸载、启停 |
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

#### settings store（当前定义）

```typescript
interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  language: string;
  startMinimized: boolean;
  launchAtStartup: boolean;
  gatewayAutoStart: boolean;
  gatewayPort: number;
  updateChannel: 'stable' | 'beta' | 'dev';
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
  sidebarCollapsed: boolean;
  devModeUnlocked: boolean;
  setupComplete: boolean;
}
```

> 说明：i18n 资源当前包含 `en / zh / ja`，但 `settings` store 的 `normalizeLanguage()` 目前只会将 `zh*` 归一为 `zh`，其他值归一为 `en`。

#### agent preset migration 状态（当前定义）

```typescript
type AgentPresetMigrationState = 'idle' | 'running' | 'warning' | 'failed';

interface AgentPresetMigrationStatus {
  state: AgentPresetMigrationState;
  reason?: 'PARTIAL_UPDATE' | 'APPLY_FAILED';
  message?: string;
  targetHash?: string;
  updatedFiles?: number;
  createdFiles?: number;
  skippedFiles?: number;
  skippedTargets?: string[];
  updatedAt: string;
}
```

#### 主进程 AppSettings（LawClaw 扩展字段）

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

### 7.1 当前语言资源与行为

- 资源包已接入：
  - English（`en`）
  - 中文（`zh`）
  - 日本語（`ja`）
- Setup 与 Settings 均使用 `SUPPORTED_LANGUAGES` 渲染 `en / zh / ja` 切换入口
- 当前设置持久化逻辑中，`ja` 尚未与资源层完全对齐；`settings` store 对语言值的归一化结果目前只稳定落在 `en / zh`

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
| `resources/icons/` | 打包图标资源 |
| `electron-builder.yml` | 应用标识与打包配置 |
| `src/components/layout/TitleBar.tsx` | Windows/Linux 标题栏文案与图标 |

#### 8.1.2 应用标题和图标

**状态：已支持**

- 窗口标题栏文案可在 `TitleBar` 组件中调整
- 打包图标由 `resources/icons/` 与 `electron-builder.yml` 管理

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
- 需在 Gateway / OpenClaw 配置层实现并接入设置页面

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
- 当 `kind=skill` 时，`id` 必须是 JurisHub 商店 highlighted 技能 slug；构建阶段会强校验
- Setup 与 Upgrade 复用同一份 preset install manifest；是否触发安装由 manifest hash 与本地状态共同决定
- 当前仓库默认清单只内置 1 个 skill：`contract-review-jurismind@1.0.0`

#### 8.4.2 升级安装阻塞页策略

**状态：已支持**

- 当 `presetInstall:getStatus.pending=true` 时，Setup 完成后的用户会被重定向至 `/upgrade-installing`
- 页面支持重试（`presetInstall:retry`）与跳过当前版本（`presetInstall:skipCurrent`）
- 若需关闭阻塞策略，可在应用层修改 `resolvePresetInstallRedirectPath()`（`src/lib/preset-install-guard.ts`）

#### 8.4.3 技能市场集成

**状态：已支持（JurisHub） / 其他私有市场需二次开发**

- 当前 UI 已接入 JurisHub 搜索、排序、分页与安装流程
- 底层 store 仍保留 `clawhub / jurismindhub` 双来源识别与卸载路径
- 若需扩展到 JurisHub 之外的私有市场，需二次开发市场 API 与鉴权流程

### 8.5 专用 Agent 预设模板定制

**状态：已支持**

当前专用 Agent 模板清单位于 `resources/agent-presets/manifest.json`，其核心约束为：

- `schemaVersion` 当前为 `2`
- `templateRoot` 当前为 `template`
- `configPatch` 当前为 `openclaw.patch.json`
- `workspaceFiles` 当前只包含 8 个受管 Markdown 模板文件：
  - `SOUL.md`
  - `AGENTS.md`
  - `IDENTITY.md`
  - `TOOLS.md`
  - `BOOTSTRAP.md`
  - `USER.md`
  - `BOOT.md`
  - `HEARTBEAT.md`

当前实现要点：

- `workspaceFiles[]` 已不再包含额外的冲突策略字段
- 当前受管模板中已**不包含**旧版升级技能模板文件
- 升级比较基于 `v_current` 与 `v_update` 快照做确定性文件比较，不做 capability block 追加合并
- 若需扩展受管模板文件，应同步更新：
  - `resources/agent-presets/manifest.json`
  - `resources/agent-presets/template/`
  - 与迁移逻辑相关的测试

#### 8.5.1 模板升级行为

**状态：已实施**

- 对与旧模板一致的本地文件，升级时可自动覆盖
- 对已被用户修改的本地文件，升级时会跳过并进入 `warning`
- 对将被覆盖的工作区文件，会先备份到 `~/.LawClaw/agent-presets/backups/`
- 快照目录位于：
  - `~/.LawClaw/agent-presets/v_current`
  - `~/.LawClaw/agent-presets/v_update`

### 8.6 QQBot 打包策略

**状态：已实施**

- Setup 流程可按需安装 bundled `qqbot` 插件
- `pnpm package*` 流程会在打包前处理 QQBot 相关产物
- QQ 频道当前不在 preset install manifest 内作为预置插件项，而是由 Setup 会话选择结果驱动安装兜底逻辑

---

## 附录

### A. 文件目录结构（核心）

```text
LawClaw/
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
│  │  ├─ clawhub.ts
│  │  └─ market-source.ts
│  ├─ preload/
│  └─ utils/
│     ├─ agent-preset-migration.ts
│     ├─ channel-config.ts
│     ├─ openclaw-auth.ts
│     ├─ preset-install-state.ts
│     ├─ preset-installer.ts
│     ├─ provider-migration.ts
│     └─ skill-config.ts
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
│  └─ i18n/
├─ resources/
│  ├─ agent-presets/
│  ├─ icons/
│  └─ preset-installs/
├─ scripts/
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
pnpm test
pnpm run brand:scan

# 预置产物校验
pnpm run bundle:preset-artifacts
pnpm run bundle:preset-artifacts:offline

# 构建与打包
pnpm run build:vite
pnpm build
pnpm package:win
pnpm package:mac
pnpm package:linux
```

### C. 相关链接

- 上游仓库信息见项目内部参考资料与历史提交记录
- [Electron 文档](https://www.electronjs.org/docs)
- [React 文档](https://react.dev/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Zustand](https://github.com/pmndrs/zustand)
