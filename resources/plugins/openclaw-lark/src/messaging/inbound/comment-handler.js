"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Drive comment event handler for the Lark/Feishu channel plugin.
 *
 * Handles `drive.notice.comment_add_v1` events by resolving comment
 * context, enforcing access policies, building a synthetic
 * {@link MessageContext}, and dispatching to the agent.
 *
 * Modeled after the reaction handler pattern (reaction-handler.ts):
 * bypasses the 7-stage message pipeline and dispatches directly.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleFeishuCommentEvent = handleFeishuCommentEvent;
const crypto = __importStar(require("node:crypto"));
const reply_history_1 = require("openclaw/plugin-sdk/reply-history");
const accounts_1 = require("../../core/accounts.js");
const comment_target_1 = require("../../core/comment-target.js");
const lark_client_1 = require("../../core/lark-client.js");
const lark_logger_1 = require("../../core/lark-logger.js");
const user_name_cache_1 = require("./user-name-cache.js");
const dispatch_1 = require("./dispatch.js");
const gate_1 = require("./gate.js");
const policy_1 = require("./policy.js");
const gate_effects_1 = require("./gate-effects.js");
const comment_context_1 = require("./comment-context.js");
const logger = (0, lark_logger_1.larkLogger)('inbound/comment-handler');
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Handle a Drive comment event.
 *
 * Resolves the comment context, checks access policies, builds a
 * synthetic MessageContext, and dispatches to the agent.
 */
