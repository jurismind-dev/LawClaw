"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Converter for "share_chat" and "share_user" message types.
 */
import { safeParse } from './utils';
export const convertShareChat = (raw) => {
    const parsed = safeParse(raw);
    const chatId = parsed?.chat_id ?? '';
    return {
        content: `<group_card id="${chatId}"/>`,
        resources: [],
    };
};
export const convertShareUser = (raw) => {
    const parsed = safeParse(raw);
    const userId = parsed?.user_id ?? '';
    return {
        content: `<contact_card id="${userId}"/>`,
        resources: [],
    };
};
