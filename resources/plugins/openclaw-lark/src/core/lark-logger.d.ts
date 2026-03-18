/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Structured logger factory for the Feishu plugin.
 *
 * Wraps `PluginRuntime.logging.getChildLogger()` with automatic
 * LarkTicket injection from AsyncLocalStorage and a console fallback
 * when the runtime is not yet initialised.
 *
 * Usage:
 *   const log = larkLogger("card/streaming");
 *   log.info("created entity", { cardId, sequence });
 */
export interface LarkLogger {
    readonly subsystem: string;
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
    child(name: string): LarkLogger;
}
export declare function larkLogger(subsystem: string): LarkLogger;
