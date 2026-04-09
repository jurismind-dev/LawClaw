"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * ChannelMessageActionAdapter for the Lark/Feishu channel plugin.
 *
 * Implements the standard message-action interface so the framework's
 * built-in `message` tool can route send, react, delete and other
 * actions to Feishu.
 *
 * The `send` action is the unified entry-point for text, card, media,
 * reply and attachment delivery — matching the Telegram/Discord pattern
 * where a single action handles all outbound message types.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.feishuMessageActions = void 0;
const tool_send_1 = require("openclaw/plugin-sdk/tool-send");
const param_readers_1 = require("openclaw/plugin-sdk/param-readers");
const sdk_compat_1 = require("../../core/sdk-compat.js");
const lark_client_1 = require("../../core/lark-client.js");
const accounts_1 = require("../../core/accounts.js");
const lark_logger_1 = require("../../core/lark-logger.js");
const reactions_1 = require("./reactions.js");
const deliver_1 = require("./deliver.js");
const media_1 = require("./media.js");
const log = (0, lark_logger_1.larkLogger)('outbound/actions');
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Assert that a Lark SDK response has code === 0 (or no code field). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertLarkOk(res, context) {
    const code = res?.code;
    if (code !== undefined && code !== 0) {
        const msg = res?.msg ?? 'unknown error';
        throw new Error(`[feishu-actions] ${context}: code=${code}, msg=${msg}`);
    }
}
// ---------------------------------------------------------------------------
// Supported actions
// ---------------------------------------------------------------------------
const SUPPORTED_ACTIONS = new Set([
    'send',
    'react',
    'reactions',
    'delete',
    'unsend',
    // "member-info",
]);
// ---------------------------------------------------------------------------
// Send param extraction
// ---------------------------------------------------------------------------
/** Try to resolve a card param to a plain object. Accepts objects directly or JSON strings. */
function parseCardParam(raw) {
    if (raw == null)
        return undefined;
    // Already a non-array object — use directly (empty {} is never a valid card).
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        const obj = raw;
        if (Object.keys(obj).length === 0)
            return undefined;
        return obj;
    }
    // String — attempt JSON.parse.
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
            log.warn('params.card is a string but not a JSON object, ignoring');
            return undefined;
        }
        try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed === 'object' && parsed != null && !Array.isArray(parsed)) {
                log.info('params.card was a JSON string, parsed successfully');
                return parsed;
            }
            log.warn('params.card JSON parsed but is not a plain object, ignoring');
            return undefined;
        }
        catch {
            log.warn('params.card is a string but failed to JSON.parse, ignoring');
            return undefined;
        }
    }
    // Other types (number, boolean, etc.) — ignore with warning.
    log.warn(`params.card has unexpected type "${typeof raw}", ignoring`);
    return undefined;
}
/**
 * Extract and normalise all send-related parameters from the raw action params.
 * When `toolContext` is provided, thread context is inherited so that replies
 * are routed to the correct thread.
 */
