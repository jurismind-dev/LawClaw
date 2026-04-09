"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Drive 工具集
 * 统一导出所有云空间相关工具的注册函数
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuDriveTools = registerFeishuDriveTools;
const accounts_1 = require("../../../core/accounts.js");
const tools_config_1 = require("../../../core/tools-config.js");
const file_1 = require("./file.js");
const doc_comments_1 = require("./doc-comments.js");
const doc_media_1 = require("./doc-media.js");
/**
 * 注册所有 Drive 工具
 */
function registerFeishuDriveTools(api) {
    if (!api.config) {
        api.logger.debug?.('feishu_drive: No config available, skipping');
        return;
    }
    const accounts = (0, accounts_1.getEnabledLarkAccounts)(api.config);
    if (accounts.length === 0) {
        api.logger.debug?.('feishu_drive: No Feishu accounts configured, skipping');
        return;
    }
    const toolsCfg = (0, tools_config_1.resolveAnyEnabledToolsConfig)(accounts);
    if (!toolsCfg.drive) {
        api.logger.debug?.('feishu_drive: drive tool disabled in all accounts');
        return;
    }
    // 注册所有工具
    const registered = [];
    if ((0, file_1.registerFeishuDriveFileTool)(api))
        registered.push('feishu_drive_file');
    if ((0, doc_comments_1.registerDocCommentsTool)(api))
        registered.push('feishu_doc_comments');
    if ((0, doc_media_1.registerDocMediaTool)(api))
        registered.push('feishu_doc_media');
    if (registered.length > 0) {
        api.logger.debug?.(`feishu_drive: Registered ${registered.join(', ')}`);
    }
}
