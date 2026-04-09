"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Sheets 工具集
 * 注册飞书电子表格工具
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuSheetsTools = registerFeishuSheetsTools;
const accounts_1 = require("../../../core/accounts.js");
const tools_config_1 = require("../../../core/tools-config.js");
const sheet_1 = require("./sheet.js");
/**
 * 注册 Sheets 工具
 */
function registerFeishuSheetsTools(api) {
    if (!api.config) {
        api.logger.debug?.('feishu_sheets: No config available, skipping');
        return;
    }
    const accounts = (0, accounts_1.getEnabledLarkAccounts)(api.config);
    if (accounts.length === 0) {
        api.logger.debug?.('feishu_sheets: No Feishu accounts configured, skipping');
        return;
    }
    const toolsCfg = (0, tools_config_1.resolveAnyEnabledToolsConfig)(accounts);
    if (!toolsCfg.sheets) {
        api.logger.debug?.('feishu_sheets: sheets tool disabled in all accounts');
        return;
    }
    if ((0, sheet_1.registerFeishuSheetTool)(api)) {
        api.logger.debug?.('feishu_sheets: Registered feishu_sheet');
    }
}
