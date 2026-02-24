# 小龙芯 (Jurismind) 产品规格说明书

> 本文档详细描述小龙芯桌面应用的页面架构和功能说明，作为后续功能修改的基础参考文档。

**产品名称**：小龙芯 (Jurismind)
**开发团队**：法义经纬 (Jurismind Team)
**基于项目**：[ClawX](https://github.com/ValueCell-ai/ClawX) by ValueCell Team
**版本**：0.1.16
**最后更新**：2026-02-24

---

> **说明**：小龙芯是基于 ClawX 项目进行法律领域定制开发的律师AI助手桌面应用。ClawX 是 OpenClaw 的官方桌面客户端，提供了完整的 AI 智能体桌面运行框架。

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

小龙芯是一款专为律师和法律专业人士打造的专业AI助手桌面应用。基于OpenClaw AI运行时构建，提供法律研究、合同审查、案例分析和文书生成等专业功能。

### 1.2 目标用户

- 执业律师
- 法律顾问
- 企业法务
- 法律研究者
- 法学院师生

### 1.3 核心价值

- **专业法律场景**：专为法律领域定制的AI助手功能
- **便捷桌面体验**：无需命令行，图形化界面操作
- **安全隐私保护**：本地处理，数据安全可控
- **中英双语支持**：满足涉外法律工作需求

---

## 2. 技术架构

### 2.1 双进程架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     小龙芯桌面应用 (Electron)                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Electron 主进程 (Main Process)                  │  │
│  │  • 窗口与应用生命周期管理                                      │  │
│  │  • Gateway 进程监督                                          │  │
│  │  • 系统集成（托盘、通知、密钥链）                               │  │
│  │  • 自动更新编排                                               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│                              │ IPC                                │
│                              ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              React 渲染进程 (Renderer Process)                │  │
│  │  • 现代组件化 UI (React 19)                                   │  │
│  │  • Zustand 状态管理                                           │  │
│  │  • WebSocket 实时通信                                         │  │
│  │  • Markdown 富文本渲染                                        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ WebSocket (JSON-RPC)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                             │
│  • AI 智能体运行时和编排                                          │
│  • 消息频道管理                                                   │
│  • 技能/插件执行环境                                              │
│  • 供应商抽象层                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Electron 40+ |
| UI框架 | React 19 + TypeScript |
| 样式 | Tailwind CSS + shadcn/ui |
| 状态管理 | Zustand |
| 构建工具 | Vite + electron-builder |
| 测试 | Vitest + Playwright |
| 动画 | Framer Motion |
| 图标 | Lucide React |
| 国际化 | i18next + react-i18next |

---

## 3. 页面架构总览

### 3.1 页面路由

```
/                   → 首次启动时重定向到 Setup 或 Chat
/setup              → 初始设置向导 (Setup Wizard)
/dashboard          → 仪表盘首页 (Dashboard)
/chat               → AI对话界面 (Chat)
/channels           → 频道管理 (Channels)
/skills             → 技能管理 (Skills)
/cron               → 定时任务 (Cron)
/settings           → 系统设置 (Settings)
```

### 3.2 页面层级关系

```
App
├── Setup (首次启动时显示)
│   ├── Welcome (欢迎页)
│   ├── Runtime (环境检查)
│   ├── Provider (AI供应商配置)
│   ├── Channel (频道连接，可选)
│   ├── Installing (组件安装)
│   └── Complete (完成确认)
│
└── MainLayout (主布局 - 设置完成后)
    ├── TitleBar (标题栏)
    ├── Sidebar (侧边导航)
    └── Content Area (内容区域)
        ├── Dashboard (仪表盘)
        ├── Chat (对话)
        ├── Channels (频道)
        ├── Skills (技能)
        ├── Cron (定时任务)
        └── Settings (设置)
```

---

## 4. 页面详细说明

### 4.1 Setup (初始设置向导)

**文件位置**: `src/pages/Setup/index.tsx`

**功能说明**: 首次启动时引导用户完成应用配置的向导流程。

#### 4.1.1 Welcome (欢迎页)

- **功能**: 语言选择、产品介绍
- **组件**: `WelcomeContent`
- **可配置项**:
  - 语言选择 (中文/English)
  - 功能亮点展示

#### 4.1.2 Runtime (环境检查)

- **功能**: 检测系统环境和依赖
- **组件**: `RuntimeContent`
- **检查项**:
  - Node.js 运行时
  - OpenClaw 包状态
  - Gateway 服务状态
- **操作**: 查看日志、重新检测、手动启动Gateway

#### 4.1.3 Provider (AI供应商配置)

- **功能**: 配置AI模型供应商和API密钥
- **组件**: `ProviderContent`
- **支持的供应商**:
  - OpenAI
  - Anthropic (Claude)
  - DeepSeek
  - 硅基流动 (SiliconFlow)
  - Ollama (本地)
  - 自定义供应商
- **配置字段**:
  - Base URL (部分供应商)
  - Model ID (部分供应商)
  - API Key (密钥安全存储)

#### 4.1.4 Channel (频道连接)

- **功能**: 连接消息平台 (可选步骤)
- **组件**: `SetupChannelContent`
- **支持的平台**:
  - Discord
  - Telegram
  - WhatsApp (二维码登录)
- **配置字段**:
  - Bot Token
  - Channel ID

#### 4.1.5 Installing (组件安装)

- **功能**: 自动安装必要组件
- **组件**: `InstallingContent`
- **安装内容**:
  - uv (Python包管理器)
  - Python环境
  - 预配置技能

#### 4.1.6 Complete (完成确认)

- **功能**: 确认配置并进入主界面
- **组件**: `CompleteContent`
- **显示信息**:
  - 已配置的供应商
  - 已安装的技能
  - Gateway状态

---

### 4.2 Dashboard (仪表盘)

**文件位置**: `src/pages/Dashboard/index.tsx`

**功能说明**: 应用主页面，展示系统状态概览和快捷操作。

#### 4.2.1 状态卡片

| 卡片 | 内容 | 数据来源 |
|------|------|----------|
| Gateway状态 | 运行状态、端口、进程ID | `useGatewayStore` |
| 频道统计 | 已连接/总数 | `useChannelsStore` |
| 技能统计 | 已启用/总数 | `useSkillsStore` |
| 运行时间 | Gateway运行时长 | 计算值 |

#### 4.2.2 快捷操作

- 添加频道 → 跳转 `/channels`
- 浏览技能 → 跳转 `/skills`
- 开始对话 → 跳转 `/` (Chat)
- 系统设置 → 跳转 `/settings`
- 开发者控制台 → 仅开发者模式可见

#### 4.2.3 已连接频道列表

- 显示已配置的频道卡片
- 频道状态标识 (connected/disconnected)
- 频道类型图标 (WhatsApp/Telegram/Discord)

#### 4.2.4 已启用技能标签

- 以Badge形式展示已启用的技能
- 显示技能图标和名称
- 支持快速跳转到技能详情

---

### 4.3 Chat (AI对话界面)

**文件位置**: `src/pages/Chat/index.tsx`

**子组件**:
- `ChatInput.tsx` - 消息输入区域
- `ChatMessage.tsx` - 消息渲染组件
- `ChatToolbar.tsx` - 工具栏 (会话切换、设置)
- `message-utils.ts` - 消息处理工具

**功能说明**: 与AI智能体进行对话的主要界面。

#### 4.3.1 消息区域

- **历史消息**: 从 `useChatStore` 加载
- **流式消息**: 实时渲染AI响应
- **消息类型**:
  - 用户消息 (user)
  - AI消息 (assistant)
  - 思考过程 (thinking, 可选显示)
  - 工具调用 (tool_use, 可选显示)
- **渲染特性**:
  - Markdown渲染
  - 代码高亮
  - 图片显示
  - 打字机效果

#### 4.3.2 工具栏功能

- 会话选择器 (Session Selector)
- 刷新历史记录
- 显示/隐藏思考过程
- 清除对话

#### 4.3.3 输入区域

- 多行文本输入
- 发送按钮
- 停止生成按钮 (发送中)
- 快捷键支持 (Enter发送, Shift+Enter换行)

#### 4.3.4 欢迎界面

- 无消息时显示
- 功能引导卡片:
  - 开始对话
  - 创意任务

---

### 4.4 Channels (频道管理)

**文件位置**: `src/pages/Channels/index.tsx`

**功能说明**: 管理AI智能体与外部消息平台的连接。

#### 4.4.1 统计卡片

| 卡片 | 内容 |
|------|------|
| 总频道数 | 已配置的所有频道数量 |
| 已连接 | 当前连接成功的频道 |
| 已断开 | 当前断开的频道 |

#### 4.4.2 已配置频道列表

- 频道卡片展示:
  - 频道图标
  - 频道名称
  - 频道类型
  - 连接状态
  - 错误信息 (如有)
- 操作按钮:
  - 删除频道

#### 4.4.3 可用频道类型

- **Discord**: Bot Token认证
- **Telegram**: Bot Token认证
- **WhatsApp**: 二维码扫码登录

#### 4.4.4 添加频道对话框

- 频道类型选择
- 配置字段输入:
  - 频道名称
  - Bot Token (密码输入)
  - Channel ID (Discord专用)
- 凭证验证
- 保存并连接

---

### 4.5 Skills (技能管理)

**文件位置**: `src/pages/Skills/index.tsx`

**功能说明**: 浏览、安装和管理AI技能扩展。

#### 4.5.1 标签页

| 标签 | 内容 |
|------|------|
| 已安装 | 显示本地已安装的技能 |
| 技能市场 | 从ClawHub搜索和安装技能 |

#### 4.5.2 已安装技能

- **搜索过滤**: 按名称或描述搜索
- **来源筛选**:
  - 全部
  - 内置 (Built-in)
  - 市场安装 (Marketplace)
- **技能卡片**:
  - 技能图标
  - 技能名称
  - 描述
  - 版本号
  - 来源标识
  - 启用/禁用开关
  - 卸载按钮

#### 4.5.3 技能详情对话框

- **信息标签页**:
  - 描述
  - 版本
  - 作者
  - 来源类型
- **配置标签页**:
  - API Key配置
  - 环境变量配置
  - 保存按钮

#### 4.5.4 技能市场

- 搜索框
- 技能卡片 (来自ClawHub):
  - 名称
  - 描述
  - 作者
  - 下载量/评分
  - 安装/卸载按钮

---

### 4.6 Cron (定时任务)

**文件位置**: `src/pages/Cron/index.tsx`

**功能说明**: 管理AI智能体的定时自动化任务。

#### 4.6.1 统计卡片

| 卡片 | 内容 |
|------|------|
| 总任务数 | 所有定时任务数量 |
| 活跃 | 已启用的任务数 |
| 暂停 | 已暂停的任务数 |
| 失败 | 最近执行失败的任务数 |

#### 4.6.2 任务卡片

- **头部**:
  - 任务图标
  - 任务名称
  - 执行计划描述
  - 状态标签 (Active/Paused)
  - 启用开关
- **内容**:
  - 任务消息预览
  - 目标频道
  - 上次执行时间和结果
  - 下次执行时间
  - 错误信息 (如有)
- **操作**:
  - 立即执行
  - 编辑
  - 删除

#### 4.6.3 创建/编辑任务对话框

- **任务名称**: 必填
- **消息内容**: 必填，AI任务提示词
- **执行计划**:
  - 预设选项:
    - 每分钟
    - 每5分钟
    - 每15分钟
    - 每小时
    - 每天9点
    - 每天18点
    - 每周一9点
    - 每月1日9点
  - 自定义Cron表达式
- **目标频道**: 从已配置频道中选择
- **Discord频道ID**: Discord专用配置
- **立即启用**: 开关选项

---

### 4.7 Settings (系统设置)

**文件位置**: `src/pages/Settings/index.tsx`

**子组件**:
- `ProvidersSettings.tsx` - AI供应商设置
- `UpdateSettings.tsx` - 更新设置

**功能说明**: 系统配置和偏好设置。

#### 4.7.1 外观设置

- **主题**:
  - 浅色模式
  - 深色模式
  - 跟随系统
- **语言**:
  - 中文
  - English

#### 4.7.2 AI供应商设置 (ProvidersSettings)

- 供应商列表管理
- 添加/编辑供应商
- API密钥配置
- 设为默认供应商
- 凭证验证

#### 4.7.3 Gateway设置

- **状态显示**: 运行状态、端口
- **操作**:
  - 重启Gateway
  - 查看日志
- **自动启动**: 应用启动时自动启动Gateway

#### 4.7.4 更新设置 (UpdateSettings)

- 当前版本显示
- 检查更新
- 下载进度
- **自动检查更新**
- **自动下载更新**

#### 4.7.5 高级设置

- **开发者模式**: 解锁高级功能

#### 4.7.6 开发者设置 (仅开发者模式)

- **控制台**: 打开Gateway控制台URL
- **Gateway Token**: 查看/复制认证令牌
- **CLI命令**: 获取/复制命令行命令

#### 4.7.7 关于

- 应用名称和版本
- 基于OpenClaw说明
- 文档链接
- GitHub链接

---

## 5. 组件库说明

### 5.1 UI基础组件 (shadcn/ui)

**位置**: `src/components/ui/`

| 组件 | 文件 | 用途 |
|------|------|------|
| Badge | badge.tsx | 状态标签、计数标识 |
| Button | button.tsx | 按钮 |
| Card | card.tsx | 卡片容器 |
| Input | input.tsx | 文本输入框 |
| Label | label.tsx | 表单标签 |
| Progress | progress.tsx | 进度条 |
| Select | select.tsx | 下拉选择框 |
| Separator | separator.tsx | 分隔线 |
| Switch | switch.tsx | 开关控件 |
| Tabs | tabs.tsx | 标签页 |
| Textarea | textarea.tsx | 多行文本输入 |
| Tooltip | tooltip.tsx | 工具提示 |

### 5.2 布局组件

**位置**: `src/components/layout/`

| 组件 | 文件 | 用途 |
|------|------|------|
| MainLayout | MainLayout.tsx | 主布局框架 |
| Sidebar | Sidebar.tsx | 侧边导航栏 |
| TitleBar | TitleBar.tsx | 窗口标题栏 |

### 5.3 通用组件

**位置**: `src/components/common/`

| 组件 | 文件 | 用途 |
|------|------|------|
| ErrorBoundary | ErrorBoundary.tsx | 错误边界 |
| LoadingSpinner | LoadingSpinner.tsx | 加载动画 |
| StatusBadge | StatusBadge.tsx | 状态指示徽章 |

### 5.4 设置组件

**位置**: `src/components/settings/`

| 组件 | 文件 | 用途 |
|------|------|------|
| ProvidersSettings | ProvidersSettings.tsx | AI供应商配置面板 |
| UpdateSettings | UpdateSettings.tsx | 更新管理面板 |

---

## 6. 状态管理

### 6.1 Zustand Stores

**位置**: `src/stores/`

| Store | 文件 | 用途 |
|-------|------|------|
| chat | chat.ts | 对话消息、会话管理 |
| channels | channels.ts | 频道配置和状态 |
| cron | cron.ts | 定时任务管理 |
| gateway | gateway.ts | Gateway进程状态 |
| settings | settings.ts | 应用设置和偏好 |
| skills | skills.ts | 技能管理和市场搜索 |
| update | update.ts | 应用更新状态 |

### 6.2 关键状态说明

#### gateway store

```typescript
interface GatewayState {
  status: {
    state: 'stopped' | 'starting' | 'running' | 'error' | 'reconnecting';
    port: number;
    pid: number | null;
    error: string | null;
    connectedAt: number | null;
  };
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
}
```

#### settings store

```typescript
interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  language: 'zh' | 'en';
  gatewayAutoStart: boolean;
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
  devModeUnlocked: boolean;
  setupCompleted: boolean;
  // ... setters
}
```

---

## 7. 国际化支持

### 7.1 支持语言

- **中文 (zh)**: 简体中文
- **English (en)**: 英语

### 7.2 i18n配置

**位置**: `src/i18n/`

```
src/i18n/
├── index.ts          # i18n配置入口
└── locales/
    ├── en/
    │   ├── chat.json
    │   ├── channels.json
    │   ├── common.json
    │   ├── cron.json
    │   ├── dashboard.json
    │   ├── settings.json
    │   ├── setup.json
    │   └── skills.json
    └── zh/
        ├── chat.json
        ├── channels.json
        ├── common.json
        ├── cron.json
        ├── dashboard.json
        ├── settings.json
        ├── setup.json
        └── skills.json
```

### 7.3 使用方式

```tsx
import { useTranslation } from 'react-i18next';

const { t } = useTranslation('chat');
// 使用: t('welcome.title')
```

---

## 8. 定制化指南

### 8.1 品牌定制

#### 8.1.1 需要修改的文件

| 文件 | 修改内容 |
|------|----------|
| `package.json` | name, description, author |
| `CLAUDE.md` | 项目概述和品牌信息 |
| `README.md` | 英文文档 |
| `README.zh-CN.md` | 中文文档 |
| `src/assets/logo.svg` | 应用图标 |
| `electron-builder.yml` | 产品名称、ID |

#### 8.1.2 应用标题和图标

- 窗口标题: `electron/main/index.ts`
- 应用图标: `resources/` 目录下的图标文件
- Dock/任务栏图标: `electron-builder.yml` 配置

### 8.2 功能定制

#### 8.2.1 添加法律专用功能

**建议路径**:

1. **新建法律工具页面**: `src/pages/LegalTools/`
2. **添加法律技能**: 在Setup向导中预装法律技能
3. **定制欢迎界面**: 修改 `Chat/WelcomeScreen` 组件
4. **添加法律模板**: 创建合同模板、文书模板组件

#### 8.2.2 修改AI系统提示词

在OpenClaw Gateway配置中设置法律领域专用的系统提示词。

### 8.3 界面定制

#### 8.3.1 主题颜色

修改 `src/index.css` 中的CSS变量:

```css
:root {
  --primary: ...;
  --secondary: ...;
  /* 其他主题变量 */
}
```

#### 8.3.2 侧边栏导航

修改 `src/components/layout/Sidebar.tsx` 添加或移除导航项。

### 8.4 技能定制

#### 8.4.1 预装法律技能

修改 `src/pages/Setup/index.tsx` 中的 `defaultSkills` 数组:

```typescript
const defaultSkills: DefaultSkill[] = [
  { id: 'legal-research', name: 'Legal Research', description: '法律文献检索' },
  { id: 'contract-review', name: 'Contract Review', description: '合同审查' },
  { id: 'case-analysis', name: 'Case Analysis', description: '案例分析' },
  // ...
];
```

#### 8.4.2 技能市场集成

与ClawHub集成，提供法律领域专用技能包。

---

## 附录

### A. 文件目录结构

```
ClawX/
├── electron/              # Electron 主进程
│   ├── main/             # 应用入口、窗口管理
│   │   ├── index.ts      # 主进程入口
│   │   ├── ipc-handlers.ts  # IPC处理器
│   │   ├── menu.ts       # 菜单创建
│   │   ├── tray.ts       # 系统托盘
│   │   └── updater.ts    # 自动更新
│   ├── gateway/          # OpenClaw Gateway 进程管理
│   │   ├── manager.ts    # Gateway 管理器
│   │   ├── protocol.ts   # 通信协议定义
│   │   └── clawhub.ts    # ClawHub 服务
│   ├── preload/          # 安全 IPC 桥接脚本
│   └── utils/            # 工具模块
├── src/                   # React 渲染进程
│   ├── components/       # 可复用 UI 组件
│   │   ├── ui/          # 基础组件 (shadcn/ui)
│   │   ├── layout/      # 布局组件
│   │   ├── common/      # 共享组件
│   │   └── settings/    # 设置组件
│   ├── pages/           # 应用页面
│   │   ├── Setup/       # 初始设置向导
│   │   ├── Dashboard/   # 首页仪表盘
│   │   ├── Chat/        # AI 聊天界面
│   │   ├── Channels/    # 频道管理
│   │   ├── Skills/      # 技能浏览器和管理器
│   │   ├── Cron/        # 定时任务
│   │   └── Settings/    # 配置面板
│   ├── stores/          # Zustand 状态仓库
│   ├── lib/             # 前端工具库
│   ├── types/           # TypeScript 类型定义
│   ├── i18n/            # 国际化配置
│   └── assets/          # 静态资源
├── resources/            # 静态资源
├── scripts/              # 构建和实用脚本
└── tests/               # 测试套件
```

### B. 开发命令

```bash
# 初始化项目
pnpm run init

# 开发模式
pnpm dev

# 代码检查
pnpm lint
pnpm typecheck

# 测试
pnpm test
pnpm test:e2e

# 构建
pnpm build
pnpm package
```

### C. 相关链接

- [OpenClaw GitHub](https://github.com/OpenClaw)
- [Electron 文档](https://www.electronjs.org/docs)
- [React 文档](https://react.dev/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Zustand](https://github.com/pmndrs/zustand)
