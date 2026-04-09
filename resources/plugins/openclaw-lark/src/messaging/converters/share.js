"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "share_chat" and "share_user" message types.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertShareUser = exports.convertShareChat = void 0;
const utils_1 = require("./utils.js");
const convertShareChat = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const chatId = parsed?.chat_id ?? '';
    return {
        content: `<group_card id="${chatId}"/>`,
        resources: [],
    };
};
exports.convertShareChat = convertShareChat;
const convertShareUser = (raw) => {
    const parsed = (0, utils_1.safeParse)(raw);
    const userId = parsed?.user_id ?? '';
    return {
        content: `<contact_card id="${userId}"/>`,
        resources: [],
    };
};
exports.convertShareUser = convertShareUser;
