/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * feishu_wiki_space_node tool -- Manage Feishu Wiki space nodes.
 *
 * Actions: list, get, create, move, copy
 *
 * Uses the Feishu Wiki API:
 *   - list:   GET  /open-apis/wiki/v2/spaces/:space_id/nodes
 *   - get:    GET  /open-apis/wiki/v2/spaces/get_node
 *   - create: POST /open-apis/wiki/v2/spaces/:space_id/nodes
 *   - move:   POST /open-apis/wiki/v2/spaces/:space_id/nodes/:node_token/move
 *   - copy:   POST /open-apis/wiki/v2/spaces/:space_id/nodes/:node_token/copy
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
export declare function registerFeishuWikiSpaceNodeTool(api: OpenClawPluginApi): boolean;
