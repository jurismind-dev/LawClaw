"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Chat Tools Index
 *
 * 群组相关工具
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuChatTools = registerFeishuChatTools;
const chat_1 = require("./chat.js");
const members_1 = require("./members.js");
function registerFeishuChatTools(api) {
    const registered = [];
    if ((0, chat_1.registerChatSearchTool)(api))
        registered.push('feishu_chat');
    if ((0, members_1.registerChatMembersTool)(api))
        registered.push('feishu_chat_members');
    if (registered.length > 0) {
        api.logger.debug?.(`feishu_chat: Registered ${registered.join(', ')}`);
    }
}
