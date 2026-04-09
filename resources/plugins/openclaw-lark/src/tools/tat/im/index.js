"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * IM 工具集
 * 统一导出所有即时通讯相关工具的注册函数
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuImTools = registerFeishuImTools;
const resource_1 = require("./resource.js");
/**
 * 注册所有 IM 工具
 *
 * Note: feishu_im_message_reaction 和 feishu_im_message_recall 已移除，
 * 其功能由 ChannelMessageActionAdapter (actions.ts) 的 react/delete action 统一覆盖。
 */
function registerFeishuImTools(api) {
    if ((0, resource_1.registerFeishuImBotImageTool)(api)) {
        api.logger.debug?.('feishu_im: Registered feishu_im_bot_image');
    }
}
