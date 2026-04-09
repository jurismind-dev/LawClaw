"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Event handlers for the Feishu WebSocket monitor.
 *
 * Extracted from monitor.ts to improve testability and reduce
 * function size. Each handler receives a MonitorContext with all
 * dependencies needed to process the event.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMessageEvent = handleMessageEvent;
exports.handleReactionEvent = handleReactionEvent;
exports.handleBotMembershipEvent = handleBotMembershipEvent;
exports.handleCommentEvent = handleCommentEvent;
exports.handleCardActionEvent = handleCardActionEvent;
const handler_1 = require("../messaging/inbound/handler.js");
const reaction_handler_1 = require("../messaging/inbound/reaction-handler.js");
const comment_handler_1 = require("../messaging/inbound/comment-handler.js");
const comment_context_1 = require("../messaging/inbound/comment-context.js");
const dedup_1 = require("../messaging/inbound/dedup.js");
const lark_ticket_1 = require("../core/lark-ticket.js");
const lark_logger_1 = require("../core/lark-logger.js");
const auto_auth_1 = require("../tools/auto-auth.js");
const ask_user_question_1 = require("../tools/ask-user-question.js");
const chat_queue_1 = require("./chat-queue.js");
const abort_detect_1 = require("./abort-detect.js");
const elog = (0, lark_logger_1.larkLogger)('channel/event-handlers');
// ---------------------------------------------------------------------------
// Event ownership validation
// ---------------------------------------------------------------------------
/**
 * Verify that the event's app_id matches the current account.
 *
 * Lark SDK EventDispatcher flattens the v2 envelope header (which
 * contains `app_id`) into the handler `data` object, so `app_id` is
 * available directly on `data`.
 *
 * Returns `false` (discard event) when the app_id does not match.
 */
