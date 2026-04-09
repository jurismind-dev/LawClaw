"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Message fetching for the Lark/Feishu channel plugin.
 *
 * Shared between inbound (reaction handler, enrich) and outbound modules.
 * Extracted from `outbound/fetch.ts` to eliminate inbound→outbound
 * dependency inversion.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMessageFeishu = getMessageFeishu;
const content_converter_1 = require("../converters/content-converter.js");
const lark_client_1 = require("../../core/lark-client.js");
const lark_logger_1 = require("../../core/lark-logger.js");
const log = (0, lark_logger_1.larkLogger)('shared/message-lookup');
const user_name_cache_1 = require("../inbound/user-name-cache.js");
const accounts_1 = require("../../core/accounts.js");
// ---------------------------------------------------------------------------
// getMessageFeishu
// ---------------------------------------------------------------------------
/**
 * Retrieve a single message by its ID from the Feishu IM API.
 *
 * Returns a normalised {@link FeishuMessageInfo} object, or `null` if the
 * message cannot be found or the API returns an error.
 *
 * @param params.cfg       - Plugin configuration with Feishu credentials.
 * @param params.messageId - The message ID to fetch.
 * @param params.accountId - Optional account identifier for multi-account setups.
 */
async function getMessageFeishu(params) {
    const { cfg, messageId, accountId, expandForward } = params;
    const larkClient = lark_client_1.LarkClient.fromCfg(cfg, accountId);
    const sdk = larkClient.sdk;
    try {
        const requestOpts = {
            method: 'GET',
            url: `/open-apis/im/v1/messages/mget`,
            params: {
                message_ids: messageId,
                user_id_type: 'open_id',
                card_msg_content_type: 'raw_card_content',
            },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await sdk.request(requestOpts);
        const items = response?.data?.items;
        if (!items || items.length === 0) {
            log.info(`getMessageFeishu: no items returned for ${messageId}`);
            return null;
        }
        const expandCtx = expandForward
            ? {
                cfg,
                accountId,
                fetchSubMessages: async (msgId) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const res = await larkClient.sdk.request({
                        method: 'GET',
                        url: `/open-apis/im/v1/messages/${msgId}`,
                        params: { user_id_type: 'open_id', card_msg_content_type: 'raw_card_content' },
                    });
                    if (res?.code !== 0) {
                        throw new Error(`API error: code=${res?.code} msg=${res?.msg}`);
                    }
                    return res?.data?.items ?? [];
                },
                batchResolveNames: (0, user_name_cache_1.createBatchResolveNames)((0, accounts_1.getLarkAccount)(cfg, accountId), (...args) => log.info(args.map(String).join(' '))),
            }
            : undefined;
        return await parseMessageItem(items[0], messageId, expandCtx);
    }
    catch (error) {
        log.error(`get message failed (${messageId}): ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Parse a single message item from the Feishu IM API response into a
 * normalised {@link FeishuMessageInfo}.
 *
 * Content parsing is delegated to the shared converter system so that
 * every message-type mapping is defined in exactly one place.
 */
async function parseMessageItem(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
msg, fallbackMessageId, expandCtx) {
    const msgType = msg.msg_type ?? 'text';
    const rawContent = msg.body?.content ?? '{}';
    const messageId = msg.message_id ?? fallbackMessageId;
    const acctId = expandCtx?.accountId;
    const ctx = {
        ...(0, content_converter_1.buildConvertContextFromItem)(msg, fallbackMessageId, acctId),
        cfg: expandCtx?.cfg,
        accountId: acctId,
        fetchSubMessages: expandCtx?.fetchSubMessages,
        batchResolveNames: expandCtx?.batchResolveNames,
    };
    const { content } = await (0, content_converter_1.convertMessageContent)(rawContent, msgType, ctx);
    const senderId = msg.sender?.id ?? undefined;
    const senderType = msg.sender?.sender_type ?? undefined;
    const senderName = senderId && acctId ? (0, user_name_cache_1.getUserNameCache)(acctId).get(senderId) : undefined;
    return {
        messageId,
        chatId: msg.chat_id ?? '',
        chatType: msg.chat_type ?? undefined,
        senderId,
        senderName,
        senderType,
        content,
        contentType: msgType,
        createTime: msg.create_time ? parseInt(String(msg.create_time), 10) : undefined,
        threadId: msg.thread_id || undefined,
    };
}
