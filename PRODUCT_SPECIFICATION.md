# LawClaw（劳有钳）产品规格说明书

> 对外发布版，基于当前仓库实现整理。本文只描述 **当前已实现能力、当前交付边界与当前发布口径**，不构成未发布功能承诺。

## 1. 基本信息

| 项目 | 内容 |
| --- | --- |
| 产品名称 | LawClaw（劳有钳） |
| 产品形态 | 本地优先 AI Agent 桌面应用 |
| 面向用户 | 律师、法务、合规团队、法律运营与法律科技团队 |
| 开发团队 | Jurismind（法义经纬） |
| 当前版本口径 | 跟随 Git tag / Release tag，不在文档中写死 |
| OpenClaw 运行时口径 | 以 `package.json` 中声明的 `openclaw` 依赖版本为准 |
| 开源协议 | MIT |
| 主要平台 | macOS 11+、Windows 10+、Linux（推荐 Ubuntu 20.04+） |
| 界面语言 | 中文、English、日本語 |
| 发布渠道 | GitHub Releases、OSS 镜像、源码构建 |
| 最后整理 | 2026-03-30 |

## 2. 产品定位

LawClaw 是一款围绕中国法律服务场景定制的桌面 AI Agent 产品。它基于 OpenClaw 运行时与桌面化 UI 架构构建，目标不是提供“单轮问答式聊天框”，而是提供一个可执行、可扩展、可持续演进的法律工作台。

与普通 AI 工具相比，LawClaw 当前版本的核心差异在于：

- **本地优先**：桌面端直接管理模型接入、技能、频道和任务调度，工作区保留在本机环境。
- **工作流导向**：从 Provider 配置、技能安装到对话执行与频道接入，都通过统一界面完成。
- **法律垂直生态**：当前产品集成 JurisHub 技能市场，并围绕中国法律实务场景组织开箱能力。
- **面向部署而非 Demo**：具备 Setup Wizard、预置安装、更新链路、专用 Agent 工作区和运行时兜底机制。

## 3. 目标用户与主打场景

### 3.1 目标用户

- 需要桌面化 AI 工作流的个人律师与律师团队
- 需要本地化、可控部署体验的企业法务与合规团队
- 需要统一管理 Provider、Channels、Skills、Cron 的高级用户
- 需要在 OpenClaw 生态上交付垂直行业产品的技术团队

### 3.2 主打场景

| 场景 | 当前版本可提供的能力 |
| --- | --- |
| 法律研究 | 通过对话、技能与工具调用组合，完成信息检索、整理与结构化输出 |
| 合同审查 | 结合模型与技能流程，进行版本对比、条款抽取、风险提示与修改辅助 |
| 法律文书起草 | 在持续会话中迭代律师函、起诉状、法律意见书等初稿 |
| 广告与内容合规 | 借助技能生态接入合规审查类工作流 |
| 消息渠道助手 | 把助手连接到 Jurismind、飞书、微信等常见入口，并统一管理连接状态 |
| 自动化执行 | 使用 Cron 定时任务与预置能力，把重复性工作交给 Agent 持续执行 |

## 4. 核心价值主张

| 传统痛点 | LawClaw 当前解法 |
| --- | --- |
| 模型配置复杂、上手门槛高 | 用 Setup Wizard 收敛运行时检查、Provider 设置与预置组件安装 |
| AI 工具只会“回答”，不会“协同执行” | 通过 OpenClaw Gateway、技能和频道接入，形成持续执行型桌面 Agent |
| 法律场景能力分散，缺少垂直入口 | 通过 JurisHub 市场和精选预置能力，聚焦法律工作流扩展 |
| 多模型、多渠道、多任务分散管理 | 在同一应用内管理 Provider、Skills、Channels、Cron 与更新 |
| 既有 OpenClaw 环境与新产品容易互相污染 | 当前版本通过 `lawclaw-main` 专用 Agent 和工作区进行隔离 |

## 5. 当前已交付功能范围

### 5.1 主界面模块

| 模块 | 当前状态 | 说明 |
| --- | --- | --- |
| Setup Wizard | 已上线 | 引导完成语言选择、环境检查、Provider 设置、频道接入与预置安装 |
| Chat | 已上线 | 支持会话列表、流式输出、附件发送、工具调用状态与会话收敛 |
| Dashboard | 已上线 | 提供网关、Provider、频道与任务等概览信息 |
| Channels | 已上线 | 管理频道配置、状态查看、删除与重连 |
| Skills | 已上线 | 浏览 JurisHub 市场、安装/启停/卸载/配置技能 |
| Cron | 已上线 | 创建、查看和管理定时任务 |
| Settings | 已上线 | Provider、更新、语言、外链与开发者入口等设置 |
| Upgrade Installing | 已上线 | 预置安装未完成时的阻塞升级页，防止半安装态进入主界面 |