async function handleFeishuCommentEvent(params) {
    const { cfg, event, botOpenId, runtime, chatHistories, accountId } = params;
    const log = runtime?.log ?? ((...args) => logger.info(args.map(String).join(' ')));
    const error = runtime?.error ?? ((...args) => logger.error(args.map(String).join(' ')));
    // The parser has already normalized all fields from notice_meta into
    // canonical top-level fields, so we just read the canonical shape.
    const senderOpenId = event.user_id?.open_id ?? '';
    const senderUserId = event.user_id?.user_id;
    const senderUnionId = event.user_id?.union_id;
    const fileToken = event.file_token ?? '';
    const fileType = (event.file_type ?? 'docx');
    const commentId = event.comment_id ?? '';
    if (!senderOpenId || !fileToken || !commentId) {
        log(`feishu[${accountId}]: comment event missing required fields, skipping`);
        return;
    }
    // ---- Self-comment filter ----
    // Ignore comments/replies authored by the bot itself.
    if (senderOpenId === botOpenId) {
        log(`feishu[${accountId}]: ignoring self-authored comment on ${fileToken}`);
        return;
    }
    // ---- Account resolution ----
    const account = (0, accounts_1.getLarkAccount)(cfg, accountId);
    const accountFeishuCfg = account.config;
    const accountScopedCfg = {
        ...cfg,
        channels: { ...cfg.channels, feishu: accountFeishuCfg },
    };
    // ---- Access policy enforcement (DM-style) ----
    // Comment events are user-to-bot interactions outside of IM, so we apply
    // the same dmPolicy (open/allowlist/pairing) as DM messages.
    // This mirrors the logic in gate.ts:checkDmGate.
    const dmPolicy = accountFeishuCfg?.dmPolicy ?? 'pairing';
    if (dmPolicy === 'disabled') {
        log(`feishu[${accountId}]: comment event rejected (dmPolicy=disabled)`);
        return;
    }
    if (dmPolicy !== 'open') {
        // Read both config allowlist and pairing store (matches gate.ts behavior)
        const configAllowFrom = accountFeishuCfg?.allowFrom ?? [];
        const storeAllowFrom = await (0, gate_1.readFeishuAllowFromStore)(account.accountId).catch(() => []);
        const combinedAllowFrom = [...configAllowFrom, ...storeAllowFrom];
        const match = (0, policy_1.resolveFeishuAllowlistMatch)({
            allowFrom: combinedAllowFrom,
            senderId: senderOpenId,
        });
        // Also check user_id if available
        const userIdMatch = senderUserId
            ? (0, policy_1.resolveFeishuAllowlistMatch)({
                allowFrom: combinedAllowFrom,
                senderId: senderUserId,
            })
            : { allowed: false };
        if (!match.allowed && !userIdMatch.allowed) {
            if (dmPolicy === 'pairing') {
                // Create pairing request and send challenge (mirrors gate.ts:334).
                // Prefer replying in the comment thread so the user sees the
                // challenge in context; fall back to DM if comment reply fails.
                log(`feishu[${accountId}]: comment sender not paired, creating pairing request`);
                try {
                    const core = lark_client_1.LarkClient.runtime;
                    const { code } = await core.channel.pairing.upsertPairingRequest({
                        channel: 'feishu',
                        id: senderOpenId,
                        accountId: account.accountId,
                    });
                    const pairingText = core.channel.pairing.buildPairingReply({
                        channel: 'feishu',
                        idLine: senderOpenId,
                        code,
                    });
                    // Try comment thread reply first
                    let sentInThread = false;
                    try {
                        const client = lark_client_1.LarkClient.fromCfg(accountScopedCfg, accountId);
                        await client.sdk.request({
                            method: 'POST',
                            url: `/open-apis/drive/v1/files/${fileToken}/comments/${commentId}/replies`,
                            params: { file_type: fileType, user_id_type: 'open_id' },
                            data: {
                                content: {
                                    elements: [{ type: 'text_run', text_run: { text: pairingText } }],
                                },
                            },
                        });
                        sentInThread = true;
                    }
                    catch {
                        // Comment reply failed — fall through to DM
                    }
                    // Fallback: send to DM
                    if (!sentInThread) {
                        await (0, gate_effects_1.sendPairingReply)({
                            senderId: senderOpenId,
                            chatId: senderOpenId,
                            accountId: account.accountId,
                            accountScopedCfg,
                        });
                    }
                }
                catch (pairingErr) {
                    log(`feishu[${accountId}]: pairing request failed: ${String(pairingErr)}`);
                }
            }
            else {
                log(`feishu[${accountId}]: comment event rejected (dmPolicy=${dmPolicy}, not in allowlist)`);
            }
            return;
        }
    }
    // ---- Resolve comment context ----
    const turn = await (0, comment_context_1.resolveDriveCommentEventTurn)({ cfg, event, accountId });
    if (!turn) {
        log(`feishu[${accountId}]: failed to resolve comment context, skipping`);
        return;
    }
    // ---- Mention filter ----
    // The event-level is_mentioned flag is not stable for Drive comments.
    // Fall back to the resolved comment text, where @mentions are normalized
    // into "@<open_id>" by extractElementText().
    const eventMentioned = event.notice_meta?.is_mentioned ?? event.is_mention;
    const textMentioned = Boolean(botOpenId) && Boolean(turn.commentText?.includes(`@${botOpenId}`));
    if (eventMentioned !== true && !textMentioned) {
        log(`feishu[${accountId}]: comment event not mentioning bot, skipping` +
            ` (eventFlag=${String(eventMentioned)}, textMention=${textMentioned})`);
        return;
    }
    // ---- Build synthetic MessageContext ----
    const commentTarget = (0, comment_target_1.buildFeishuCommentTarget)({
        // Whole-document comment threads do not support in-thread replies
        // through the replies API. For any event in that thread, fall back
        // to creating a new whole-document comment instead.
        deliveryMode: turn.isWholeComment ? 'create_whole' : 'reply',
        fileType,
        fileToken,
        commentId,
    });
    const syntheticMessageId = `comment:${commentId}:${event.reply_id ?? 'root'}:${crypto.randomUUID()}`;
    const syntheticText = turn.prompt;
    let ctx = {
        chatId: commentTarget, // Use comment target as the "chat" identifier
        messageId: syntheticMessageId,
        senderId: senderOpenId,
        chatType: 'p2p', // Comment events are treated as direct interactions
        content: syntheticText,
        contentType: 'text',
        resources: [],
        mentions: [],
        mentionAll: false,
        rawMessage: {
            message_id: syntheticMessageId,
            chat_id: commentTarget,
            chat_type: 'p2p',
            message_type: 'text',
            content: JSON.stringify({ text: syntheticText }),
            create_time: event.action_time ?? String(Date.now()),
        },
        rawSender: {
            sender_id: {
                open_id: senderOpenId,
                user_id: senderUserId,
                union_id: senderUnionId,
            },
            sender_type: 'user',
        },
    };
    // ---- Sender name resolution ----
    const senderResult = await (0, user_name_cache_1.resolveUserName)({ account, openId: senderOpenId, log });
    if (senderResult.name) {
        ctx = { ...ctx, senderName: senderResult.name };
    }
    log(`feishu[${accountId}]: comment event on ${commentId}` +
        `${event.reply_id ? ` (reply ${event.reply_id})` : ''}, dispatching to agent`);
    logger.info(`comment event on ${commentId}` +
        `${event.reply_id ? ` (reply ${event.reply_id})` : ''}`);
    const historyLimit = Math.max(0, accountFeishuCfg?.historyLimit ?? accountScopedCfg.messages?.groupChat?.historyLimit ?? reply_history_1.DEFAULT_GROUP_HISTORY_LIMIT);
    // ---- Dispatch to agent ----
    try {
        await (0, dispatch_1.dispatchToAgent)({
            ctx,
            permissionError: undefined,
            mediaPayload: {},
            quotedContent: undefined,
            account,
            accountScopedCfg,
            runtime,
            chatHistories,
            historyLimit,
            replyToMessageId: undefined, // No IM message to reply to
            commandAuthorized: false,
            skipTyping: true, // No IM typing indicator for comment events
        });
    }
    catch (err) {
        error(`feishu[${accountId}]: error dispatching comment event: ${String(err)}`);
    }
}
