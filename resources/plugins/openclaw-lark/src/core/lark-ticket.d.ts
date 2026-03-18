/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Request-level ticket for the Feishu plugin.
 *
 * Uses Node.js AsyncLocalStorage to propagate a ticket (message_id,
 * chat_id, account_id) through the entire async call chain without passing
 * parameters explicitly.  Call {@link withTicket} at the event entry point
 * (monitor.ts) and use {@link getTicket} anywhere downstream.
 */
export interface LarkTicket {
    messageId: string;
    chatId: string;
    accountId: string;
    startTime: number;
    senderOpenId?: string;
    chatType?: 'p2p' | 'group';
    threadId?: string;
}
/**
 * Run `fn` within a ticket context.  All async operations spawned inside
 * `fn` will inherit the context and can access it via {@link getTicket}.
 */
export declare function withTicket<T>(ticket: LarkTicket, fn: () => T | Promise<T>): T | Promise<T>;
/** Return the current ticket, or `undefined` if not inside withTicket. */
export declare function getTicket(): LarkTicket | undefined;
/** Milliseconds elapsed since the current ticket was created, or 0. */
export declare function ticketElapsed(): number;
