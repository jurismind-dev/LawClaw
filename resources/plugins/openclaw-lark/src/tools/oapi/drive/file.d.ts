/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_drive_file tool -- Manage Feishu Drive files.
 *
 * Actions: list, get_meta, copy, move, delete, upload, download
 *
 * Uses the Feishu Drive API:
 *   - list:        GET    /open-apis/drive/v1/files
 *   - get_meta:    POST   /open-apis/drive/v1/metas/batch_query
 *   - copy:        POST   /open-apis/drive/v1/files/:file_token/copy
 *   - move:        POST   /open-apis/drive/v1/files/:file_token/move
 *   - delete:      DELETE /open-apis/drive/v1/files/:file_token
 *   - upload:      POST   /open-apis/drive/v1/files/upload_all
 *   - download:    GET    /open-apis/drive/v1/files/:file_token/download
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuDriveFileTool(api: OpenClawPluginApi): void;
