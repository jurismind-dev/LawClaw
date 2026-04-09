"use strict";
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Guard against operating on unavailable (deleted/recalled) messages.
 *
 * Encapsulates the terminateDueToUnavailable / shouldSkipForUnavailable
 * logic previously scattered as closures in reply-dispatcher.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnavailableGuard = void 0;
const lark_logger_1 = require("../core/lark-logger.js");
const api_error_1 = require("../core/api-error.js");
const message_unavailable_1 = require("../core/message-unavailable.js");
const log = (0, lark_logger_1.larkLogger)('card/unavailable-guard');
// ---------------------------------------------------------------------------
// UnavailableGuard
// ---------------------------------------------------------------------------
class UnavailableGuard {
    terminated = false;
    replyToMessageId;
    getCardMessageId;
    onTerminate;
    constructor(params) {
        this.replyToMessageId = params.replyToMessageId;
        this.getCardMessageId = params.getCardMessageId;
        this.onTerminate = params.onTerminate;
    }
    get isTerminated() {
        return this.terminated;
    }
    /**
     * Check whether the reply pipeline should skip further operations.
     * Returns true if the message is already known to be unavailable.
     */
    shouldSkip(source) {
        if (this.terminated)
            return true;
        if (!this.replyToMessageId)
            return false;
        if (!(0, message_unavailable_1.isMessageUnavailable)(this.replyToMessageId))
            return false;
        return this.terminate(source);
    }
    /**
     * Attempt to terminate the reply pipeline due to an unavailable message.
     *
     * @param source - Descriptive label for the caller (for logging).
     * @param err    - Optional error that triggered the check.
     * @returns true if the pipeline was (or already had been) terminated.
     */
    terminate(source, err) {
        if (this.terminated)
            return true;
        const fromError = (0, message_unavailable_1.isMessageUnavailableError)(err) ? err : undefined;
        const cardMessageId = this.getCardMessageId();
        const state = (0, message_unavailable_1.getMessageUnavailableState)(this.replyToMessageId) ?? (0, message_unavailable_1.getMessageUnavailableState)(cardMessageId ?? undefined);
        let apiCode = fromError?.apiCode ?? state?.apiCode;
        if (!apiCode && err) {
            const detectedCode = (0, api_error_1.extractLarkApiCode)(err);
            if ((0, message_unavailable_1.isTerminalMessageApiCode)(detectedCode)) {
                const fallbackMessageId = this.replyToMessageId ?? cardMessageId ?? undefined;
                if (fallbackMessageId) {
                    (0, message_unavailable_1.markMessageUnavailable)({
                        messageId: fallbackMessageId,
                        apiCode: detectedCode,
                        operation: source,
                    });
                }
                apiCode = detectedCode;
            }
        }
        if (!apiCode)
            return false;
        this.terminated = true;
        this.onTerminate();
        const affectedMessageId = fromError?.messageId ?? this.replyToMessageId ?? cardMessageId ?? 'unknown';
        log.warn('reply pipeline terminated by unavailable message', {
            source,
            apiCode,
            messageId: affectedMessageId,
        });
        return true;
    }
}
exports.UnavailableGuard = UnavailableGuard;
