"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * IM Tools Index
 *
 * 即时通讯相关工具
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFeishuImTools = registerFeishuImTools;
const message_1 = require("./message.js");
const resource_1 = require("./resource.js");
const message_read_1 = require("./message-read.js");
function registerFeishuImTools(api) {
    const registered = [];
    if ((0, message_1.registerFeishuImUserMessageTool)(api))
        registered.push('feishu_im_user_message');
    if ((0, resource_1.registerFeishuImUserFetchResourceTool)(api))
        registered.push('feishu_im_user_fetch_resource');
    registered.push(...(0, message_read_1.registerMessageReadTools)(api));
    if (registered.length > 0) {
        api.logger.debug?.(`feishu_im: Registered ${registered.join(', ')}`);
    }
}
