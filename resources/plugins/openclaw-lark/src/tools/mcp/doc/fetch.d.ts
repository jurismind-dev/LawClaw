/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * MCP fetch-doc 工具
 * 查看云文档内容（返回标题与 Markdown，支持分页）
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
/**
 * 注册 fetch-doc 工具
 */
export declare function registerFetchDocTool(api: OpenClawPluginApi): boolean;
