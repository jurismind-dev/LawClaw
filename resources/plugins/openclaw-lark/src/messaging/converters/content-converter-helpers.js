"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Shared helper functions for Feishu content converters.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMentionOpenId = extractMentionOpenId;
exports.buildConvertContextFromItem = buildConvertContextFromItem;
exports.resolveMentions = resolveMentions;
const user_name_cache_1 = require("../inbound/user-name-cache.js");
const utils_1 = require("./utils.js");
/** 从 mention 的 id 字段提取 open_id（兼容事件推送的对象格式和 API 响应的字符串格式） */
function extractMentionOpenId(id) {
    if (typeof id === 'string')
        return id;
    if (id != null && typeof id === 'object' && 'open_id' in id) {
        const openId = id.open_id;
        return typeof openId === 'string' ? openId : '';
    }
    return '';
}
/**
 * Build a {@link ConvertContext} from a raw Feishu API message item.
 *
 * Extracts the `mentions` array that the IM API returns on each message
 * item and maps it into the key→MentionInfo / openId→MentionInfo
 * structures the converter system expects.
 */
function buildConvertContextFromItem(item, fallbackMessageId, accountId) {
    const mentions = new Map();
    const mentionsByOpenId = new Map();
    for (const m of item.mentions ?? []) {
        const openId = extractMentionOpenId(m.id);
        if (!openId)
            continue;
        const info = {
            key: m.key,
            openId,
            name: m.name ?? '',
            isBot: false,
        };
        mentions.set(m.key, info);
        mentionsByOpenId.set(openId, info);
    }
    return {
        mentions,
        mentionsByOpenId,
        messageId: item.message_id ?? fallbackMessageId,
        accountId,
        resolveUserName: accountId ? (openId) => (0, user_name_cache_1.getUserNameCache)(accountId).get(openId) : undefined,
    };
}
/**
 * Resolve mention placeholders in text.
 *
 * - Bot mentions: remove the placeholder key and any preceding `@botName`
 *   entirely (with trailing whitespace).
 * - Non-bot mentions: replace the placeholder key with readable `@name`.
 */
function resolveMentions(text, ctx) {
    if (ctx.mentions.size === 0)
        return text;
    let result = text;
    for (const [key, info] of ctx.mentions) {
        if (info.isBot && ctx.stripBotMentions) {
            result = result.replace(new RegExp(`@${(0, utils_1.escapeRegExp)(info.name)}\\s*`, 'g'), '').trim();
            result = result.replace(new RegExp((0, utils_1.escapeRegExp)(key) + '\\s*', 'g'), '').trim();
        }
        else {
            result = result.replace(new RegExp((0, utils_1.escapeRegExp)(key), 'g'), `@${info.name}`);
        }
    }
    return result;
}