function readFeishuSendParams(params, toolContext) {
    const to = (0, param_readers_1.readStringParam)(params, 'to') ?? '';
    const text = (0, param_readers_1.readStringParam)(params, 'message', { allowEmpty: true }) ??
        (0, param_readers_1.readStringParam)(params, 'text', { allowEmpty: true }) ??
        '';
    const mediaUrl = (0, param_readers_1.readStringParam)(params, 'media') ??
        (0, param_readers_1.readStringParam)(params, 'path') ??
        (0, param_readers_1.readStringParam)(params, 'filePath') ??
        (0, param_readers_1.readStringParam)(params, 'url');
    const fileName = (0, param_readers_1.readStringParam)(params, 'fileName') ?? (0, param_readers_1.readStringParam)(params, 'name');
    // Thread routing: when targeting the current chat (or unspecified),
    // inherit thread context from SDK toolContext.
    const sameChat = !to || to === toolContext?.currentChannelId;
    const replyInThread = sameChat && Boolean(toolContext?.currentThreadTs);
    const replyToMessageId = (0, param_readers_1.readStringParam)(params, 'replyTo') ??
        (replyInThread && toolContext?.currentMessageId ? String(toolContext.currentMessageId) : undefined);
    const card = parseCardParam(params.card);
    return {
        to,
        text,
        mediaUrl: mediaUrl ?? undefined,
        fileName: fileName ?? undefined,
        replyToMessageId: replyToMessageId ?? undefined,
        replyInThread,
        card,
    };
}
// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------
exports.feishuMessageActions = {
    describeMessageTool: ({ cfg }) => {
        const accounts = (0, accounts_1.getEnabledLarkAccounts)(cfg);
        if (accounts.length === 0) {
            return { actions: [], capabilities: [], schema: null };
        }
        return {
            actions: Array.from(SUPPORTED_ACTIONS),
            capabilities: ['cards'],
            schema: null,
        };
    },
    supportsAction: ({ action }) => SUPPORTED_ACTIONS.has(action),
    extractToolSend: ({ args }) => (0, tool_send_1.extractToolSend)(args, 'sendMessage'),
    handleAction: async (ctx) => {
        const { action, params, cfg, accountId, toolContext } = ctx;
        const aid = accountId ?? undefined;
        log.info(`handleAction: action=${action}, accountId=${aid ?? 'default'}`);
        try {
            switch (action) {
                case 'send':
                    return await deliverMessage(cfg, readFeishuSendParams(params, toolContext), aid, ctx.mediaLocalRoots);
                case 'react':
                    return await handleReact(cfg, params, aid);
                case 'reactions':
                    return await handleReactions(cfg, params, aid);
                case 'delete':
                case 'unsend':
                    return await handleDelete(cfg, params, aid);
                default:
                    throw new Error(`Action "${action}" is not supported for Feishu. ` +
                        `Supported actions: ${Array.from(SUPPORTED_ACTIONS).join(', ')}.`);
            }
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            log.error(`handleAction failed: action=${action}, error=${errMsg}`);
            throw err;
        }
    },
};
// ---------------------------------------------------------------------------
// Unified message delivery
// ---------------------------------------------------------------------------
/**
 * Unified message delivery — handles text, card, and media payloads with
 * optional reply-to and thread routing.
 *
 * Supports `fileName` for named file uploads via `uploadAndSendMediaLark`.
 * On media upload failure, falls back to sending the URL as a text link.
 */
async function deliverMessage(cfg, sp, accountId, mediaLocalRoots) {
    const { to, text, mediaUrl, fileName, replyToMessageId, replyInThread, card } = sp;
    const payloadType = card ? 'card' : mediaUrl ? 'media' : 'text';
    const target = to || replyToMessageId || 'unknown';
    log.info(`deliverMessage: type=${payloadType}, target=${target}, ` +
        `isReply=${Boolean(replyToMessageId)}, replyInThread=${replyInThread}, ` +
        `textLen=${text.trim().length}, hasMedia=${Boolean(mediaUrl)}, ` +
        `fileName=${fileName ?? '(none)'}`);
    if (!text.trim() && !card && !mediaUrl) {
        log.warn('deliverMessage: no payload, rejecting');
        throw new Error('send requires at least one of: message, card, or media.');
    }
    const sendCtx = { cfg, to, replyToMessageId, replyInThread, accountId };
    // Send text first if both text and card/media are present.
    if (text.trim() && (card || mediaUrl)) {
        log.info(`deliverMessage: sending preceding text ` + `(${text.length} chars) before ${payloadType}`);
        await (0, deliver_1.sendTextLark)({ ...sendCtx, text });
    }
    // Card path.
    if (card) {
        const result = await (0, deliver_1.sendCardLark)({ ...sendCtx, card });
        log.info(`deliverMessage: card sent, messageId=${result.messageId}`);
        return (0, sdk_compat_1.jsonResult)({ ok: true, messageId: result.messageId, chatId: result.chatId });
    }
    // Media path — uses uploadAndSendMediaLark directly to support fileName.
    if (mediaUrl) {
        return await deliverMedia(cfg, sp, accountId, mediaLocalRoots);
    }
    // Text-only path.
    const result = await (0, deliver_1.sendTextLark)({ ...sendCtx, text });
    log.info(`deliverMessage: text sent, messageId=${result.messageId}`);
    return (0, sdk_compat_1.jsonResult)({ ok: true, messageId: result.messageId, chatId: result.chatId });
}
/**
 * Upload and send a media file with text-link fallback on failure.
 */
