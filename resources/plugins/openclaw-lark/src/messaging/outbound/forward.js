"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Message forwarding for the Lark/Feishu channel plugin.
 *
 * Provides a function to forward an existing message to another chat
 * or user using the IM Message Forward API.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.forwardMessageFeishu = forwardMessageFeishu;
const lark_client_1 = require("../../core/lark-client.js");
const targets_1 = require("../../core/targets.js");
// ---------------------------------------------------------------------------
// forwardMessageFeishu
// ---------------------------------------------------------------------------
/**
 * Forward an existing message to another chat or user.
 *
 * @param params.cfg       - Plugin configuration with Feishu credentials.
 * @param params.messageId - The message ID to forward.
 * @param params.to        - Target identifier (chat_id, open_id, or user_id).
 * @param params.accountId - Optional account identifier for multi-account setups.
 * @returns The send result containing the new forwarded message ID.
 */
async function forwardMessageFeishu(params) {
    const { cfg, messageId, to, accountId } = params;
    const client = lark_client_1.LarkClient.fromCfg(cfg, accountId).sdk;
    const target = (0, targets_1.normalizeFeishuTarget)(to);
    if (!target) {
        throw new Error(`[feishu-forward] Invalid target: "${to}"`);
    }
    const receiveIdType = (0, targets_1.resolveReceiveIdType)(target);
    const response = await client.im.message.forward({
        path: {
            message_id: messageId,
        },
        params: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            receive_id_type: receiveIdType,
        },
        data: {
            receive_id: target,
        },
    });
    return {
        messageId: response?.data?.message_id ?? '',
        chatId: response?.data?.chat_id ?? '',
    };
}