### 5.2 Provider 接入能力

当前前端元数据已支持 **15 类 Provider**：

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

当前版本能力特点：

- 支持 API Key、OAuth、OAuth + API Key 混合、Base URL、自定义 Model ID 等不同接入模式
- Setup 向导在保存成功后会显式设置默认 Provider
- Settings 页支持后续维护 Provider，但不会自动抢占当前默认 Provider
- 当默认 Provider 被删除或失效时，主进程会按可用性与最近更新时间执行自动补位

### 5.3 频道接入能力

当前产品主流程优先展示的频道入口为：

- `Jurismind`
- `Feishu / Lark`
- `微信（openclaw-weixin）`

同时，代码层已保留并维护更多频道元数据与配置能力，包括：

- `DingTalk`
- `Telegram`
- `Discord`
- `WhatsApp`
- `Signal`
- `iMessage`
- `Matrix`
- `LINE`
- `Microsoft Teams`
- `Google Chat`
- `Mattermost`

当前边界说明：

- Setup Wizard 主要面向常见入口，不会在首启流程中完全暴露所有频道能力
- `Jurismind` 在通用频道元数据中仍保留 `comingSoon` 标记，但应用中为其提供了专门的绑定与扫码流程
- 部分频道能力目前更适合作为扩展集成或二次开发能力，不建议在宣发中表述为“全部开箱即用”

### 5.4 技能生态与 JurisHub

当前版本已完成以下能力交付：

- 集成 JurisHub 市场搜索、安装、卸载、README 打开与详情跳转
- 已安装技能列表中显示来源信息与官方标识
- 支持技能启停、配置与本地状态同步
- 预置安装器当前仅同步 JurisHub 的 `official + highlighted` 技能集合

这意味着 LawClaw 现在已经具备“法律垂直技能商店 + 精选开箱包”的产品基础，而不是仅仅依赖单一固定功能集。

### 5.5 定时任务与自动化

当前版本提供独立的 `Cron` 页面，用于：

- 查看任务列表
- 创建与管理定时任务
- 将技能、对话与 Agent 行为纳入持续执行流程

这部分能力是 LawClaw 从“桌面 AI 助手”向“可持续运行的 Agent 工作台”演进的重要组成部分。

## 6. 当前用户流程

### 6.1 首次启动流程

当前版本的 Setup Wizard 会依次引导用户完成：

1. 选择界面语言（中文 / English / 日本語）
2. 检查 OpenClaw 包、Gateway 状态与本地运行时
3. 配置 AI Provider，并在向导内完成默认 Provider 设置
4. 选择并接入常用频道入口
5. 安装或校验 `uv`、托管 Python 与预置技能组件
6. 在进入主界面前确认 Provider、组件与网关状态

### 6.2 Setup 后续拦截策略

- 当 `setupComplete=false` 时，应用会自动跳转到 `/setup`
- 当 `setupComplete=true` 且 `presetInstall:getStatus.pending=true` 时，应用会自动跳转到 `/upgrade-installing`
- 升级安装页支持重试与“跳过当前版本”，避免用户在半安装态直接进入主界面

## 7. 架构与运行时策略

### 7.1 双进程桌面架构

当前实现采用三层结构：

```text
LawClaw Desktop App
├─ Electron Main Process
│  ├─ 窗口生命周期 / 系统托盘 / 自动更新
│  ├─ Gateway 进程管理
│  ├─ Provider 启动迁移
│  ├─ Agent 预设模板迁移
│  └─ 本地配置持久化
├─ React Renderer Process
│  ├─ Setup / Chat / Dashboard / Channels / Skills / Cron / Settings
│  └─ Zustand + i18n + IPC
└─ OpenClaw Gateway
   ├─ 会话与消息流
   ├─ Skills / Channels / Cron
   └─ 模型调用与 Agent 编排
```

### 7.2 专用 Agent 策略

LawClaw 当前通过 `lawclaw-main` 专用 Agent 与独立工作区运行，核心目的包括：

- 与既有 OpenClaw 环境隔离
- 让 UI 只聚焦 LawClaw 自己管理的会话
- 在升级、迁移、预置安装和默认模型维护上保持产品一致性

