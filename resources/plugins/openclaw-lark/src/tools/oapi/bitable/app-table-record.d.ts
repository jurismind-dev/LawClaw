/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_bitable_app_table_record tool -- Manage Feishu Bitable records.
 *
 * P0 Actions: create, list, update, delete
 * P1 Actions: batch_create, batch_update, batch_delete
 *
 * Uses the Feishu Bitable v1 API:
 *   - create: POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records
 *   - list:   POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/search (旧 list API 已废弃)
 *   - update: PUT  /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/:record_id
 *   - delete: DELETE /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/:record_id
 *   - batch_create: POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/batch_create
 *   - batch_update: POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/batch_update
 *   - batch_delete: POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/batch_delete
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuBitableAppTableRecordTool(api: OpenClawPluginApi): void;
