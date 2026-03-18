/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Typing indicator management for the Lark/Feishu channel plugin.
 *
 * Feishu does not expose a first-class "typing indicator" API the way
 * some other messaging platforms do. Instead, this module simulates a
 * typing state by adding a recognisable emoji reaction (the "Typing"
 * emoji) to the user's message while the bot is processing, and
 * removing it once the response is ready.
 *
 * This provides a lightweight visual cue that the bot has acknowledged
 * the message and is working on a reply.
 */
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
/**
 * Tracks the state of an active typing indicator so it can be
 * removed later.
 */
export interface TypingIndicatorState {
    /** The message ID that the reaction was added to. */
    messageId: string;
    /** The reaction ID returned by the API, or null if the add failed. */
    reactionId: string | null;
}
/**
 * Add a typing indicator to a message by creating an emoji reaction.
 *
 * The reaction is added silently -- any errors (network issues, missing
 * permissions, rate limits) are caught and logged rather than propagated
 * to the caller. This ensures that a failure to show the typing cue
 * never blocks the actual message processing.
 *
 * @param params.cfg       - Plugin configuration with Feishu credentials.
 * @param params.messageId - The message ID to add the typing reaction to.
 * @param params.accountId - Optional account identifier for multi-account setups.
 * @returns A state object that should be passed to {@link removeTypingIndicator}.
 */
export declare function addTypingIndicator(params: {
    cfg: OpenClawConfig;
    messageId: string;
    accountId?: string;
}): Promise<TypingIndicatorState>;
/**
 * Remove a previously added typing indicator reaction from a message.
 *
 * If the indicator was never successfully added (reactionId is null),
 * this function is a no-op. Errors are silently caught so removal
 * failures do not disrupt downstream logic.
 *
 * @param params.cfg   - Plugin configuration with Feishu credentials.
 * @param params.state - The typing indicator state returned by {@link addTypingIndicator}.
 * @param params.accountId - Optional account identifier for multi-account setups.
 */
export declare function removeTypingIndicator(params: {
    cfg: OpenClawConfig;
    state: TypingIndicatorState;
    accountId?: string;
}): Promise<void>;
