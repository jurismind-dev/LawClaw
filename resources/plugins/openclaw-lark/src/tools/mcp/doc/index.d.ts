/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * MCP Doc 工具集
 * 统一导出所有 doc 相关工具的注册函数
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
/**
 * 注册 MCP Doc 工具（仅保留 create/fetch/update，search/list 已由 OAPI 替代）
 */
export declare function registerFeishuMcpDocTools(api: OpenClawPluginApi): void;
