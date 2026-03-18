/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_wiki_space tool -- Manage Feishu Wiki spaces.
 *
 * Actions: list, get, create
 *
 * Uses the Feishu Wiki API:
 *   - list:   GET  /open-apis/wiki/v2/spaces
 *   - get:    GET  /open-apis/wiki/v2/spaces/:space_id
 *   - create: POST /open-apis/wiki/v2/spaces
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuWikiSpaceTool(api: OpenClawPluginApi): void;
