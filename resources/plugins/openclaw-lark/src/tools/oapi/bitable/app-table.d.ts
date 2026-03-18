/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_bitable_app_table tool -- Manage Feishu Bitable tables.
 *
 * P0 Actions: create, list, patch, delete
 * P1 Actions: batch_create, batch_delete
 *
 * Uses the Feishu Bitable v1 API:
 *   - create: POST /open-apis/bitable/v1/apps/:app_token/tables
 *   - list:   GET  /open-apis/bitable/v1/apps/:app_token/tables
 *   - patch:  PATCH /open-apis/bitable/v1/apps/:app_token/tables/:table_id
 *   - delete: DELETE /open-apis/bitable/v1/apps/:app_token/tables/:table_id
 *   - batch_create: POST /open-apis/bitable/v1/apps/:app_token/tables/batch_create
 *   - batch_delete: POST /open-apis/bitable/v1/apps/:app_token/tables/batch_delete
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuBitableAppTableTool(api: OpenClawPluginApi): void;
