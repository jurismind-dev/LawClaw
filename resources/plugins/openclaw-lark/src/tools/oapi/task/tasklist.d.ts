/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_task_tasklist tool -- Manage Feishu task lists.
 *
 * P0 Actions: create, get, list, tasks
 * P1 Actions: patch, add_members
 *
 * Uses the Feishu Task v2 API:
 *   - create: POST /open-apis/task/v2/tasklists
 *   - get:    GET  /open-apis/task/v2/tasklists/:tasklist_guid
 *   - list:   GET  /open-apis/task/v2/tasklists
 *   - tasks:  GET  /open-apis/task/v2/tasklists/:tasklist_guid/tasks
 *   - patch:  PATCH /open-apis/task/v2/tasklists/:tasklist_guid
 *   - add_members: POST /open-apis/task/v2/tasklists/:tasklist_guid/add_members
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuTaskTasklistTool(api: OpenClawPluginApi): void;
