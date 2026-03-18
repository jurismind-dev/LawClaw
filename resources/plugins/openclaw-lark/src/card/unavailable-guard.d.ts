/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Guard against operating on unavailable (deleted/recalled) messages.
 *
 * Encapsulates the terminateDueToUnavailable / shouldSkipForUnavailable
 * logic previously scattered as closures in reply-dispatcher.ts.
 */
export interface UnavailableGuardParams {
    replyToMessageId: string | undefined;
    getCardMessageId: () => string | null;
    onTerminate: () => void;
}
export declare class UnavailableGuard {
    private terminated;
    private readonly replyToMessageId;
    private readonly getCardMessageId;
    private readonly onTerminate;
    constructor(params: UnavailableGuardParams);
    get isTerminated(): boolean;
    /**
     * Check whether the reply pipeline should skip further operations.
     * Returns true if the message is already known to be unavailable.
     */
    shouldSkip(source: string): boolean;
    /**
     * Attempt to terminate the reply pipeline due to an unavailable message.
     *
     * @param source - Descriptive label for the caller (for logging).
     * @param err    - Optional error that triggered the check.
     * @returns true if the pipeline was (or already had been) terminated.
     */
    terminate(source: string, err?: unknown): boolean;
}
