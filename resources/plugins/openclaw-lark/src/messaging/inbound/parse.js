"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Event parsing for inbound Feishu messages.
 *
 * Converts a raw FeishuMessageEvent into a normalised MessageContext.
 * All mention information is captured in `mentions: MentionInfo[]`;
 * downstream logic derives `mentionedBot` and non-bot targets from it.
 *
 * When `expandCtx` is provided, `cfg` and `accountId` are passed into
 * the converter context so that async converters (e.g. merge_forward)
 * can make API calls during parsing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMessageEvent = parseMessageEvent;
const content_converter_1 = require("../converters/content-converter.js");
const accounts_1 = require("../../core/accounts.js");
const lark_client_1 = require("../../core/lark-client.js");
const lark_logger_1 = require("../../core/lark-logger.js");
const mention_1 = require("./mention.js");
const user_name_cache_1 = require("./user-name-cache.js");
const parse_io_1 = require("./parse-io.js");
const log = (0, lark_logger_1.larkLogger)('inbound/parse');
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Parse a raw Feishu message event into a normalised MessageContext.
 *
 * @param expandCtx  When provided, cfg/accountId are used to create
 *                   callbacks for async converters (e.g. merge_forward)
 *                   to fetch sub-messages and resolve sender names.
 */
async function parseMessageEvent(event, botOpenId, expandCtx) {
    // 1. Build MentionInfo list from event mentions
    const mentionMap = new Map();
    const mentionList = [];
    let mentionAll = false;
    for (const m of event.message.mentions ?? []) {
        // Detect @all / @所有人: add to mentionMap (for text replacement by
        // resolveMentions) but not mentionList (not a user mention).
        if ((0, mention_1.isMentionAll)(m)) {
            mentionAll = true;
            mentionMap.set(m.key, {
                key: m.key,
                openId: '',
                name: m.name,
                isBot: false,
            });
            continue;
        }
        const openId = m.id?.open_id ?? '';
        if (!openId)
            continue;
        const info = {
            key: m.key,
            openId,
            name: m.name,
            isBot: Boolean(botOpenId && openId === botOpenId),
        };
        mentionMap.set(m.key, info);
        mentionList.push(info);
    }
    // Build reverse map for O(1) openId lookup
    const mentionsByOpenId = new Map();
    for (const info of mentionList) {
        mentionsByOpenId.set(info.openId, info);
    }
    // 2. Convert content via registered converter
    const acctId = expandCtx?.accountId;
    // Create larkClient once when expandCtx is available (used for merge_forward & card fetch)
    const larkClient = expandCtx ? lark_client_1.LarkClient.fromCfg(expandCtx.cfg, acctId) : undefined;
    // Build merge_forward callbacks when expandCtx is provided
    let fetchSubMessages;
    let batchResolveNames;
    if (expandCtx) {
        const account = (0, accounts_1.getLarkAccount)(expandCtx.cfg, acctId);
        fetchSubMessages = (0, parse_io_1.createFetchSubMessages)(larkClient);
        batchResolveNames = (0, parse_io_1.createParseResolveNames)(account);
    }
    // For interactive messages, fetch full v2 card content via API
    let effectiveContent = event.message.content;
    if (event.message.message_type === 'interactive' && expandCtx) {
        const fullContent = await (0, parse_io_1.fetchCardContent)(event.message.message_id, larkClient);
        if (fullContent) {
            effectiveContent = fullContent;
            log.info('replaced interactive content with full v2 card data');
        }
    }
    const convertCtx = {
        mentions: mentionMap,
        mentionsByOpenId,
        messageId: event.message.message_id,
        botOpenId,
        cfg: expandCtx?.cfg,
        accountId: acctId,
        resolveUserName: acctId ? (openId) => (0, user_name_cache_1.getUserNameCache)(acctId).get(openId) : undefined,
        fetchSubMessages,
        batchResolveNames,
        stripBotMentions: true,
    };
    const { content, resources } = await (0, content_converter_1.convertMessageContent)(effectiveContent, event.message.message_type, convertCtx);
    const createTimeStr = event.message.create_time;
    const createTime = createTimeStr ? parseInt(createTimeStr, 10) : undefined;
    return {
        chatId: event.message.chat_id,
        messageId: event.message.message_id,
        senderId: event.sender.sender_id.open_id || '',
        chatType: event.message.chat_type,
        rootId: event.message.root_id || undefined,
        parentId: event.message.parent_id || undefined,
        threadId: event.message.thread_id || undefined,
        content,
        contentType: event.message.message_type,
        resources,
        mentions: mentionList,
        mentionAll,
        createTime: Number.isNaN(createTime) ? undefined : createTime,
        rawMessage: effectiveContent !== event.message.content ? { ...event.message, content: effectiveContent } : event.message,
        rawSender: event.sender,
    };
}
