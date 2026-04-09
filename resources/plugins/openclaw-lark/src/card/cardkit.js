"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * CardKit streaming APIs for Lark/Feishu.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCardEntity = createCardEntity;
exports.streamCardContent = streamCardContent;
exports.updateCardKitCard = updateCardKitCard;
exports.updateCardKitCardForAuth = updateCardKitCardForAuth;
exports.sendCardByCardId = sendCardByCardId;
exports.setCardStreamingMode = setCardStreamingMode;
const lark_client_1 = require("../core/lark-client.js");
const lark_logger_1 = require("../core/lark-logger.js");
const message_unavailable_1 = require("../core/message-unavailable.js");
const targets_1 = require("../core/targets.js");
const card_error_1 = require("./card-error.js");
const log = (0, lark_logger_1.larkLogger)('card/cardkit');
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * 记录 CardKit API 响应日志，检测错误码并抛出异常。
 *
 * 默认 fail-fast：body-level 非零 code 视为业务错误，立即抛出，
 * 由调用方（streaming-card-controller 等）统一走 catch → guard 处理。
 */
function logCardKitResponse(params) {
    const { resp, api, context } = params;
    const { code, msg } = resp;
    log.info(`cardkit ${api} response`, { code, msg, context });
    if (code && code !== 0) {
        log.warn(`cardkit ${api} FAILED`, {
            code,
            msg,
            context,
            fullResponse: resp,
        });
        throw new card_error_1.CardKitApiError({ api, code, msg: msg ?? '', context });
    }
}
// ---------------------------------------------------------------------------
// CardKit streaming APIs
// ---------------------------------------------------------------------------
/**
 * Create a card entity via the CardKit API.
 *
 * Returns the card_id directly, bypassing the idConvert step.
 * The card can then be sent via IM API and streamed via CardKit.
 */
async function createCardEntity(params) {
    const { cfg, card, accountId } = params;
    const client = lark_client_1.LarkClient.fromCfg(cfg, accountId).sdk;
    // SDK 返回类型不完整，运行时包含 code/msg/data 字段
    const response = (await client.cardkit.v1.card.create({
        data: {
            type: 'card_json',
            data: JSON.stringify(card),
        },
    }));
    // 兼容不同 SDK 包装层：优先 data.card_id，回退顶层 card_id
    const cardId = (response.data?.card_id ?? response.card_id) ?? null;
    logCardKitResponse({
        resp: response,
        api: 'card.create',
        context: `cardId=${cardId}`,
    });
    return cardId;
}
/**
 * Stream text content to a specific card element using the CardKit API.
 *
 * The card automatically diffs the new content against the previous
 * content and renders incremental changes with a typewriter animation.
 *
 * @param params.cardId    - CardKit card ID (from `convertMessageToCardId`).
 * @param params.elementId - The element ID to update (e.g. `STREAMING_ELEMENT_ID`).
 * @param params.content   - The full cumulative text (not a delta).
 * @param params.sequence  - Monotonically increasing sequence number.
 */
async function streamCardContent(params) {
    const { cfg, cardId, elementId, content, sequence, accountId } = params;
    const client = lark_client_1.LarkClient.fromCfg(cfg, accountId).sdk;
    // SDK 返回类型不完整，运行时包含 code/msg 字段
    const resp = (await client.cardkit.v1.cardElement.content({
        data: { content, sequence },
        path: { card_id: cardId, element_id: elementId },
    }));
    logCardKitResponse({
        resp,
        api: 'cardElement.content',
        context: `seq=${sequence}, contentLen=${content.length}`,
    });
}
/**
 * Fully replace a card using the CardKit API.
 *
 * Used for the final "complete" state update (with action buttons, green
 * header, etc.) after streaming finishes.
 *
 * @param params.cardId   - CardKit card ID.
 * @param params.card     - The new card JSON content.
 * @param params.sequence - Monotonically increasing sequence number.
 */
async function updateCardKitCard(params) {
    const { cfg, cardId, card, sequence, accountId } = params;
    const client = lark_client_1.LarkClient.fromCfg(cfg, accountId).sdk;
    // SDK 返回类型不完整，运行时包含 code/msg 字段
    const resp = (await client.cardkit.v1.card.update({
        data: {
            card: { type: 'card_json', data: JSON.stringify(card) },
            sequence,
        },
        path: { card_id: cardId },
    }));
    logCardKitResponse({
        resp,
        api: 'card.update',
        context: `seq=${sequence}, cardId=${cardId}`,
    });
}
async function updateCardKitCardForAuth(params) {
    return updateCardKitCard(params);
}
/**
 * Send an interactive card message by referencing a CardKit card_id.
 *
 * The content format is: {"type":"card","data":{"card_id":"xxx"}}
 * This links the IM message to the CardKit card entity, enabling
 * streaming updates via cardElement.content().
 */
async function sendCardByCardId(params) {
    const { cfg, to, cardId, replyToMessageId, replyInThread, accountId } = params;
    const client = lark_client_1.LarkClient.fromCfg(cfg, accountId).sdk;
    const contentPayload = JSON.stringify({
        type: 'card',
        data: { card_id: cardId },
    });
    if (replyToMessageId) {
        // 规范化 message_id，处理合成 ID（如 "om_xxx:auth-complete"）
        const normalizedId = (0, targets_1.normalizeMessageId)(replyToMessageId);
        const response = await (0, message_unavailable_1.runWithMessageUnavailableGuard)({
            messageId: normalizedId,
            operation: 'im.message.reply(interactive.cardkit)',
            fn: () => client.im.message.reply({
                path: { message_id: normalizedId },
                data: {
                    content: contentPayload,
                    msg_type: 'interactive',
                    reply_in_thread: replyInThread,
                },
            }),
        });
        return {
            messageId: response?.data?.message_id ?? '',
            chatId: response?.data?.chat_id ?? '',
        };
    }
    const target = (0, targets_1.normalizeFeishuTarget)(to);
    if (!target) {
        throw new Error(`[feishu-send] Invalid target: "${to}"`);
    }
    const receiveIdType = (0, targets_1.resolveReceiveIdType)(target);
    const response = await client.im.message.create({
        // SDK 类型将 receive_id_type 限定为字面量联合，但运行时接受动态值
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params: { receive_id_type: receiveIdType },
        data: {
            receive_id: target,
            msg_type: 'interactive',
            content: contentPayload,
        },
    });
    return {
        messageId: response?.data?.message_id ?? '',
        chatId: response?.data?.chat_id ?? '',
    };
}
/**
 * Close (or open) the streaming mode on a CardKit card.
 *
 * Must be called after streaming is complete to restore normal card
 * behaviour (forwarding, interaction callbacks, etc.).
 */
async function setCardStreamingMode(params) {
    const { cfg, cardId, streamingMode, sequence, accountId } = params;
    const client = lark_client_1.LarkClient.fromCfg(cfg, accountId).sdk;
    // SDK 返回类型不完整，运行时包含 code/msg 字段
    const resp = (await client.cardkit.v1.card.settings({
        data: {
            settings: JSON.stringify({ streaming_mode: streamingMode }),
            sequence,
        },
        path: { card_id: cardId },
    }));
    logCardKitResponse({
        resp,
        api: 'card.settings',
        context: `seq=${sequence}, streaming_mode=${streamingMode}`,
    });
}
