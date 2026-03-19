<p align="center">
  <img src="src/assets/logo.svg" width="128" height="128" alt="LawClaw Logo" />
</p>

<h1 align="center">LawClaw (劳有钳)</h1>

<p align="center">
  <strong>An AI assistant desktop app for legal professionals in China</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#why-lawclaw">Why LawClaw</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#development">Development</a> •
  <a href="#contributing">Contributing</a>
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
  English | <a href="README.zh-CN.md">简体中文</a>
</p>

---

## Overview

**LawClaw (劳有钳)** is a locally deployed, open-source AI desktop application deeply customized by the **Jurismind (法义经纬)** team for the legal services vertical. Built on top of the official [OpenClaw](https://github.com/OpenClaw) and [ClawX](https://github.com/ValueCell-ai/ClawX), it provides end-to-end intelligent support for lawyers, in-house counsel, and other legal professionals—from information retrieval to day-to-day productivity assistance.

**Core Mechanism**: LawClaw is a personal AI agent with long-term memory. Powered by the official [OpenClaw](https://github.com/OpenClaw) runtime and the polished, user-friendly cross-platform desktop experience of [ClawX](https://github.com/ValueCell-ai/ClawX), LawClaw supports fully local deployment: files stay on your machine and do not need to be uploaded to the cloud. It can serve as your “digital steward.” With the same system permissions as the user, it can execute terminal operations, script writing, and tool calls in the background based on natural-language instructions, enabling efficient collaboration across software and devices.

**Specialized Capabilities**: LawClaw is deeply customized for legal workflows. Through the built-in JurisHub vertical legal community skill repository, it provides a rich set of legal domain skills covering intelligent legal research, complex document analysis, advertising compliance review, contract drafting and revision, contract compliance management, and first-draft opinion writing—meeting a wide range of needs across information retrieval, content generation, and productivity assistance.

**Ready to Use with Official Compute Support**: To help legal professionals avoid tedious parameter configuration, LawClaw offers a low-barrier and flexible compute access model. The easiest option is to register and sign in with a **Jurismind (法义经纬)** account, then use account credits as the token budget required to run the assistant—without complex setup. At the same time, in keeping with an open approach, the app also provides configuration entry points for third-party compute providers, allowing users to choose from supported model vendors and use their own API keys. In addition, under the same account system, the Jurismind team also provides a WebApp that can be accessed and run directly in a mobile browser, so users can communicate with their LawClaw assistant from a phone after signing in.

**Community Vision**: We embrace the spirit of open source, openness, and co-creation, and we are committed to building an AI ecosystem dedicated to legal professionals. Here, technology and law come together deeply—and we look forward to joining forces with you to help drive change across the industry.

**Developed By**: [Jurismind (法义经纬)](https://jurismind.com)

**Built On**: Customized on top of [ClawX](https://github.com/ValueCell-ai/ClawX) and [OpenClaw](https://github.com/openclaw/openclaw)

**Disclaimer**: This software service and any AI-generated content are provided for reference only and may contain errors, omissions, or outdated information. LawClaw does not constitute legal advice, legal opinion, or legal services. Users should verify outputs independently and consult qualified legal professionals when necessary.

---

## Screenshots

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

## Why LawClaw

**Not just chatting, but executing.**

Most AI tools on the legal market today still operate at the level of “chatbot assistants” or isolated point solutions. They can provide information, but you remain the final executor—copying, pasting, switching between tools, and manually consolidating the results.

LawClaw aims to bridge the gap from “providing suggestions” to “executing tasks autonomously.” It is a true AI Agent that can translate natural-language instructions into executable steps and become a “digital legal assistant” inside your local environment.

**From passive Q&A to autonomous task execution**

- **Traditional AI**: Relies on back-and-forth prompting. Handling complex tasks—such as drafting work that involves multiple files and information sources—often requires users to break the task down manually, provide repeated prompts, and stitch the results together themselves.
- **LawClaw**: Task-oriented by design. You provide a natural-language instruction, and it can decompose the task, plan the path, and coordinate different underlying skills to complete an end-to-end workflow from information retrieval and comparison to first-draft generation.

**From fixed tools to an evolving skill ecosystem**

- **Traditional AI**: Features are typically vendor-defined and hard to adapt to the highly customized working styles of different law firms or legal teams.
- **LawClaw**: Embraces an open ecosystem. You can freely combine or develop dedicated “skills” much like installing apps. Whether it is a specific case research strategy or an internal document archiving standard, LawClaw can be “taught,” continuously improved, and made more aligned with how you work.

| Traditional Workflow | LawClaw Intelligent Workflow |
| --- | --- |
| Legal research: moving back and forth between multiple databases, filtering keywords, reading materials one by one, and summarizing them manually. | Intelligent legal research: with a single instruction, automatically search across platforms, analyze the relationship between statutes and cases, and generate structured summaries and research conclusions. |
| Contract review: reading clauses one by one, comparing against templates, marking risks manually, and relying on people to manage revisions, audit trails, and archiving. | Contract analysis and management: automatically identify risks, compare version differences, extract key clauses, and complete revisions and archiving through an assisted redlining workflow. |
| Legal drafting: searching for templates, copying and pasting source materials, repeatedly asking AI for help, and iterating on formatting and wording over multiple rounds. | Legal drafting and revision: quickly generate first drafts of lawyer letters, complaints, legal opinions, and more based on case facts, while standardizing format, refining wording, and supporting ongoing iterative revision. |
| Advertising compliance: manually checking prohibited phrases and reviewing regulations item by item, which is time-consuming and easy to miss. | Advertising compliance review: quickly scan marketing materials, generate multi-dimensional compliance opinions, standardize output formatting, and archive results to designated folders. |

**Pre-tuned OpenClaw**

Compared with the more technical setup flow and longer early-stage tuning process of the official OpenClaw, LawClaw is customized by the [Jurismind (法义经纬)](https://jurismind.com) team for legal work in China. The product includes dozens of skills built around the everyday tasks of Chinese legal professionals, supports one-click installation and ready-to-use operation, and is paired with dedicated tutorials plus the JurisHub vertical legal community skill repository to help users get started, exchange ideas, and continue expanding capabilities more efficiently.

---

## Features

LawClaw (劳有钳) is not just a chat box. It is an agent platform purpose-built for the legal industry, powered by a strong core architecture and a continuously growing open-source skill ecosystem.

### Core Platform Architecture

**🎯 A ready-to-use professional workspace**

- Designed for legal professionals, it provides a multi-tab workspace similar to an IDE. From installation to the first consultation, the full process can be completed through a visual interface; API credentials are stored securely via the system-native keychain, and light / dark themes are supported automatically.

**🧠 Context management and intelligent memory**

- With an extended context window, LawClaw can accurately track complex conversational logic. Even after dozens of in-depth turns, it can still retrieve key prior facts and instructions, helping maintain continuity and accuracy in legal analysis.

**🧩 Open Skill Store and secure ecosystem**

- A built-in open skill store lets you expand AI capabilities with one click, much like installing browser extensions. We encourage community co-creation and allow users to submit custom skills, while all third-party skills are subject to strict official code security review and quality control to ensure an ecosystem that is both open and reliable for legal-grade workflows.

### Officially Curated Legal Skills

The LawClaw team has independently developed and carefully curated a series of high-quality, open-source legal skills that can be used directly and modified as needed. Representative built-in capabilities include, but are not limited to:

**📋 Deep contract review and comparison**

- More than simple keyword matching. The system can intelligently extract key contract clauses, automatically highlight potential compliance risks and logical issues, and provide revision suggestions.

**📚 Automated legal and case research**

- After you input the case facts, the agent proactively plans a research path across authoritative sources, automatically aggregates and analyzes relevant regulations and precedents, and produces case summaries plus legal issue analysis reports.

**📝 Structured legal document generation**

- Based on a fact-based generation logic, LawClaw can invoke built-in templates to draft first versions of lawyer letters, complaints, and legal opinions, while completing basic formatting and logic checks and supporting export to standard documents.

**✨ More official and community skills...**

- Including advertising compliance review, contract translation, contract management, and more practical skills, all of which can be obtained and continuously updated through the LawClaw skill store.

---

## Getting Started

### System Requirements

- **Operating System**: macOS 11+, Windows 10+, or Linux (Ubuntu 20.04+)
- **Memory**: 4GB RAM minimum (8GB recommended)
- **Storage**: 1GB available disk space

### Installation

#### Pre-built Releases (Recommended)

Download the latest version for your platform from OSS (China mirror):
<!--`https://lawclaw.oss-cn-shanghai.aliyuncs.com/latest/`-->

GitHub Releases remains available as a fallback download channel: [Releases](https://github.com/jurismind-dev/LawClaw/releases).

#### Build from Source

```bash
# Clone the repository
git clone https://github.com/jurismind-dev/LawClaw
cd LawClaw

# Initialize the project
pnpm run init

# Start in development mode
pnpm dev
```

### First Launch

When you launch LawClaw (劳有钳) for the first time, the **Setup Wizard** will guide you through the following steps:

1. **Language** — Configure your preferred language (`中文 / English / 日本語`)
2. **Environment Check** — Check the Node.js runtime, OpenClaw package, and gateway status
3. **AI Providers** — Configure supported model providers (including `Jurismind（法义经纬）`, `Kimi Coding（官方）`, and `GLM - Code Plan（智谱-编程包月）`). `Jurismind（法义经纬）` uses browser-based sign-in authorization, while some providers only require an API key.
4. **Messaging Platforms (Optional)** — Configure `Jurismind（法义经纬）` and `Feishu / Lark` in the setup wizard. `Jurismind（法义经纬）` provides a pairing and binding entry point, while `Feishu / Lark` uses the official guided setup panel. Additional channels can be added later in Settings after entering the main interface.
5. **Base Component Installation** — Install or check `uv`, the managed Python runtime, and the preset skill / plugin installation set.
6. **Final Confirmation** — Review configured AI providers, installed components, and gateway status before entering the main interface.

---

## Architecture

LawClaw uses a **dual-process architecture** that separates the UI layer from AI runtime operations, balancing interaction quality and runtime stability:

```
┌─────────────────────────────────────────────────────────────────┐
│                        LawClaw Desktop App                     │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Electron Main Process                         │  │
│  │  • Window and application lifecycle management             │  │
│  │  • Gateway process management and status forwarding        │  │
│  │  • System integration (tray, menus, external links)       │  │
│  │  • Auto-update orchestration                              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              │ IPC                              │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              React Renderer Process                       │  │
│  │  • Modern component-based UI (React 19)                  │  │
│  │  • Zustand state management                              │  │
│  │  • IPC communication with the main process               │  │
│  │  • Rich Markdown rendering                               │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ WebSocket (JSON-RPC)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      OpenClaw Gateway                          │
│                                                                 │
│  • AI agent runtime and orchestration                          │
│  • Messaging channel management                                │
│  • Skill / plugin execution environment                        │
│  • Provider abstraction layer                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Design Principles

- **Process Isolation**: The AI runtime runs in a separate process, so the UI remains responsive even under heavy computation.
- **Graceful Recovery**: Built-in reconnection logic with exponential backoff can automatically handle transient failures.
- **Local Persistence**: Provider configuration and API keys are currently persisted locally via `electron-store`, without depending on cloud synchronization.
- **Hot Reload**: Development mode supports immediate UI updates without restarting the gateway.

---

## Development

### Prerequisites

- **Node.js**: 22+ (LTS recommended)
- **Package Manager**: pnpm 10+ (this repository is currently locked to pnpm 10, so pnpm is preferred)

### Project Structure

```
LawClaw/
├── electron/              # Electron main process
│   ├── main/              # Application entry, window management
│   ├── gateway/           # OpenClaw gateway process management
│   ├── preload/           # Secure IPC bridge scripts
│   └── utils/             # Utility modules (storage, auth, paths)
├── src/                   # React renderer process
│   ├── components/        # Reusable UI components
│   │   ├── ui/            # Base components (shadcn/ui)
│   │   ├── layout/        # Layout components (sidebar, header)
│   │   └── common/        # Shared components
│   ├── pages/             # Application pages
│   │   ├── Setup/         # Initial setup wizard
│   │   ├── Dashboard/     # Home dashboard
│   │   ├── Chat/          # AI chat interface
│   │   ├── Channels/      # Channel management
│   │   ├── Skills/        # Skill browsing and management
│   │   ├── Cron/          # Scheduled tasks
│   │   └── Settings/      # Configuration panel
│   ├── stores/            # Zustand state stores
│   ├── lib/               # Front-end utility library
│   └── types/             # TypeScript type definitions
├── resources/             # Static and bundled assets (icons, images, preset install manifests, plugins, etc.)
├── scripts/               # Build and utility scripts
└── tests/                 # Test suites
```

### Available Commands

```bash
# Initialization
pnpm run init             # Install dependencies and download the bundled uv runtime (required for first-time development)

# Development
pnpm dev                  # Start Vite development mode (including the Electron integrated workflow)
pnpm dev:setup            # Force development mode into the setup wizard

# Code quality
pnpm lint                 # Run ESLint and auto-fix issues that can be fixed
pnpm typecheck            # Run TypeScript type checks

# Testing
pnpm test                 # Run unit tests
pnpm test:e2e             # Run Playwright E2E tests

# Build and package
pnpm run build:vite       # Build front-end and Electron code only
pnpm build                # Run a full production build and package the desktop app
pnpm package              # Package for the current platform
pnpm package:mac          # Package for macOS
pnpm package:win          # Package for Windows
pnpm package:linux        # Package for Linux
```

### Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Electron 40+ |
| UI Framework | React 19 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State Management | Zustand |
| Build Tooling | Vite + electron-builder |
| Testing | Vitest + Playwright |
| Animation | Framer Motion |
| Icons | Lucide React |

---

## Contributing

We welcome community contributions. Whether you are fixing bugs, building new features, improving documentation, or contributing translations, every contribution helps LawClaw continue to improve.

### How to Contribute

1. **Fork** this repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** changes with clear descriptions
4. **Push** to your branch
5. **Open** a Pull Request

### Guidelines

- Follow the existing code style (ESLint + Prettier)
- Write tests for new functionality
- Update documentation as needed
- Keep commits atomic and clearly described

---

## Acknowledgments

LawClaw (劳有钳) is built on top of the following outstanding open-source projects:

- **[ClawX](https://github.com/ValueCell-ai/ClawX)** – The upstream foundation of this project, developed and maintained by the ValueCell Team
- **[OpenClaw](https://github.com/OpenClaw)** – The AI agent runtime
- [Electron](https://www.electronjs.org/) – Cross-platform desktop framework
- [React](https://react.dev/) – UI component library
- [shadcn/ui](https://ui.shadcn.com/) – Beautifully designed component library
- [Zustand](https://github.com/pmndrs/zustand) – Lightweight state management

---

## Community

Welcome to join our community to connect with other users, get help, and share your experience.

- **windows x64**：https://lawclaw.oss-cn-shanghai.aliyuncs.com/latest/LawClaw-win-x64.exe
- **Mac x64**：https://lawclaw.oss-cn-shanghai.aliyuncs.com/latest/LawClaw-mac-x64.dmg
- **Mac arm**：https://lawclaw.oss-cn-shanghai.aliyuncs.com/latest/LawClaw-mac-arm64.dmg

---

## License

LawClaw is released under the [MIT License](LICENSE). You are free to use, modify, and distribute this software within the scope of the license.

---

<p align="center">
  <sub>Built with ❤️ by Jurismind (法义经纬)</sub>
</p>