当前主行为包括：

- `lawclaw-main` 工作区固定在 `~/.openclaw/workspace-lawclaw-main`
- UI 默认只展示并操作 `agent:lawclaw-main:*` 会话
- 启动时执行 Provider 迁移与 Agent 预设模板迁移
- 预设模板升级采用“自动覆盖未修改文件 + 跳过用户已修改文件 + 覆盖前备份”的策略

### 7.3 Runtime 兜底策略

打包版本会注入 bundled Node、uv、npm、npx 与 runtime bridge，用于系统运行时缺失或不一致时的兜底。

需要明确的对外口径：

- bundled runtime 是 **兼容与兜底方案**
- 如果用户已有可用系统 Node / Python / uv 环境，LawClaw 不应被表述为必须替代用户系统运行时

## 8. 安全、隐私与数据处理

### 8.1 当前安全口径

- LawClaw 是本地优先桌面应用，文件与工作区默认保留在本机环境
- Provider 配置和 API Key 当前通过本地 `electron-store` 持久化
- 为兼容 Gateway 使用，凭据会同步写入 OpenClaw 的 auth profile

相关路径包括：

- `~/.LawClaw/`
- `~/.openclaw/agents/<agentId>/agent/auth-profiles.json`

### 8.2 当前限制

当前版本 **尚未接入操作系统级 Keychain / Credential Manager**。因此，对外材料中应避免将当前实现表述为“系统级密钥托管”。

### 8.3 法律与内容免责声明

LawClaw 提供的软件能力与 AI 生成内容仅供参考，不构成法律意见、法律建议或正式法律服务。用户仍需结合具体事实自行核实，并在必要时咨询专业律师。

## 9. 安装、分发与发布能力

### 9.1 当前发布方式

仓库当前已经具备以下分发能力：

- GitHub Releases
- 阿里云 OSS 镜像
- 本地源码构建

### 9.2 打包能力

根据当前 `electron-builder.yml`：

- **macOS**：支持 `dmg` 与 `zip`，覆盖 `x64 + arm64`
- **Windows**：支持 `nsis`，当前目标为 `x64`
- **Linux**：支持 `AppImage / deb / rpm`

### 9.3 当前 CI / Release 实现状态

- `check.yml` 当前执行 `lint`、`typecheck`、`brand:scan`、`test` 与 `build:vite` 等检查
- `release.yml` 当前正式构建矩阵覆盖 `macOS` 与 `Windows`
- 发布流程会把正式产物上传到 GitHub Releases，并同步上传到 OSS
- Linux 打包脚本与配置已存在，适合本地构建与后续纳入正式发布矩阵

## 10. 当前边界与不宜过度承诺的点

以下内容在对外沟通时需要保持准确：

- 当前版本已具备法律场景工作的基础产品能力，但 **并未内置完整的法律模板中心或专门的法律工具专区页面**
- 并非所有代码层存在的频道元数据都适合作为“当前主推开箱能力”对外宣传
- 预置安装器当前聚焦 JurisHub 官方与精选集合，而非任意来源全量同步
- UI 会话层当前以 `lawclaw-main` 为核心，不面向任意 OpenClaw Agent 混合管理
- Linux 已有构建配置，但当前正式 GitHub Release 工作流主要构建 macOS 与 Windows

## 11. 仓库结构概览

| 路径 | 职责 |
| --- | --- |
| `src/` | React 渲染进程与页面、组件、stores、i18n |
| `electron/main/` | Electron 主进程、窗口管理、IPC、更新、菜单、托盘 |
| `electron/gateway/` | OpenClaw Gateway 通信与市场服务 |
| `electron/utils/` | Provider、路径、运行时、迁移、存储等工具模块 |
| `tests/` | Vitest 单测与测试初始化 |
| `scripts/` | 构建、资源整理、brand scan、runtime 下载与打包脚本 |
| `resources/` | 图标、截图、运行时桥接、预置清单与随包资源 |

## 12. 对外传播建议口径

如果需要把 LawClaw 作为公开仓库或对外产品进行介绍，推荐强调以下三点：

1. **本地优先的法律 AI Agent 桌面工作台**
2. **集成 JurisHub 法律技能生态的可扩展产品**
3. **具备 Setup Wizard、Provider、Channels、Skills、Cron、更新链路的可部署版本**

同时建议避免以下表述：

- “已覆盖全部法律工作流”
- “所有频道均已成熟商用”
- “当前已实现系统级密钥托管”
- “LawClaw 只能依赖 bundled runtime 运行”
