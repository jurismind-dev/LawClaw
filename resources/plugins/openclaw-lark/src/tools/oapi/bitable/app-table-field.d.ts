/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_bitable_app_table_field tool -- Manage Feishu Bitable fields (columns).
 *
 * P1 Actions: create, list, update, delete
 *
 * Uses the Feishu Bitable v1 API:
 *   - create: POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/fields
 *   - list:   GET  /open-apis/bitable/v1/apps/:app_token/tables/:table_id/fields
 *   - update: PUT  /open-apis/bitable/v1/apps/:app_token/tables/:table_id/fields/:field_id
 *   - delete: DELETE /open-apis/bitable/v1/apps/:app_token/tables/:table_id/fields/:field_id
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuBitableAppTableFieldTool(api: OpenClawPluginApi): void;
