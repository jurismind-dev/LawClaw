/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * MCP update-doc 工具
 * 更新云文档（overwrite/append/replace_range/replace_all/insert_before/insert_after/delete_range，支持异步 task_id 查询）
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
/**
 * 注册 update-doc 工具
 */
export declare function registerUpdateDocTool(api: OpenClawPluginApi): boolean;
