/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_bitable_app tool -- Manage Feishu Bitable apps (multidimensional tables).
 *
 * P0 Actions: create, get, list, patch
 * P1 Actions: copy
 *
 * Uses the Feishu Bitable v1 API:
 *   - create: POST /open-apis/bitable/v1/apps
 *   - get:    GET  /open-apis/bitable/v1/apps/:app_token
 *   - list:   GET  /open-apis/drive/v1/files (filtered by type=bitable)
 *   - patch:  PATCH /open-apis/bitable/v1/apps/:app_token
 *   - copy:   POST /open-apis/bitable/v1/apps/:app_token/copy
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuBitableAppTool(api: OpenClawPluginApi): void;