async function deliverMedia(cfg, sp, accountId, mediaLocalRoots) {
    const { to, mediaUrl, fileName, replyToMessageId, replyInThread } = sp;
    log.info(`deliverMedia: url=${mediaUrl}, fileName=${fileName ?? '(auto)'}`);
    try {
        const result = await (0, media_1.uploadAndSendMediaLark)({
            cfg,
            to,
            mediaUrl,
            fileName,
            replyToMessageId,
            replyInThread,
            accountId,
            mediaLocalRoots,
        });
        log.info(`deliverMedia: sent, messageId=${result.messageId}`);
        return (0, sdk_compat_1.jsonResult)({ ok: true, messageId: result.messageId, chatId: result.chatId });
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log.error(`deliverMedia: upload failed for "${mediaUrl}": ${errMsg}`);
        // Fallback: send the URL with error reason as a quote above.
        log.info('deliverMedia: falling back to text link');
        const fallback = await (0, deliver_1.sendTextLark)({
            cfg,
            to,
            text: `> ${mediaUrl}`,
            replyToMessageId,
            replyInThread,
            accountId,
        });
        return (0, sdk_compat_1.jsonResult)({
            ok: true,
            messageId: fallback.messageId,
            chatId: fallback.chatId,
            warning: `Media upload failed (${errMsg}). A text link was sent instead.`,
        });
    }
}
// ---------------------------------------------------------------------------
// Reaction handlers
// ---------------------------------------------------------------------------
async function handleReact(cfg, params, accountId) {
    const messageId = (0, param_readers_1.readStringParam)(params, 'messageId', { required: true });
    const { emoji, remove, isEmpty } = (0, sdk_compat_1.readReactionParams)(params, {
        removeErrorMessage: 'Emoji is required to remove a Feishu reaction.',
    });
    if (remove || isEmpty) {
        log.info(`react: removing emoji=${emoji || 'all'} from messageId=${messageId}`);
        const reactions = await (0, reactions_1.listReactionsFeishu)({
            cfg,
            messageId,
            emojiType: emoji || undefined,
            accountId,
        });
        const botReactions = reactions.filter((r) => r.operatorType === 'app');
        for (const r of botReactions) {
            await (0, reactions_1.removeReactionFeishu)({
                cfg,
                messageId,
                reactionId: r.reactionId,
                accountId,
            });
        }
        log.info(`react: removed ${botReactions.length} bot reaction(s)`);
        return (0, sdk_compat_1.jsonResult)({ ok: true, removed: botReactions.length });
    }
    log.info(`react: adding emoji=${emoji} to messageId=${messageId}`);
    const { reactionId } = await (0, reactions_1.addReactionFeishu)({
        cfg,
        messageId,
        emojiType: emoji,
        accountId,
    });
    log.info(`react: added reactionId=${reactionId}`);
    return (0, sdk_compat_1.jsonResult)({ ok: true, reactionId });
}
async function handleReactions(cfg, params, accountId) {
    const messageId = (0, param_readers_1.readStringParam)(params, 'messageId', { required: true });
    const emojiType = (0, param_readers_1.readStringParam)(params, 'emoji');
    const reactions = await (0, reactions_1.listReactionsFeishu)({
        cfg,
        messageId,
        emojiType: emojiType || undefined,
        accountId,
    });
    return (0, sdk_compat_1.jsonResult)({
        ok: true,
        reactions: reactions.map((r) => ({
            reactionId: r.reactionId,
            emoji: r.emojiType,
            operatorType: r.operatorType,
            operatorId: r.operatorId,
        })),
    });
}
// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
async function handleDelete(cfg, params, accountId) {
    const messageId = (0, param_readers_1.readStringParam)(params, 'messageId', { required: true });
    log.info(`delete: messageId=${messageId}`);
    const client = lark_client_1.LarkClient.fromCfg(cfg, accountId).sdk;
    const res = await client.im.message.delete({
        path: { message_id: messageId },
    });
    assertLarkOk(res, `delete message ${messageId}`);
    log.info(`delete: done, messageId=${messageId}`);
    return (0, sdk_compat_1.jsonResult)({ ok: true, messageId, deleted: true });
}