function isEventOwnershipValid(ctx, data) {
    const expectedAppId = ctx.lark.account.appId;
    if (!expectedAppId)
        return true; // appId not configured — skip check
    const eventAppId = data.app_id;
    if (eventAppId == null)
        return true; // SDK did not provide app_id — defensive skip
    if (eventAppId !== expectedAppId) {
        elog.warn('event app_id mismatch, discarding', {
            accountId: ctx.accountId,
            expected: expectedAppId,
            received: String(eventAppId),
        });
        return false;
    }
    return true;
}
// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
async function handleMessageEvent(ctx, data) {
    if (!isEventOwnershipValid(ctx, data))
        return;
    const { accountId, log, error } = ctx;
    try {
        const event = data;
        const msgId = event.message?.message_id ?? 'unknown';
        const chatId = event.message?.chat_id ?? '';
        // In topic groups, reply events carry root_id but not thread_id.
        // Use root_id as fallback so different topics get separate queue keys
        // and can be processed in parallel.
        const threadId = event.message?.thread_id || event.message?.root_id || undefined;
        // Dedup — skip duplicate messages (e.g. from WebSocket reconnects).
        if (!ctx.messageDedup.tryRecord(msgId, accountId)) {
            log(`feishu[${accountId}]: duplicate message ${msgId}, skipping`);
            return;
        }
        // Expiry — discard stale messages from reconnect replay.
        if ((0, dedup_1.isMessageExpired)(event.message?.create_time)) {
            log(`feishu[${accountId}]: message ${msgId} expired, discarding`);
            return;
        }
        // ---- Abort fast-path ----
        // If the message looks like an abort trigger and there is an active
        // reply dispatcher for this chat, fire abortCard() immediately
        // (before the message enters the serial queue) so the streaming
        // card is terminated without waiting for the current task.
        const abortText = (0, abort_detect_1.extractRawTextFromEvent)(event);
        if (abortText && (0, abort_detect_1.isLikelyAbortText)(abortText)) {
            const queueKey = (0, chat_queue_1.buildQueueKey)(accountId, chatId, threadId);
            if ((0, chat_queue_1.hasActiveTask)(queueKey)) {
                const active = (0, chat_queue_1.getActiveDispatcher)(queueKey);
                if (active) {
                    log(`feishu[${accountId}]: abort fast-path triggered for chat ${chatId} (text="${abortText}")`);
                    active.abortController?.abort();
                    active.abortCard().catch((err) => {
                        error(`feishu[${accountId}]: abort fast-path abortCard failed: ${String(err)}`);
                    });
                }
            }
        }
        const { status } = (0, chat_queue_1.enqueueFeishuChatTask)({
            accountId,
            chatId,
            threadId,
            task: async () => {
                try {
                    await (0, lark_ticket_1.withTicket)({
                        messageId: msgId,
                        chatId,
                        accountId,
                        startTime: Date.now(),
                        senderOpenId: event.sender?.sender_id?.open_id || '',
                        chatType: event.message?.chat_type || undefined,
                        threadId,
                    }, () => (0, handler_1.handleFeishuMessage)({
                        cfg: ctx.cfg,
                        event,
                        botOpenId: ctx.lark.botOpenId,
                        runtime: ctx.runtime,
                        chatHistories: ctx.chatHistories,
                        accountId,
                    }));
                }
                catch (err) {
                    error(`feishu[${accountId}]: error handling message: ${String(err)}`);
                }
            },
        });
        log(`feishu[${accountId}]: message ${msgId} in chat ${chatId}${threadId ? ` thread ${threadId}` : ''} — ${status}`);
    }
    catch (err) {
        error(`feishu[${accountId}]: error handling message: ${String(err)}`);
    }
}
// ---------------------------------------------------------------------------
// Reaction handler
// ---------------------------------------------------------------------------
async function handleReactionEvent(ctx, data) {
    if (!isEventOwnershipValid(ctx, data))
        return;
    const { accountId, log, error } = ctx;
    try {
        const event = data;
        const msgId = event.message_id ?? 'unknown';
        log(`feishu[${accountId}]: reaction event on message ${msgId}`);
        // ---- Dedup: deterministic key based on message + emoji + operator ----
        const emojiType = event.reaction_type?.emoji_type ?? '';
        const operatorOpenId = event.user_id?.open_id ?? '';
        const dedupKey = `${msgId}:reaction:${emojiType}:${operatorOpenId}`;
        if (!ctx.messageDedup.tryRecord(dedupKey, accountId)) {
            log(`feishu[${accountId}]: duplicate reaction ${dedupKey}, skipping`);
            return;
        }
        // ---- Expiry: discard stale reaction events ----
        if ((0, dedup_1.isMessageExpired)(event.action_time)) {
            log(`feishu[${accountId}]: reaction on ${msgId} expired, discarding`);
            return;
        }
        // ---- Pre-resolve real chatId before enqueuing ----
        // The API call (3s timeout) runs outside the queue so it doesn't
        // block the serial chain, and is read-only so ordering is irrelevant.
        const preResolved = await (0, reaction_handler_1.resolveReactionContext)({
            cfg: ctx.cfg,
            event,
            botOpenId: ctx.lark.botOpenId,
            runtime: ctx.runtime,
            accountId,
        });
        if (!preResolved)
            return;
        // ---- Enqueue with the real chatId (matches normal message queue key) ----
        const { status } = (0, chat_queue_1.enqueueFeishuChatTask)({
            accountId,
            chatId: preResolved.chatId,
            threadId: preResolved.threadId,
            task: async () => {
                try {
                    await (0, lark_ticket_1.withTicket)({
                        messageId: msgId,
                        chatId: preResolved.chatId,
                        accountId,
                        startTime: Date.now(),
                        senderOpenId: operatorOpenId,
                        chatType: preResolved.chatType,
                        threadId: preResolved.threadId,
                    }, () => (0, reaction_handler_1.handleFeishuReaction)({
                        cfg: ctx.cfg,
                        event,
                        botOpenId: ctx.lark.botOpenId,
                        runtime: ctx.runtime,
                        chatHistories: ctx.chatHistories,
                        accountId,
                        preResolved,
                    }));
                }
                catch (err) {
                    error(`feishu[${accountId}]: error handling reaction: ${String(err)}`);
                }
            },
        });
        log(`feishu[${accountId}]: reaction on ${msgId} (chatId=${preResolved.chatId}) — ${status}`);
    }
    catch (err) {
        error(`feishu[${accountId}]: error handling reaction event: ${String(err)}`);
    }
}
// ---------------------------------------------------------------------------
// Bot membership handler
// ---------------------------------------------------------------------------
async function handleBotMembershipEvent(ctx, data, action) {
    if (!isEventOwnershipValid(ctx, data))
        return;
    const { accountId, log, error } = ctx;
    try {
        const event = data;
        log(`feishu[${accountId}]: bot ${action} ${action === 'removed' ? 'from' : 'to'} chat ${event.chat_id}`);
    }
    catch (err) {
        error(`feishu[${accountId}]: error handling bot ${action} event: ${String(err)}`);
    }
}
// ---------------------------------------------------------------------------
// Drive comment handler
// ---------------------------------------------------------------------------
async function handleCommentEvent(ctx, data) {
    if (!isEventOwnershipValid(ctx, data))
        return;
    const { accountId, log, error } = ctx;
    try {
        const parsed = (0, comment_context_1.parseFeishuDriveCommentNoticeEventPayload)(data);
        if (!parsed) {
            log(`feishu[${accountId}]: invalid comment event payload, skipping`);
            return;
        }
        const commentId = parsed.comment_id ?? '';
        const replyId = parsed.reply_id ?? '';
        // Parser has normalized notice_meta fields into canonical top-level fields
        const _senderOpenId = parsed.user_id?.open_id ?? '';
        const isMentioned = parsed.is_mention ?? false;
        const eventTimestamp = parsed.action_time;
        log(`feishu[${accountId}]: drive comment event: ` +
            `type=${parsed.file_type}, comment=${commentId}` +
            `${replyId ? `, reply=${replyId}` : ''}` +
            `${isMentioned ? ', @bot' : ''}`);
        // Dedup: build a deterministic key from the comment/reply IDs
        const dedupKey = replyId ? `comment:${commentId}:reply:${replyId}` : `comment:${commentId}`;
        if (!ctx.messageDedup.tryRecord(dedupKey, accountId)) {
            log(`feishu[${accountId}]: duplicate comment event ${dedupKey}, skipping`);
            return;
        }
        // Expiry check
        if ((0, dedup_1.isMessageExpired)(eventTimestamp)) {
            log(`feishu[${accountId}]: comment event expired, discarding`);
            return;
        }
        // Dispatch the comment event (no queue serialization needed for comment threads)
        await (0, comment_handler_1.handleFeishuCommentEvent)({
            cfg: ctx.cfg,
            event: parsed,
            botOpenId: ctx.lark.botOpenId,
            runtime: ctx.runtime,
            chatHistories: ctx.chatHistories,
            accountId,
        });
    }
    catch (err) {
        error(`feishu[${accountId}]: error handling comment event: ${String(err)}`);
    }
}
// ---------------------------------------------------------------------------
// Card action handler
// ---------------------------------------------------------------------------
async function handleCardActionEvent(ctx, data) {
    try {
        // AskUserQuestion card interactions — injects synthetic message
        // carrying user answers for the AI to receive in a new turn.
        const askResult = (0, ask_user_question_1.handleAskUserAction)(data, ctx.cfg, ctx.accountId);
        if (askResult !== undefined)
            return askResult;
        // Auto-auth card actions (OAuth device flow, app scope confirmation)
        return await (0, auto_auth_1.handleCardAction)(data, ctx.cfg, ctx.accountId);
    }
    catch (err) {
        elog.warn(`card.action.trigger handler error: ${err}`);
    }
}
