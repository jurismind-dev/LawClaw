"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Dispatch context construction for the inbound agent dispatch pipeline.
 *
 * Derives all shared values needed by downstream dispatch helpers:
 * logging, addressing, route resolution, thread session, and system
 * event emission.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureRuntime = ensureRuntime;
exports.buildDispatchContext = buildDispatchContext;
exports.resolveThreadSessionKey = resolveThreadSessionKey;
const routing_1 = require("openclaw/plugin-sdk/routing");
const lark_client_1 = require("../../core/lark-client.js");
const lark_logger_1 = require("../../core/lark-logger.js");
const chat_info_cache_1 = require("../../core/chat-info-cache.js");
const comment_target_1 = require("../../core/comment-target.js");
const log = (0, lark_logger_1.larkLogger)('inbound/dispatch-context');
// ---------------------------------------------------------------------------
// RuntimeEnv fallback
// ---------------------------------------------------------------------------
/**
 * Provide a safe RuntimeEnv fallback when the caller did not supply one.
 * Replaces the previous unsafe `runtime as RuntimeEnv` casts.
 */
function ensureRuntime(runtime) {
    if (runtime)
        return runtime;
    return {
        log: (...args) => log.info(args.map(String).join(' ')),
        error: (...args) => log.error(args.map(String).join(' ')),
        exit: (code) => process.exit(code),
    };
}
// ---------------------------------------------------------------------------
// Context construction
// ---------------------------------------------------------------------------
/**
 * Derive all shared values needed by downstream helpers:
 * logging, addressing, route resolution, and system event emission.
 */
function buildDispatchContext(params) {
    const { ctx, account, accountScopedCfg } = params;
    const runtime = ensureRuntime(params.runtime);
    const log = runtime.log;
    const error = runtime.error;
    const isComment = (0, comment_target_1.isCommentTarget)(ctx.chatId);
    const isGroup = !isComment && ctx.chatType === 'group';
    const isThread = isGroup && Boolean(ctx.threadId);
    const core = lark_client_1.LarkClient.runtime;
    const feishuFrom = `feishu:${ctx.senderId}`;
    // Comment targets use the comment target string directly as the "To"
    // so the outbound routing layer can detect it and route through Drive API.
    const feishuTo = isComment
        ? ctx.chatId
        : isGroup
            ? `chat:${ctx.chatId}`
            : `user:${ctx.senderId}`;
    const envelopeFrom = isGroup ? `${ctx.chatId}:${ctx.senderId}` : ctx.senderId;
    const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(accountScopedCfg);
    // ---- Route resolution ----
    // Comment targets use the comment target as the peer ID so each
    // comment thread gets its own session key.
    const route = core.channel.routing.resolveAgentRoute({
        cfg: accountScopedCfg,
        channel: 'feishu',
        accountId: account.accountId,
        peer: isComment
            ? { kind: 'direct', id: ctx.chatId }
            : {
                kind: isGroup ? 'group' : 'direct',
                id: isGroup ? ctx.chatId : ctx.senderId,
            },
    });
    // ---- System event ----
    const sender = ctx.senderName ? `${ctx.senderName} (${ctx.senderId})` : ctx.senderId;
    const location = isComment ? `comment ${ctx.chatId}` : isGroup ? `group ${ctx.chatId}` : 'DM';
    const tags = [];
    tags.push(`msg:${ctx.messageId}`);
    if (ctx.parentId)
        tags.push(`reply_to:${ctx.parentId}`);
    if (ctx.contentType !== 'text')
        tags.push(ctx.contentType);
    if (ctx.mentions.some((m) => m.isBot))
        tags.push('@bot');
    if (ctx.threadId)
        tags.push(`thread:${ctx.threadId}`);
    if (ctx.resources.length > 0) {
        tags.push(`${ctx.resources.length} attachment(s)`);
    }
    const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
    core.system.enqueueSystemEvent(`Feishu[${account.accountId}] ${location} | ${sender}${tagStr}`, {
        sessionKey: route.sessionKey,
        contextKey: `feishu:message:${ctx.chatId}:${ctx.messageId}`,
    });
    return {
        ctx,
        accountScopedCfg,
        account,
        runtime,
        log,
        error,
        core,
        isGroup,
        isThread,
        feishuFrom,
        feishuTo,
        envelopeFrom,
        envelopeOptions,
        route,
        threadSessionKey: undefined,
        commandAuthorized: params.commandAuthorized,
    };
}
// ---------------------------------------------------------------------------
// Thread session resolution
// ---------------------------------------------------------------------------
/**
 * Resolve thread session key for thread-capable groups.
 *
 * Returns a thread-scoped session key when ALL conditions are met:
 *   1. `threadSession` config is enabled on the account
 *   2. The group is a topic group (chat_mode=topic) or uses thread
 *      message mode (group_message_type=thread)
 *
 * The group info is fetched via `im.chat.get` with a 1-hour LRU cache
 * to minimise OAPI calls.
 */
async function resolveThreadSessionKey(params) {
    const { accountScopedCfg, account, chatId, threadId, baseSessionKey } = params;
    if (account.config?.threadSession !== true)
        return undefined;
    const threadCapable = await (0, chat_info_cache_1.isThreadCapableGroup)({
        cfg: accountScopedCfg,
        chatId,
        accountId: account.accountId,
    });
    if (!threadCapable) {
        log.info(`thread session skipped: group ${chatId} is not topic/thread mode`);
        return undefined;
    }
    // 使用 SDK 标准函数，保证分隔符格式与 resolveThreadParentSessionKey 兼容
    const { sessionKey } = (0, routing_1.resolveThreadSessionKeys)({
        baseSessionKey,
        threadId,
        parentSessionKey: baseSessionKey,
        normalizeThreadId: (id) => id, // 飞书 thread ID (omt_xxx) 区分大小写，不做 lowercase
    });
    return sessionKey;
}
