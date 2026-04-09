"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Inbound message handling pipeline for the Lark/Feishu channel plugin.
 *
 * Orchestrates a seven-stage pipeline:
 *   1. Account resolution
 *   2. Event parsing         → parse.ts (merge_forward expanded in-place)
 *   3. Sender enrichment     → enrich.ts (lightweight, before gate)
 *   4. Policy gate           → gate.ts
 *   5. User name prefetch    → enrich.ts (batch cache warm-up)
 *   6. Content resolution    → enrich.ts (media / quote, parallel)
 *   7. Agent dispatch        → dispatch.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleFeishuMessage = handleFeishuMessage;
const reply_history_1 = require("openclaw/plugin-sdk/reply-history");
const zalouser_1 = require("openclaw/plugin-sdk/zalouser");
const allow_from_1 = require("openclaw/plugin-sdk/allow-from");
const accounts_1 = require("../../core/accounts.js");
const lark_client_1 = require("../../core/lark-client.js");
const lark_logger_1 = require("../../core/lark-logger.js");
const lark_ticket_1 = require("../../core/lark-ticket.js");
const chat_queue_1 = require("../../channel/chat-queue.js");
const parse_1 = require("./parse.js");
const enrich_1 = require("./enrich.js");
const gate_1 = require("./gate.js");
const handler_registry_1 = require("./handler-registry.js");
const dispatch_1 = require("./dispatch.js");
const policy_1 = require("./policy.js");
const logger = (0, lark_logger_1.larkLogger)('inbound/handler');
// ---------------------------------------------------------------------------
// Public: handle inbound message
// ---------------------------------------------------------------------------
async function handleFeishuMessage(params) {
    const { cfg, event, botOpenId, runtime, chatHistories, accountId, replyToMessageId, forceMention, skipTyping } = params;
    // 1. Account resolution
    const account = (0, accounts_1.getLarkAccount)(cfg, accountId);
    const accountFeishuCfg = account.config;
    // ★ 多账号配置隔离：构造 account 级别的 ClawdbotConfig
    //
    //   在多账号场景下，每个 account 可以独立配置 groupPolicy / requireMention
    //   等策略。但 SDK 的 resolveGroupPolicy / resolveRequireMention 等函数从
    //   cfg.channels.feishu 读取配置，而 cfg 是顶层全局配置，不包含 per-account
    //   的覆盖值。
    //
    //   这里将 cfg.channels.feishu 替换为经过 getLarkAccount() 合并后的
    //   accountFeishuCfg（= base config + account override），确保下游所有 SDK 调用
    //   都能正确读取当前 account 的配置。
    const accountScopedCfg = {
        ...cfg,
        channels: { ...cfg.channels, feishu: accountFeishuCfg },
    };
    const log = runtime?.log ?? ((...args) => logger.info(args.map(String).join(' ')));
    const error = runtime?.error ?? ((...args) => logger.error(args.map(String).join(' ')));
    // 2. Parse event → MessageContext (merge_forward expanded in-place)
    let ctx = await (0, parse_1.parseMessageEvent)(event, botOpenId, {
        cfg: accountScopedCfg,
        accountId: account.accountId,
    });
    // 3. Enrich (lightweight): sender name + permission error tracking
    const { ctx: enrichedCtx, permissionError } = await (0, enrich_1.resolveSenderInfo)({
        ctx,
        account,
        log,
    });
    ctx = enrichedCtx;
    log(`feishu[${account.accountId}]: received message from ${ctx.senderId} in ${ctx.chatId} (${ctx.chatType})`);
    logger.info(`received from ${ctx.senderId} in ${ctx.chatId} (${ctx.chatType})`);
    const historyLimit = Math.max(0, accountFeishuCfg?.historyLimit ?? accountScopedCfg.messages?.groupChat?.historyLimit ?? reply_history_1.DEFAULT_GROUP_HISTORY_LIMIT);
    // 4. Gate: policy / access-control checks (skipped for synthetic messages)
    const gate = forceMention
        ? { allowed: true }
        : await (0, gate_1.checkMessageGate)({ ctx, accountFeishuCfg, account, accountScopedCfg, log });
    if (!gate.allowed) {
        if (gate.reason === 'no_mention') {
            logger.info(`rejected: no bot mention in group ${ctx.chatId}`);
        }
        // Record history entry if the gate produced one (group no-mention case)
        if (gate.historyEntry && chatHistories) {
            const historyKey = (0, chat_queue_1.threadScopedKey)(ctx.chatId, ctx.threadId);
            (0, reply_history_1.recordPendingHistoryEntryIfEnabled)({
                historyMap: chatHistories,
                historyKey,
                limit: historyLimit,
                entry: gate.historyEntry,
            });
        }
        return;
    }
    // 5. Batch pre-warm user name cache (sender + mentions)
    await (0, enrich_1.prefetchUserNames)({ ctx, account, log });
    // 6. Enrich (heavyweight, after gate — parallel where possible)
    const enrichParams = { ctx, accountScopedCfg, account, log };
    const [mediaResult, quotedContent] = await Promise.all([
        (0, enrich_1.resolveMedia)(enrichParams),
        (0, enrich_1.resolveQuotedContent)(enrichParams),
    ]);
    // 6b. Replace Feishu file-key placeholders in content with local
    //     file paths so the SDK can detect images for native vision and
    //     the AI receives meaningful file references.
    if (mediaResult.mediaList.length > 0) {
        ctx = {
            ...ctx,
            content: (0, enrich_1.substituteMediaPaths)(ctx.content, mediaResult.mediaList),
        };
    }
    // 7. Compute commandAuthorized via SDK access group command gating
    const core = lark_client_1.LarkClient.runtime;
    const isGroup = ctx.chatType === 'group';
    const dmPolicy = accountFeishuCfg?.dmPolicy ?? 'pairing';
    // Resolve per-group config early — shared by both command authorization
    // and dispatch (step 8).
    const groupConfig = isGroup ? (0, policy_1.resolveFeishuGroupConfig)({ cfg: accountFeishuCfg, groupId: ctx.chatId }) : undefined;
    const defaultGroupConfig = isGroup ? accountFeishuCfg?.groups?.['*'] : undefined;
    // Build the sender allowlist for command authorization in group context.
    // Excludes legacy oc_xxx chat-id entries (group admission, not sender identity).
    //
    // When the explicit group sender policy is "open", pass ["*"] to align
    // command authorization with chat access (if you can chat, you can run
    // commands).  When no policy is configured (undefined fallback), default to
    // allowlist behaviour — only users in accountFeishuCfg.allowFrom (owner list) or
    // an explicit groupAllowFrom/per-group allowFrom can run commands.
    const configuredGroupAllowFrom = (() => {
        if (!isGroup)
            return undefined;
        // Exclude legacy oc_xxx chat-id entries from groupAllowFrom (sender filter only).
        const { senderAllowFrom } = (0, policy_1.splitLegacyGroupAllowFrom)(accountFeishuCfg?.groupAllowFrom ?? []);
        const senderGroupAllowFrom = senderAllowFrom;
        const perGroupAllowFrom = (groupConfig?.allowFrom ?? []).map(String);
        const defaultSenderAllowFrom = !groupConfig && defaultGroupConfig?.allowFrom ? defaultGroupConfig.allowFrom.map(String) : [];
        const combined = [...senderGroupAllowFrom, ...perGroupAllowFrom, ...defaultSenderAllowFrom];
        if (combined.length > 0)
            return combined;
        // No allowFrom list configured — check if sender policy is explicitly "open".
        // Do NOT fall back to "open" as a default: unset policy → allowlist behaviour.
        const explicitSenderPolicy = groupConfig?.groupPolicy ?? defaultGroupConfig?.groupPolicy ?? accountFeishuCfg?.groupPolicy;
        return explicitSenderPolicy === 'open' ? ['*'] : [];
    })();
    const { commandAuthorized } = await (0, zalouser_1.resolveSenderCommandAuthorization)({
        rawBody: ctx.content,
        cfg: accountScopedCfg,
        isGroup,
        dmPolicy,
        configuredAllowFrom: (accountFeishuCfg?.allowFrom ?? []).map(String),
        configuredGroupAllowFrom,
        senderId: ctx.senderId,
        isSenderAllowed: (senderId, allowFrom) => (0, allow_from_1.isNormalizedSenderAllowed)({ senderId, allowFrom }),
        readAllowFromStore: () => (0, gate_1.readFeishuAllowFromStore)(account.accountId),
        shouldComputeCommandAuthorized: core.channel.commands.shouldComputeCommandAuthorized,
        resolveCommandAuthorizedFromAuthorizers: core.channel.commands.resolveCommandAuthorizedFromAuthorizers,
    });
    // 8. Dispatch to agent
    // groupConfig and defaultGroupConfig are already resolved above.
    try {
        await (0, dispatch_1.dispatchToAgent)({
            ctx,
            permissionError,
            mediaPayload: mediaResult.payload,
            quotedContent,
            account,
            accountScopedCfg,
            runtime,
            chatHistories,
            historyLimit,
            replyToMessageId,
            commandAuthorized,
            groupConfig,
            defaultGroupConfig,
            skipTyping,
        });
    }
    catch (err) {
        error(`feishu[${account.accountId}]: failed to dispatch message: ${String(err)}`);
        logger.error(`dispatch failed: ${String(err)} (elapsed=${(0, lark_ticket_1.ticketElapsed)()}ms)`);
    }
}
(0, handler_registry_1.injectInboundHandler)(handleFeishuMessage);
