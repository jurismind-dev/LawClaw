"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * 消息不可用（已撤回/已删除）状态管理。
 *
 * 目标：
 * 1) 当命中飞书终止错误码（230011/231003）时，按 message_id 标记不可用；
 * 2) 后续针对该 message_id 的 API 调用直接短路，避免持续报错刷屏。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageUnavailableError = void 0;
exports.isTerminalMessageApiCode = isTerminalMessageApiCode;
exports.markMessageUnavailable = markMessageUnavailable;
exports.getMessageUnavailableState = getMessageUnavailableState;
exports.isMessageUnavailable = isMessageUnavailable;
exports.markMessageUnavailableFromError = markMessageUnavailableFromError;
exports.isMessageUnavailableError = isMessageUnavailableError;
exports.assertMessageAvailable = assertMessageAvailable;
exports.runWithMessageUnavailableGuard = runWithMessageUnavailableGuard;
const auth_errors_1 = require("./auth-errors.js");
const api_error_1 = require("./api-error.js");
const targets_1 = require("./targets.js");
const UNAVAILABLE_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_SIZE_BEFORE_PRUNE = 512;
const unavailableMessageCache = new Map();
function pruneExpired(nowMs = Date.now()) {
    for (const [messageId, state] of unavailableMessageCache) {
        if (nowMs - state.markedAtMs > UNAVAILABLE_CACHE_TTL_MS) {
            unavailableMessageCache.delete(messageId);
        }
    }
}
function isTerminalMessageApiCode(code) {
    return typeof code === 'number' && auth_errors_1.MESSAGE_TERMINAL_CODES.has(code);
}
function markMessageUnavailable(params) {
    const normalizedId = (0, targets_1.normalizeMessageId)(params.messageId);
    if (!normalizedId)
        return;
    if (unavailableMessageCache.size >= MAX_CACHE_SIZE_BEFORE_PRUNE) {
        pruneExpired();
    }
    unavailableMessageCache.set(normalizedId, {
        apiCode: params.apiCode,
        operation: params.operation,
        markedAtMs: Date.now(),
    });
}
function getMessageUnavailableState(messageId) {
    const normalizedId = (0, targets_1.normalizeMessageId)(messageId);
    if (!normalizedId)
        return undefined;
    const state = unavailableMessageCache.get(normalizedId);
    if (!state)
        return undefined;
    if (Date.now() - state.markedAtMs > UNAVAILABLE_CACHE_TTL_MS) {
        unavailableMessageCache.delete(normalizedId);
        return undefined;
    }
    return state;
}
function isMessageUnavailable(messageId) {
    return !!getMessageUnavailableState(messageId);
}
function markMessageUnavailableFromError(params) {
    const normalizedId = (0, targets_1.normalizeMessageId)(params.messageId);
    if (!normalizedId)
        return undefined;
    const code = (0, api_error_1.extractLarkApiCode)(params.error);
    if (!isTerminalMessageApiCode(code))
        return undefined;
    markMessageUnavailable({
        messageId: normalizedId,
        apiCode: code,
        operation: params.operation,
    });
    return code;
}
class MessageUnavailableError extends Error {
    messageId;
    apiCode;
    operation;
    constructor(params) {
        const operationText = params.operation ? `, op=${params.operation}` : '';
        super(`[feishu-message-unavailable] message ${params.messageId} unavailable (code=${params.apiCode}${operationText})`);
        this.name = 'MessageUnavailableError';
        this.messageId = params.messageId;
        this.apiCode = params.apiCode;
        this.operation = params.operation;
    }
}
exports.MessageUnavailableError = MessageUnavailableError;
function isMessageUnavailableError(error) {
    return (error instanceof MessageUnavailableError ||
        (typeof error === 'object' && error != null && error.name === 'MessageUnavailableError'));
}
function assertMessageAvailable(messageId, operation) {
    const normalizedId = (0, targets_1.normalizeMessageId)(messageId);
    if (!normalizedId)
        return;
    const state = getMessageUnavailableState(normalizedId);
    if (!state)
        return;
    throw new MessageUnavailableError({
        messageId: normalizedId,
        apiCode: state.apiCode,
        operation: operation ?? state.operation,
    });
}
/**
 * 针对 message_id 的统一保护：
 * - 调用前检查是否已标记不可用；
 * - 调用报错后识别 230011/231003 并标记；
 * - 命中时抛出 MessageUnavailableError 供上游快速终止流程。
 */
async function runWithMessageUnavailableGuard(params) {
    const normalizedId = (0, targets_1.normalizeMessageId)(params.messageId);
    if (!normalizedId) {
        return params.fn();
    }
    assertMessageAvailable(normalizedId, params.operation);
    try {
        return await params.fn();
    }
    catch (error) {
        const code = markMessageUnavailableFromError({
            messageId: normalizedId,
            error,
            operation: params.operation,
        });
        if (code) {
            throw new MessageUnavailableError({
                messageId: normalizedId,
                apiCode: code,
                operation: params.operation,
            });
        }
        throw error;
    }
}
