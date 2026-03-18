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
import { convertMessageContent, buildConvertContextFromItem } from '../converters/content-converter';
import { LarkClient } from '../../core/lark-client';
import { larkLogger } from '../../core/lark-logger';
const log = larkLogger('shared/message-lookup');
import { getUserNameCache, createBatchResolveNames } from '../inbound/user-name-cache';
import { getLarkAccount } from '../../core/accounts';
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
export async function getMessageFeishu(params) {
    const { cfg, messageId, accountId, expandForward } = params;
    const larkClient = LarkClient.fromCfg(cfg, accountId);
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
                batchResolveNames: createBatchResolveNames(getLarkAccount(cfg, accountId), (...args) => log.info(args.map(String).join(' '))),
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
        ...buildConvertContextFromItem(msg, fallbackMessageId, acctId),
        cfg: expandCtx?.cfg,
        accountId: acctId,
        fetchSubMessages: expandCtx?.fetchSubMessages,
        batchResolveNames: expandCtx?.batchResolveNames,
    };
    const { content } = await convertMessageContent(rawContent, msgType, ctx);
    const senderId = msg.sender?.id ?? undefined;
    const senderType = msg.sender?.sender_type ?? undefined;
    const senderName = senderId && acctId ? getUserNameCache(acctId).get(senderId) : undefined;
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
