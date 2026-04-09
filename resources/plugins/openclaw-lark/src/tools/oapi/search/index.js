"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Search 工具集
 * 统一导出所有搜索相关工具的注册函数
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuSearchTools = registerFeishuSearchTools;
const accounts_1 = require("../../../core/accounts.js");
const tools_config_1 = require("../../../core/tools-config.js");
const doc_search_1 = require("./doc-search.js");
/**
 * 注册所有 Search 工具
 */
function registerFeishuSearchTools(api) {
    if (!api.config) {
        api.logger.debug?.('feishu_search: No config available, skipping');
        return;
    }
    const accounts = (0, accounts_1.getEnabledLarkAccounts)(api.config);
    if (accounts.length === 0) {
        api.logger.debug?.('feishu_search: No Feishu accounts configured, skipping');
        return;
    }
    // search 工具使用 doc 配置项控制，因为搜索是文档相关功能
    const toolsCfg = (0, tools_config_1.resolveAnyEnabledToolsConfig)(accounts);
    if (!toolsCfg.doc) {
        api.logger.debug?.('feishu_search: search tool disabled in all accounts (controlled by doc config)');
        return;
    }
    // 注册所有工具
    if ((0, doc_search_1.registerFeishuSearchDocWikiTool)(api)) {
        api.logger.debug?.('feishu_search: Registered feishu_search_doc_wiki');
    }
}
