"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * System command and permission notification dispatch for inbound messages.
 *
 * Handles control commands (/help, /reset, etc.) via plain-text delivery
 * and permission-error notifications via the streaming card flow.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchPermissionNotification = dispatchPermissionNotification;
exports.dispatchSystemCommand = dispatchSystemCommand;
const lark_logger_1 = require("../../core/lark-logger.js");
const lark_ticket_1 = require("../../core/lark-ticket.js");
const reply_dispatcher_1 = require("../../card/reply-dispatcher.js");
const tool_use_trace_store_1 = require("../../card/tool-use-trace-store.js");
const send_1 = require("../outbound/send.js");
const dispatch_builders_1 = require("./dispatch-builders.js");
const log = (0, lark_logger_1.larkLogger)('inbound/dispatch-commands');
// ---------------------------------------------------------------------------
// Permission error notification
// ---------------------------------------------------------------------------
/**
 * Dispatch a permission-error notification to the agent so it can
 * inform the user about the missing Feishu API scope.
 */
async function dispatchPermissionNotification(dc, permissionError, replyToMessageId) {
    const grantUrl = permissionError.grantUrl ?? '';
    const permissionNotifyBody = `[System: The bot encountered a Feishu API permission error. Please inform the user about this issue and provide the permission grant URL for the admin to authorize. Permission grant URL: ${grantUrl}]`;
    const permBody = dc.core.channel.reply.formatAgentEnvelope({
        channel: 'Feishu',
        from: dc.envelopeFrom,
        timestamp: new Date(),
        envelope: dc.envelopeOptions,
        body: permissionNotifyBody,
    });
    const permCtx = (0, dispatch_builders_1.buildInboundPayload)(dc, {
        body: permBody,
        bodyForAgent: permissionNotifyBody,
        rawBody: permissionNotifyBody,
        commandBody: permissionNotifyBody,
        senderName: 'system',
        senderId: 'system',
        messageSid: `${dc.ctx.messageId}:permission-error`,
        wasMentioned: false,
    });
    (0, tool_use_trace_store_1.startToolUseTraceRun)(dc.threadSessionKey ?? dc.route.sessionKey);
    const { dispatcher: permDispatcher, replyOptions: permReplyOptions, markDispatchIdle: markPermIdle, markFullyComplete: markPermComplete, } = (0, reply_dispatcher_1.createFeishuReplyDispatcher)({
        cfg: dc.accountScopedCfg,
        agentId: dc.route.agentId,
        chatId: dc.ctx.chatId,
        sessionKey: dc.threadSessionKey ?? dc.route.sessionKey,
        replyToMessageId: replyToMessageId ?? dc.ctx.messageId,
        accountId: dc.account.accountId,
        chatType: dc.ctx.chatType,
        replyInThread: dc.isThread,
        toolUseDisplay: {
            mode: 'off',
            showToolUse: false,
            showToolResultDetails: false,
            showFullPaths: false,
        },
    });
    dc.log(`feishu[${dc.account.accountId}]: dispatching permission error notification to agent`);
    await dc.core.channel.reply.dispatchReplyFromConfig({
        ctx: permCtx,
        cfg: dc.accountScopedCfg,
        dispatcher: permDispatcher,
        replyOptions: permReplyOptions,
    });
    await permDispatcher.waitForIdle();
    markPermComplete();
    markPermIdle();
}
// ---------------------------------------------------------------------------
// System command dispatch
// ---------------------------------------------------------------------------
/**
 * Dispatch a system command (/help, /reset, etc.) via plain-text delivery.
 * No streaming card, no "Processing..." state.
 */
async function dispatchSystemCommand(dc, ctxPayload, replyToMessageId) {
    let delivered = false;
    const suppressToolDetails = isLifecycleSessionCommand(dc.ctx.content);
    dc.log(`feishu[${dc.account.accountId}]: detected system command, using plain-text dispatch`);
    log.info('system command detected, plain-text dispatch');
    await dc.core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
        ctx: ctxPayload,
        cfg: dc.accountScopedCfg,
        dispatcherOptions: {
            deliver: async (payload, info) => {
                if (suppressToolDetails && info.kind === 'tool') {
                    return;
                }
                const text = payload.text?.trim() ?? '';
                if (!text)
                    return;
                await (0, send_1.sendMessageFeishu)({
                    cfg: dc.accountScopedCfg,
                    to: dc.ctx.chatId,
                    text,
                    replyToMessageId: replyToMessageId ?? dc.ctx.messageId,
                    accountId: dc.account.accountId,
                    replyInThread: dc.isThread,
                });
                delivered = true;
            },
            onSkip: (_payload, info) => {
                if (info.reason !== 'silent') {
                    dc.log(`feishu[${dc.account.accountId}]: command reply skipped (reason=${info.reason})`);
                }
            },
            onError: (err, info) => {
                dc.error(`feishu[${dc.account.accountId}]: command ${info.kind} reply failed: ${String(err)}`);
            },
        },
        replyOptions: {},
    });
    dc.log(`feishu[${dc.account.accountId}]: system command dispatched (delivered=${delivered})`);
    log.info(`system command dispatched (delivered=${delivered}, elapsed=${(0, lark_ticket_1.ticketElapsed)()}ms)`);
}
function isLifecycleSessionCommand(text) {
    if (!text)
        return false;
    const match = text.trim().match(/^\/([^\s@]+)/);
    if (!match)
        return false;
    const command = match[1]?.toLowerCase();
    return command === 'new' || command === 'reset';
}
