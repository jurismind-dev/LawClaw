/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_search_doc_wiki tool -- Search Feishu documents and wikis.
 *
 * Actions: search
 *
 * Uses the Feishu Search API:
 *   - search: POST /open-apis/search/v2/doc_wiki/search
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuSearchDocWikiTool(api: OpenClawPluginApi): boolean;
