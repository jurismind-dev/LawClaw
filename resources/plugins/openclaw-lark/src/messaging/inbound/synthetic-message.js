"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Shared helper for dispatching synthetic inbound text messages.
 *
 * Synthetic messages are used to resume the normal inbound pipeline after
 * card actions or OAuth flows complete.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchSyntheticTextMessage = dispatchSyntheticTextMessage;
const chat_queue_1 = require("../../channel/chat-queue.js");
const lark_ticket_1 = require("../../core/lark-ticket.js");
const handler_registry_1 = require("./handler-registry.js");
async function dispatchSyntheticTextMessage(params) {
    const handleFeishuMessage = (0, handler_registry_1.getInboundHandler)();
    const { cfg, accountId, chatId, senderOpenId, text, syntheticMessageId, replyToMessageId, chatType, threadId, runtime, forceMention = true, } = params;
    const syntheticEvent = {
        sender: {
            sender_id: { open_id: senderOpenId },
        },
        message: {
            message_id: syntheticMessageId,
            chat_id: chatId,
            chat_type: chatType ?? 'p2p',
            message_type: 'text',
            content: JSON.stringify({ text }),
            thread_id: threadId,
        },
    };
    const { status, promise } = (0, chat_queue_1.enqueueFeishuChatTask)({
        accountId,
        chatId,
        threadId,
        task: async () => {
            await (0, lark_ticket_1.withTicket)({
                messageId: syntheticMessageId,
                chatId,
                accountId,
                startTime: Date.now(),
                senderOpenId,
                chatType,
                threadId,
            }, () => handleFeishuMessage({
                cfg,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                event: syntheticEvent,
                accountId,
                forceMention,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                runtime: runtime,
                replyToMessageId,
            }));
        },
    });
    await promise;
    return status;
}
