# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**小龙芯 (LawClaw)** is a professional AI assistant desktop application tailored for lawyers and legal professionals. It is built on top of [ClawX](https://github.com/ValueCell-ai/ClawX) by ValueCell Team, with customizations for the legal domain.

**开发团队**：法义经纬 (Jurismind)
**基于项目**：[ClawX](https://github.com/ValueCell-ai/ClawX) by ValueCell Team

## Development Commands

```bash
# Initial setup (install dependencies + download uv)
pnpm run init

# Development with hot reload
pnpm dev

# Code quality
pnpm lint          # Run ESLint with auto-fix
pnpm typecheck     # TypeScript validation

# Testing
pnpm test          # Run unit tests (Vitest)
pnpm test:e2e      # Run E2E tests (Playwright)

# Build & Package
pnpm build         # Full production build
pnpm package       # Package for current platform
pnpm package:mac   # Package for macOS
pnpm package:win   # Package for Windows
pnpm package:linux # Package for Linux
```

## Architecture

小龙芯 (LawClaw) uses a **dual-process architecture**:

### Electron Main Process (`electron/`)
- **main/**: Application entry, window management, IPC handlers, tray, auto-updater
- **gateway/**: OpenClaw Gateway process manager - spawns and communicates with the AI runtime via WebSocket (JSON-RPC)
- **preload/**: Secure IPC bridge between main and renderer processes
- **utils/**: Storage, authentication, path utilities

### React Renderer Process (`src/`)
- **components/**: Reusable UI components (shadcn/ui in `ui/`, layout components in `layout/`)
- **pages/**: Application pages (Setup, Dashboard, Chat, Channels, Skills, Cron, Settings)
- **stores/**: Zustand state management
- **lib/**: Frontend utilities
- **i18n/**: Internationalization (i18next)

### Key Communication Flow
```
Renderer (React) <--IPC--> Main Process <--WebSocket/JSON-RPC--> OpenClaw Gateway
```

The AI runtime (OpenClaw) runs in a separate process managed by the gateway manager. The renderer communicates with it through IPC to the main process, which relays messages via WebSocket.

## Important Files

- `vite.config.ts`: Builds both main and renderer processes
- `electron-builder.yml`: Cross-platform packaging configuration
- `electron/gateway/manager.ts`: Gateway lifecycle management
- `electron/gateway/protocol.ts`: JSON-RPC protocol definitions
- `src/stores/`: Zustand stores for global state

## Tech Stack

- **Runtime**: Electron 40+
- **UI**: React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **State**: Zustand
- **Build**: Vite + electron-builder
- **Test**: Vitest (unit) + Playwright (E2E)
- **Core**: openclaw (AI runtime), clawhub (service integration)

## Package Manager

This project uses **pnpm 9+**. Always use pnpm commands, not npm or yarn.
