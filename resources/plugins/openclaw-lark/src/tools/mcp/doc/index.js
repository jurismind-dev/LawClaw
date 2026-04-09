"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * MCP Doc 工具集
 * 统一导出所有 doc 相关工具的注册函数
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuMcpDocTools = registerFeishuMcpDocTools;
const accounts_1 = require("../../../core/accounts.js");
const tools_config_1 = require("../../../core/tools-config.js");
const shared_1 = require("../shared.js");
const fetch_1 = require("./fetch.js");
const create_1 = require("./create.js");
const update_1 = require("./update.js");
/**
 * 注册 MCP Doc 工具（仅保留 create/fetch/update，search/list 已由 OAPI 替代）
 */
function registerFeishuMcpDocTools(api) {
    if (!api.config) {
        api.logger.debug?.('feishu_doc: No config available, skipping');
        return;
    }
    const accounts = (0, accounts_1.getEnabledLarkAccounts)(api.config);
    if (accounts.length === 0) {
        api.logger.debug?.('feishu_doc: No Feishu accounts configured, skipping');
        return;
    }
    // 沿用现有 doc 开关：若所有账户都关闭 doc 工具，则 MCP doc 工具也不注册
    const toolsCfg = (0, tools_config_1.resolveAnyEnabledToolsConfig)(accounts);
    if (!toolsCfg.doc) {
        api.logger.debug?.('feishu_doc: doc tool disabled in all accounts');
        return;
    }
    // 将 mcp_url（若配置）缓存为全局 override，供后续工具调用使用
    const mcpEndpoint = (0, shared_1.extractMcpUrlFromConfig)(api.config);
    (0, shared_1.setMcpEndpointOverride)(mcpEndpoint);
    // 注册工具（search/list 已由 OAPI 版本替代，不再注册）
    const registered = [];
    if ((0, fetch_1.registerFetchDocTool)(api))
        registered.push('feishu_fetch_doc');
    if ((0, create_1.registerCreateDocTool)(api))
        registered.push('feishu_create_doc');
    if ((0, update_1.registerUpdateDocTool)(api))
        registered.push('feishu_update_doc');
    if (registered.length > 0) {
        api.logger.debug?.(`feishu_doc: Registered ${registered.join(', ')}`);
    }
}
