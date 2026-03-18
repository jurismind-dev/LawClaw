/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_bitable_app_table_view tool -- Manage Feishu Bitable views.
 *
 * P1 Actions: create, get, list, patch, delete
 *
 * Uses the Feishu Bitable v1 API:
 *   - create: POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/views
 *   - get:    GET  /open-apis/bitable/v1/apps/:app_token/tables/:table_id/views/:view_id
 *   - list:   GET  /open-apis/bitable/v1/apps/:app_token/tables/:table_id/views
 *   - patch:  PATCH /open-apis/bitable/v1/apps/:app_token/tables/:table_id/views/:view_id
 *   - delete: DELETE /open-apis/bitable/v1/apps/:app_token/tables/:table_id/views/:view_id
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuBitableAppTableViewTool(api: OpenClawPluginApi): void;
