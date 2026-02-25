# Repository Guidelines

## 项目结构与模块组织
- `src/`：React 渲染进程代码，核心子目录包括 `components/`、`pages/`、`stores/`、`i18n/`、`lib/`、`styles/`。
- `electron/`：Electron 主进程与桥接层，按 `main/`、`preload/`、`gateway/`、`utils/` 组织。
- `tests/`：测试入口与用例，`tests/setup.ts` 提供全局 mock，`tests/unit/` 放置单元测试。
- `scripts/`：构建与资源脚本（如 `bundle-openclaw.mjs`、`download-bundled-uv.mjs`）；静态资源在 `resources/`。
- `dist/` 与 `dist-electron/` 为构建产物目录，不应手工修改。

## 构建、测试与开发命令
- `pnpm run init`：安装依赖并下载 bundled uv 运行时（首次开发必跑）。
- `pnpm dev`：启动 Vite 开发模式（含 Electron 集成开发流程）。
- `pnpm lint`：执行 ESLint 并自动修复可修复问题。
- `pnpm typecheck`：执行 TypeScript 严格类型检查（`--noEmit`）。
- `pnpm test`：运行 Vitest 单元测试。
- `pnpm run build:vite`：仅构建前后端代码；`pnpm build` 额外打包 OpenClaw 与桌面应用。
- `pnpm package:win|mac|linux`：按平台生成安装包。

## 代码风格与命名规范
- 语言与框架：TypeScript + React，启用 `strict`，尽量避免 `any`。
- Prettier 规范：2 空格缩进、单引号、保留分号、`trailingComma: es5`、`printWidth: 100`。
- 命名约定：组件文件用 PascalCase（如 `MainLayout.tsx`）；store/工具模块用小写或 camelCase（如 `chat.ts`、`providers.ts`）。
- 导入优先使用路径别名：`@/*` 与 `@electron/*`。

## 测试规范
- 测试栈：Vitest + Testing Library + jsdom（见 `vitest.config.ts`）。
- 用例命名：`*.test.ts` / `*.test.tsx`，按功能归档到 `tests/` 对应目录。
- 提交前最小验证：`pnpm lint && pnpm typecheck && pnpm test`。
- 覆盖率支持 text/json/html 报告；当前未设置强制阈值，新增功能需覆盖成功路径与关键异常分支。

## 提交与 PR 规范
- 提交信息遵循 Conventional Commits：`feat(scope): ...`、`fix(scope): ...`、`docs: ...`、`chore: ...`。
- 保持单一变更主题，避免把重构与行为变更混在同一提交。
- PR 需包含：变更摘要、关联 Issue（如 `#153`）、风险说明/回滚思路；UI 变更附截图。
- 发起评审前确保 CI 关键检查可通过：`lint`、`typecheck`、`test`、`build:vite`。

## 安全与配置提示
- 禁止提交真实密钥或敏感配置，使用 `.env.example` 作为模板。
- 若需运行 Python 脚本（如 `scripts/crop_qr.py`），优先使用仓库内 `.venv`，并通过 `.venv\Scripts\python -m ...` 执行，避免污染全局环境。
