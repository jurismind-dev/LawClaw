"use strict";
// SPDX-License-Identifier: MIT
Object.defineProperty(exports, "__esModule", { value: true });
exports.feishuOutbound = void 0;
const lark_client_1 = require("../../core/lark-client.js");
const lark_logger_1 = require("../../core/lark-logger.js");
const targets_1 = require("../../core/targets.js");
const comment_target_1 = require("../../core/comment-target.js");
const deliver_1 = require("./deliver.js");
const log = (0, lark_logger_1.larkLogger)('outbound/outbound');
/**
 * Map adapter-level parameters to internal send context.
 *
 * Mirrors the pattern used by Telegram (`resolveTelegramSendContext`) and
 * Slack (`sendSlackOutboundMessage`) to centralise parameter mapping.
 */
function resolveFeishuSendContext(params) {
    const routeTarget = (0, targets_1.parseFeishuRouteTarget)(params.to);
    const explicitThreadId = params.threadId != null && String(params.threadId).trim() !== '' ? String(params.threadId).trim() : undefined;
    const explicitReplyToId = params.replyToId?.trim() || undefined;
    const replyToMessageId = explicitReplyToId ?? routeTarget.replyToMessageId;
    const replyInThread = Boolean(explicitThreadId ?? routeTarget.threadId);
    if (!explicitReplyToId && routeTarget.replyToMessageId) {
        log.info('resolved reply target from encoded originating route');
    }
    return {
        cfg: params.cfg,
        to: routeTarget.target,
        replyToMessageId,
        replyInThread,
        accountId: params.accountId ?? undefined,
    };
}
// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------
exports.feishuOutbound = {
    deliveryMode: 'direct',
    chunker: (text, limit) => lark_client_1.LarkClient.runtime.channel.text.chunkMarkdownText(text, limit),
    chunkerMode: 'markdown',
    textChunkLimit: 15000,
    sendText: async ({ cfg, to, text, accountId, replyToId, threadId }) => {
        log.info(`sendText: target=${to}, textLength=${text.length}`);
        // Comment thread routing — route replies through Drive comment API
        if ((0, comment_target_1.isCommentTarget)(to)) {
            log.info(`sendText: detected comment target, routing through Drive comment API`);
            const result = await (0, deliver_1.sendCommentReplyLark)({ cfg, to, text, accountId: accountId ?? undefined });
            return { channel: 'feishu', ...result };
        }
        const ctx = resolveFeishuSendContext({ cfg, to, accountId, replyToId, threadId });
        const result = await (0, deliver_1.sendTextLark)({ ...ctx, to: ctx.to, text });
        return { channel: 'feishu', ...result };
    },
    sendMedia: async ({ cfg, to, text, mediaUrl, mediaLocalRoots, accountId, replyToId, threadId }) => {
        log.info(`sendMedia: target=${to}, ` + `hasText=${Boolean(text?.trim())}, mediaUrl=${mediaUrl ?? '(none)'}`);
        // Comment thread routing — send text (with media URL appended) via Drive comment API
        if ((0, comment_target_1.isCommentTarget)(to)) {
            log.info(`sendMedia: detected comment target, routing through Drive comment API`);
            const parts = [];
            if (text?.trim())
                parts.push(text.trim());
            if (mediaUrl)
                parts.push(`📎 ${mediaUrl}`);
            const combinedText = parts.join('\n') || '(media)';
            const result = await (0, deliver_1.sendCommentReplyLark)({ cfg, to, text: combinedText, accountId: accountId ?? undefined });
            return { channel: 'feishu', ...result };
        }
        const ctx = resolveFeishuSendContext({ cfg, to, accountId, replyToId, threadId });
        // Feishu media messages do not support inline captions — send text first.
        if (text?.trim()) {
            await (0, deliver_1.sendTextLark)({ ...ctx, to: ctx.to, text });
        }
        // No mediaUrl — text-only fallback.
        if (!mediaUrl) {
            log.info('sendMedia: no mediaUrl provided, falling back to text-only');
            const result = await (0, deliver_1.sendTextLark)({ ...ctx, to: ctx.to, text: text ?? '' });
            return { channel: 'feishu', ...result };
        }
        const result = await (0, deliver_1.sendMediaLark)({ ...ctx, to: ctx.to, mediaUrl, mediaLocalRoots });
        return {
            channel: 'feishu',
            messageId: result.messageId,
            chatId: result.chatId,
            ...(result.warning ? { meta: { warnings: [result.warning] } } : {}),
        };
    },
    sendPayload: async ({ cfg, to, payload, mediaLocalRoots, accountId, replyToId, threadId }) => {
        const ctx = resolveFeishuSendContext({ cfg, to, accountId, replyToId, threadId });
        // --- channelData.feishu: card message support ---
        const feishuData = payload.channelData?.feishu;
        // --- Resolve text + media from payload ---
        const text = payload.text ?? '';
        const mediaUrls = payload.mediaUrls?.length ? payload.mediaUrls : payload.mediaUrl ? [payload.mediaUrl] : [];
        log.info(`sendPayload: target=${to}, ` +
            `textLength=${text.length}, mediaCount=${mediaUrls.length}, ` +
            `hasCard=${Boolean(feishuData?.card)}`);
        // --- channelData.feishu.card: card message path ---
        // Feishu card messages are standalone (msg_type="interactive"), so
        // text and media must be sent as separate messages around the card.
        if (feishuData?.card) {
            if (text.trim()) {
                await (0, deliver_1.sendTextLark)({ ...ctx, to: ctx.to, text });
            }
            const cardResult = await (0, deliver_1.sendCardLark)({ ...ctx, to: ctx.to, card: feishuData.card });
            const warnings = [];
            for (const mediaUrl of mediaUrls) {
                const mediaResult = await (0, deliver_1.sendMediaLark)({ ...ctx, to: ctx.to, mediaUrl, mediaLocalRoots });
                if (mediaResult.warning) {
                    warnings.push(mediaResult.warning);
                }
            }
            return {
                channel: 'feishu',
                messageId: cardResult.messageId,
                chatId: cardResult.chatId,
                ...(warnings.length > 0 ? { meta: { warnings } } : {}),
            };
        }
        // --- Standard text + media orchestration (no card) ---
        // No media: text-only
        if (mediaUrls.length === 0) {
            const result = await (0, deliver_1.sendTextLark)({ ...ctx, to: ctx.to, text });
            return { channel: 'feishu', ...result };
        }
        // Has media: send leading text, then loop media URLs
        if (text.trim()) {
            await (0, deliver_1.sendTextLark)({ ...ctx, to: ctx.to, text });
        }
        const warnings = [];
        let lastResult;
        for (const mediaUrl of mediaUrls) {
            lastResult = await (0, deliver_1.sendMediaLark)({ ...ctx, to: ctx.to, mediaUrl, mediaLocalRoots });
            if (lastResult.warning) {
                warnings.push(lastResult.warning);
            }
        }
        return {
            channel: 'feishu',
            ...(lastResult ?? { messageId: '', chatId: '' }),
            ...(warnings.length > 0 ? { meta: { warnings } } : {}),
        };
    },
};
