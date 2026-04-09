/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * MCP create-doc 工具
 * 从 Markdown 创建云文档（支持异步 task_id 查询）
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
/**
 * 注册 create-doc 工具
 */
export declare function registerCreateDocTool(api: OpenClawPluginApi): boolean;
