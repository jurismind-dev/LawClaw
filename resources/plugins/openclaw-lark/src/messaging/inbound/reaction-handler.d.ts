/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Reaction event handler for the Lark/Feishu channel plugin.
 *
 * Handles `im.message.reaction.created_v1` events by building a
 * {@link MessageContext} directly and dispatching to the agent via
 * {@link dispatchToAgent}, bypassing the full 7-stage message pipeline.
 *
 * Controlled by `reactionNotifications` (default: "own"):
 *   - `"off"`  — reaction events are silently ignored.
 *   - `"own"`  — only reactions on the bot's own messages are dispatched.
 *   - `"all"`  — reactions on any message in the chat are dispatched.
 */
import type { ClawdbotConfig, RuntimeEnv } from 'openclaw/plugin-sdk';
import type { HistoryEntry } from 'openclaw/plugin-sdk/reply-history';
import type { FeishuReactionCreatedEvent } from '../types';
import { type FeishuMessageInfo } from '../shared/message-lookup';
export interface ReactionContext {
    /** Real chatId (from message API, or `p2p:${operatorOpenId}` fallback). */
    chatId: string;
    /** Resolved chat type. */
    chatType: 'p2p' | 'group';
    /** Thread ID from the fetched message, if any. */
    threadId?: string;
    /** Whether the chat is thread-capable (topic or thread-mode group). */
    threadCapable?: boolean;
    /** Fetched message info used to build the synthetic event. */
    msg: FeishuMessageInfo;
}
/**
 * Pre-resolve reaction context before enqueuing.
 *
 * Performs account config checks, safety filters, API fetch of the
 * original message, ownership verification, chat type resolution, and
 * thread-capable detection.  Returns `null` when the reaction should
 * be skipped (mode off, safety filter, timeout, ownership mismatch,
 * thread-capable group with threadSession enabled).
 *
 * This function is intentionally separated so that the caller
 * (event-handlers.ts) can resolve the real chatId *before* enqueuing,
 * ensuring the reaction shares the same queue key as normal messages
 * for the same chat.
 */
export declare function resolveReactionContext(params: {
    cfg: ClawdbotConfig;
    event: FeishuReactionCreatedEvent;
    botOpenId?: string;
    runtime?: RuntimeEnv;
    accountId?: string;
}): Promise<ReactionContext | null>;
export declare function handleFeishuReaction(params: {
    cfg: ClawdbotConfig;
    event: FeishuReactionCreatedEvent;
    botOpenId?: string;
    runtime?: RuntimeEnv;
    chatHistories?: Map<string, HistoryEntry[]>;
    accountId?: string;
    /** Pre-resolved context from resolveReactionContext(). */
    preResolved: ReactionContext;
}): Promise<void>;
