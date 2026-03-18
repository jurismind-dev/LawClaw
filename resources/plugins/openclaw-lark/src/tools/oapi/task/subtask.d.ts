/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_task_subtask tool -- Manage Feishu task subtasks.
 *
 * P1 Actions: create, list
 *
 * Uses the Feishu Task v2 API:
 *   - create: POST /open-apis/task/v2/tasks/:task_guid/subtasks
 *   - list:   GET  /open-apis/task/v2/tasks/:task_guid/subtasks
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuTaskSubtaskTool(api: OpenClawPluginApi): void;
