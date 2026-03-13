<p align="center">
  <img src="src/assets/logo.svg" width="128" height="128" alt="劳有钳 Logo" />
</p>

<h1 align="center">LawClaw（劳有钳）</h1>

<p align="center">
  <strong>中国法律工作者的 AI 助手桌面应用</strong>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#为什么选择-lawclaw">为什么选择 LawClaw</a> •
  <a href="#快速上手">快速上手</a> •
  <a href="#系统架构">系统架构</a> •
  <a href="#开发指南">开发指南</a> •
  <a href="#参与贡献">参与贡献</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-MacOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/electron-40+-47848F?logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react" alt="React" />
  <a href="https://discord.com/invite/84Kex3GGAh" target="_blank">
    <img src="https://img.shields.io/discord/1399603591471435907?logo=discord&labelColor=%20%235462eb&logoColor=%20%23f5f5f5&color=%20%235462eb" alt="chat on Discord" />
  </a>
  <img src="https://img.shields.io/github/downloads/ValueCell-ai/ClawX/total?color=%23027DEB" alt="Downloads" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

<p align="center">
  简体中文 | <a href="README.md">English</a>
</p>

---

## 概述

**LawClaw（劳有钳）** 是由 **Jurismind（法义经纬）** 团队面向法律服务垂直领域深度定制的本地开源 AI 桌面应用。项目基于官方 [OpenClaw](https://github.com/OpenClaw) 与 [ClawX](https://github.com/ValueCell-ai/ClawX) 构建，为律师、法务等法律专业人士提供从信息检索到辅助办公的全链路智能支持。

**核心机制**：LawClaw 是一款具备长期记忆的个人 AI 代理。依托官方 [OpenClaw](https://github.com/OpenClaw) 的运行时能力与 [ClawX](https://github.com/ValueCell-ai/ClawX) 易用、美观的跨平台桌面化体验，LawClaw 支持完全本地化部署，文件保存在本地，无需上传云端，可作为用户的“数字管家”。它被赋予与用户同等的系统权限，可根据自然语言指令在后台自动执行终端操作、脚本编写及工具调用，实现跨软件、跨设备的高效协同。

**专属能力**：LawClaw 针对法律工作流进行了深度定制。依托内置的 JurisHub 法律垂直社区技能仓库，提供丰富的法律专属技能（Skills），覆盖智能法律研究、复杂文档分析、广告合规审查、合同起草修改、合同合规管理、意见书初稿起草等场景，满足信息检索、内容生成与辅助办公等多类需求。

**开箱即用与官方算力支持**：为帮助法律工作者告别繁琐的参数配置，LawClaw 提供低门槛且灵活的算力接入方案。最便捷的方式是注册并登录 **Jurismind（法义经纬）** 账户，直接使用账户积分额度作为运行所需 Token 消耗，免去复杂配置；同时，秉承开放原则，软件内部也提供第三方算力配置入口，用户可自由选择受支持的其他大模型供应商，填入自备的 API 密钥即可使用。此外，基于同一账户体系，Jurismind 团队还提供可在手机浏览器直接访问和运行的 WebApp，用户登录账户后，即可在手机上与自己的 LawClaw 助手进行沟通。

**社区愿景**：我们秉承开源、开放、共创的精神，致力于构建一个专属于法律工作者的 AI 生态社区。在这里，技术与法律深度融合，期待与你一起汇聚改变行业的力量。

**开发团队**：[Jurismind（法义经纬）](https://jurismind.com)

**底层基座**：基于 [ClawX](https://github.com/ValueCell-ai/ClawX) 和 [OpenClaw](https://github.com/openclaw/openclaw) 定制

**免责声明**：本软件技术服务及其 AI 生成内容仅供参考，可能存在错误、遗漏或时效滞后。LawClaw 提供的服务不构成法律意见、法律建议或法律服务，用户应自行核实，并在必要时咨询专业律师。

---

## 截图预览

<p align="center">
  <img src="resources/screenshot/zh/聊天.png" style="width: 100%; height: auto;">
</p>

<p align="center">
  <img src="resources/screenshot/zh/定时任务.png" style="width: 100%; height: auto;">
</p>

<p align="center">
  <img src="resources/screenshot/zh/技能.png" style="width: 100%; height: auto;">
</p>

<p align="center">
  <img src="resources/screenshot/zh/频道.png" style="width: 100%; height: auto;">
</p>

<p align="center">
  <img src="resources/screenshot/zh/仪表盘.png" style="width: 100%; height: auto;">
</p>

<p align="center">
  <img src="resources/screenshot/zh/设置.png" style="width: 100%; height: auto;">
</p>

---

## 为什么选择 LawClaw

**不止于对话，更在于执行（Not just chatting, but executing.）**

当前市面上的 AI 法律工具，大多停留在“对话式助理（Chatbot）”或“单点辅助工具”的层面。它们能够提供信息，但你仍然是最终的执行者——需要频繁复制、粘贴、切换软件并整合信息。

LawClaw 的目标，是实现从“提供建议”到“自主执行”的跨越。它是真正意义上的 AI Agent（智能体），能够将自然语言指令转化为可执行步骤，成为本地环境中的“数字法律助理”。

**从“被动问答”到“自主任务执行”**

- **传统 AI**：依赖一问一答的交互。处理复杂任务（如多个文件及信息源的起草整合）时，往往需要人工不断拆解步骤、多次提示并手动拼凑结果。
- **LawClaw**：以任务为导向。你只需输入自然语言指令，它会自主拆解任务、规划路径，并协同调用不同的底层技能（Skills），实现从信息检索、数据对比到初稿生成的全流程闭环。

**从“固定工具”到“可进化的技能生态”**

- **传统 AI**：功能多由厂商预设，难以灵活适配不同律所或法务团队高度定制化的工作习惯。
- **LawClaw**：拥抱开源生态。你可以像安装 App 一样，自由组合或开发专属“技能（Skills）”。无论是特定的案例检索策略，还是律所内部的文档归档标准，LawClaw 都能够被“教会”，持续迭代，越用越懂你。


| 传统工作流 | LawClaw 智能工作流 |
| --- | --- |
| 法律检索：在多个数据库之间来回切换、筛选关键词、逐篇阅读并人工归纳。 | 智能法律研究：一句指令即可自动跨平台检索，关联分析法条与案例，生成结构化摘要与研究结论。 |
| 合同审查：逐条阅读、比对模板、手动标记风险点，修改、留痕与归档均依赖人工推进。 | 合同分析与管理：自动识别风险、比对版本差异、提取关键条款，并可结合修订模式完成修改与归档。 |
| 文书起草：查找模板、复制粘贴材料、反复询问 AI，并多轮调整格式与措辞。 | 文书起草与修订：基于案情事实快速生成律师函、起诉状、法律意见书等初稿，统一格式、润色措辞，并支持持续迭代修改。 |
| 广告合规：人工排查极限词、逐项核对法规，耗时较长且容易遗漏。 | 广告合规审查：快速扫描营销材料，生成多维度合规意见，统一输出格式并归档至指定文件夹。 |


**预训练的 OpenClaw**

相较于官方 OpenClaw 更偏技术化的配置流程与较长的前期调优过程，LawClaw 由 [Jurismind（法义经纬）](https://jurismind.com) 团队面向中国法律工作场景进行定制化优化。产品内置几十个围绕中国法律工作者日常任务打造的技能（Skills），支持一键安装、开箱即用；同时配套提供专门教程与 JurisHub 法律垂直社区技能仓库，帮助用户更高效地上手、交流并持续扩展能力。

---

## 功能特性

LawClaw（劳有钳）不仅仅是一个对话框，而是一个专为法律行业打造的智能体平台（Agent Platform）。它由强大的核心架构驱动，并拥有一个持续生长的开源技能生态。

### 核心平台架构

**🎯 开箱即用的专业工作台**

- 面向法律专业人士设计，提供类似 IDE 的多标签页工作台。从安装到第一次咨询，均可通过可视化流程完成；API 凭证通过系统原生 Keychain 安全存储，并支持浅色 / 深色主题自适应。

**🧠 上下文管理与智能记忆**

- 具备超长上下文窗口，能够精准追踪复杂对话逻辑。即使在数十轮深度交互后，AI 仍可回溯此前的关键事实与指令，帮助保持法律分析的连贯性与准确性。

**🧩 开源技能商店与安全生态（Open Skill Store）**

- 内置开源技能商店，可像安装浏览器插件一样一键扩展 AI 能力。我们鼓励社区共建，允许用户提交自定义 Skill；同时，所有第三方技能均需经过官方严格的代码安全审查与质量把控，确保生态既开放活跃，又具备法律场景所需的安全可靠性。

### 官方严选法律技能

LawClaw 官方团队深度自研并严选了一系列高质量、开源的法律专业技能，支持直接使用并按需修改。内置代表性能力包括（但不限于）：

**📋 合同深度审查与比对**

- 不止于简单的关键词匹配。系统能够智能提取合同关键条款，自动高亮潜在合规风险与逻辑漏洞，并给出修改建议。

**📚 自动化法律与类案研究**

- 输入案情后，智能体会主动规划前往权威来源网站的检索路径，自动聚合并分析相关法规与判例，生成案件摘要与法律要点分析报告。

**📝 结构化法律文书生成**

- 基于案情要素（Fact-based）的生成逻辑，智能调用内置模板，起草律师函、起诉状、法律意见书初稿，并完成基础格式与逻辑校验，支持导出标准文档。

**✨ 更多官方严选与社区技能...**

- 包含广告合规审查、合同翻译、合同管理等更多实务技能，均可在 LawClaw 技能商店中一键获取并持续更新。

---

## 快速上手

### 系统要求

- **操作系统**：macOS 11+、Windows 10+ 或 Linux（Ubuntu 20.04+）
- **内存**：最低 4GB RAM（推荐 8GB）
- **存储空间**：1GB 可用磁盘空间

### 安装方式

#### 预构建版本（推荐）

推荐从 OSS（国内镜像）下载适用于当前平台的最新版本：
<!--`https://lawclaw.oss-cn-shanghai.aliyuncs.com/latest/`-->

GitHub Releases 仍可作为备用下载渠道：[Releases](https://github.com/jurismind-dev/LawClaw/releases)。

#### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/jurismind-dev/LawClaw
cd LawClaw

# 初始化项目
pnpm run init

# 以开发模式启动
pnpm dev
```

### 首次启动

首次启动 LawClaw（劳有钳）时，**设置向导**将引导完成以下步骤：

1. **语言** —— 配置首选语言（中文 / English / 日本語）
2. **环境检查** —— 检查 Node.js 运行时、OpenClaw 包与网关状态
3. **AI 供应商** —— 配置受支持的模型供应商（含 `Jurismind（法义经纬）`、`Kimi Coding（官方）`、`GLM - Code Plan（智谱-编程包月）` 等）。其中 `Jurismind（法义经纬）` 通过浏览器登录授权，部分供应商仅需填写 API Key。
4. **消息平台（可选）** —— 在设置向导中可配置 `Jurismind（法义经纬）` 与 `Feishu / Lark`；其中 `Jurismind（法义经纬）` 提供配对绑定入口，`Feishu / Lark` 使用官方引导面板完成接入，其他渠道可在进入主界面后于设置中继续添加。
5. **基础组件安装** —— 安装或检查 uv、托管 Python 运行时，并执行预设技能 / 插件安装。
6. **完成确认** —— 在进入主界面前查看已配置的 AI 供应商、已安装组件与网关状态。

---

## 系统架构

LawClaw 采用 **双进程架构**，将 UI 层与 AI 运行时操作分离，以兼顾交互体验与运行稳定性：

```
┌─────────────────────────────────────────────────────────────────┐
│                       LawClaw 桌面应用                          │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Electron 主进程                               │  │
│  │  • 窗口与应用生命周期管理                                  │  │
│  │  • 网关进程管理与状态转发                                  │  │
│  │  • 系统集成（托盘、菜单、外链打开）                        │  │
│  │  • 自动更新编排                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              │ IPC                              │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              React 渲染进程                                │  │
│  │  • 现代组件化 UI（React 19）                               │  │
│  │  • Zustand 状态管理                                        │  │
│  │  • 通过 IPC 与主进程通信                                   │  │
│  │  • Markdown 富文本渲染                                     │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ WebSocket（JSON-RPC）
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw 网关                              │
│                                                                 │
│  • AI 智能体运行时与编排                                        │
│  • 消息频道管理                                                 │
│  • 技能 / 插件执行环境                                          │
│  • 供应商抽象层                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 设计原则

- **进程隔离**：AI 运行时在独立进程中运行，即使在高负载计算期间，UI 也能保持响应。
- **优雅恢复**：内置带指数退避的重连逻辑，能够自动处理瞬时故障。
- **本地持久化**：Provider 配置与 API Key 当前通过本地 `electron-store` 持久化，不依赖云端同步。
- **热重载**：开发模式支持即时 UI 更新，无需重启网关。

---

## 开发指南

### 前置要求

- **Node.js**：22+（推荐 LTS 版本）
- **包管理器**：pnpm 10+（仓库当前锁定 pnpm 10，请优先使用 pnpm）

### 项目结构

```
LawClaw/
├── electron/              # Electron 主进程
│   ├── main/              # 应用入口、窗口管理
│   ├── gateway/           # OpenClaw 网关进程管理
│   ├── preload/           # 安全 IPC 桥接脚本
│   └── utils/             # 工具模块（存储、认证、路径）
├── src/                   # React 渲染进程
│   ├── components/        # 可复用 UI 组件
│   │   ├── ui/            # 基础组件（shadcn/ui）
│   │   ├── layout/        # 布局组件（侧边栏、顶栏）
│   │   └── common/        # 公共组件
│   ├── pages/             # 应用页面
│   │   ├── Setup/         # 初始设置向导
│   │   ├── Dashboard/     # 首页仪表盘
│   │   ├── Chat/          # AI 聊天界面
│   │   ├── Channels/      # 频道管理
│   │   ├── Skills/        # 技能浏览与管理
│   │   ├── Cron/          # 定时任务
│   │   └── Settings/      # 配置面板
│   ├── stores/            # Zustand 状态仓库
│   ├── lib/               # 前端工具库
│   └── types/             # TypeScript 类型定义
├── resources/             # 静态资源与随包资源（图标、图片、预设安装清单、插件等）
├── scripts/               # 构建与工具脚本
└── tests/                 # 测试套件
```

### 常用命令

```bash
# 初始化
pnpm run init             # 安装依赖并下载 bundled uv 运行时（首次开发必跑）

# 开发
pnpm dev                  # 启动 Vite 开发模式（含 Electron 集成开发流程）
pnpm dev:setup            # 强制进入设置向导的开发模式

# 代码质量
pnpm lint                 # 运行 ESLint 并自动修复可修复问题
pnpm typecheck            # TypeScript 类型检查

# 测试
pnpm test                 # 运行单元测试
pnpm test:e2e             # 运行 Playwright E2E 测试

# 构建与打包
pnpm run build:vite       # 仅构建前后端代码
pnpm build                # 完整生产构建并打包桌面应用
pnpm package              # 为当前平台打包
pnpm package:mac          # 为 macOS 打包
pnpm package:win          # 为 Windows 打包
pnpm package:linux        # 为 Linux 打包
```

### 技术栈

| 层级 | 技术 |
| --- | --- |
| 运行时 | Electron 40+ |
| UI 框架 | React 19 + TypeScript |
| 样式 | Tailwind CSS + shadcn/ui |
| 状态管理 | Zustand |
| 构建工具 | Vite + electron-builder |
| 测试 | Vitest + Playwright |
| 动画 | Framer Motion |
| 图标 | Lucide React |

---

## 参与贡献

我们欢迎社区贡献。无论是修复 Bug、开发新功能、改进文档还是参与翻译，每一项贡献都能帮助 LawClaw 持续完善。

### 如何贡献

1. **Fork** 本仓库
2. **创建** 功能分支（`git checkout -b feature/amazing-feature`）
3. **提交** 清晰描述的变更
4. **推送** 到你的分支
5. **创建** Pull Request

### 贡献规范

- 遵循现有代码风格（ESLint + Prettier）
- 为新功能编写测试
- 按需更新文档
- 保持提交原子化且描述清晰

---

## 致谢

LawClaw（劳有钳）基于以下优秀的开源项目构建：

- **[ClawX](https://github.com/ValueCell-ai/ClawX)** – 本项目的上游基础，由 ValueCell Team 开发维护
- **[OpenClaw](https://github.com/OpenClaw)** – AI 智能体运行时
- [Electron](https://www.electronjs.org/) – 跨平台桌面框架
- [React](https://react.dev/) – UI 组件库
- [shadcn/ui](https://ui.shadcn.com/) – 精美设计的组件库
- [Zustand](https://github.com/pmndrs/zustand) – 轻量级状态管理

---

## 社区

欢迎加入我们的社区，与其他用户交流、获取帮助，并分享你的使用体验。
<!--
| 企业微信 | 飞书群组 | Discord |
| :---: | :---: | :---: |
| <img src="src/assets/community/wecom-qr.png" width="150" alt="企业微信二维码" /> | <img src="src/assets/community/feishu-qr.png" width="150" alt="飞书二维码" /> | <img src="src/assets/community/20260212-185822.png" width="150" alt="Discord 二维码" /> |
-->

---

## 许可证

LawClaw 基于 [MIT 许可证](LICENSE) 发布。你可以在许可条款范围内自由使用、修改和分发本软件。

---

<p align="center">
  <sub>由 Jurismind（法义经纬）用 ❤️ 打造</sub>
</p>
