/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_task_section tool -- Manage Feishu task sections.
 *
 * P0 Actions: create, get, list, patch, tasks
 *
 * Uses the Feishu Task v2 API:
 *   - create: POST /open-apis/task/v2/sections
 *   - get:    GET  /open-apis/task/v2/sections/:section_guid
 *   - patch:  PATCH /open-apis/task/v2/sections/:section_guid
 *   - list:   GET  /open-apis/task/v2/sections
 *   - tasks:  GET  /open-apis/task/v2/sections/:section_guid/tasks
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuTaskSectionTool(api: OpenClawPluginApi): void;
