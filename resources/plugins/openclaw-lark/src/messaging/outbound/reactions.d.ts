/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Reaction management for the Lark/Feishu channel plugin.
 *
 * Provides functions to add, remove, and list emoji reactions on Feishu
 * messages using the IM Message Reaction API.
 */
import type { OpenClawConfig } from 'openclaw/plugin-sdk';
/**
 * Represents a single reaction on a Feishu message.
 */
export interface FeishuReaction {
    /** Unique reaction ID assigned by the platform. */
    reactionId: string;
    /** The emoji type string (e.g. "THUMBSUP", "HEART"). */
    emojiType: string;
    /** Whether the reaction was added by an app or a human user. */
    operatorType: 'app' | 'user';
    /** Open ID of the operator who added the reaction. */
    operatorId: string;
}
/**
 * Well-known Feishu emoji type strings.
 *
 * This is a convenience map so consumers do not need to memorise the
 * exact string identifiers. It is intentionally non-exhaustive --
 * Feishu supports many more emoji types. Any valid emoji type string
 * can be passed directly to the API functions.
 */
export declare const FeishuEmoji: {
    readonly THUMBSUP: "THUMBSUP";
    readonly THUMBSDOWN: "THUMBSDOWN";
    readonly HEART: "HEART";
    readonly SMILE: "SMILE";
    readonly JOYFUL: "JOYFUL";
    readonly FROWN: "FROWN";
    readonly BLUSH: "BLUSH";
    readonly OK: "OK";
    readonly CLAP: "CLAP";
    readonly FIREWORKS: "FIREWORKS";
    readonly PARTY: "PARTY";
    readonly MUSCLE: "MUSCLE";
    readonly FIRE: "FIRE";
    readonly EYES: "EYES";
    readonly THINKING: "THINKING";
    readonly PRAISE: "PRAISE";
    readonly PRAY: "PRAY";
    readonly ROCKET: "ROCKET";
    readonly DONE: "DONE";
    readonly SKULL: "SKULL";
    readonly HUNDREDPOINTS: "HUNDREDPOINTS";
    readonly FACEPALM: "FACEPALM";
    readonly CHECK: "CHECK";
    readonly CROSSMARK: "CrossMark";
    readonly COOL: "COOL";
    readonly TYPING: "Typing";
    readonly SPEECHLESS: "SPEECHLESS";
};
/**
 * Complete set of valid Feishu emoji type strings for reactions.
 *
 * Sourced from the official Feishu emoji documentation.
 * Unlike `FeishuEmoji` (a convenience subset), this set is exhaustive
 * and can be used for validation and error reporting.
 *
 * @see https://go.feishu.cn/s/670vFWbA804
 */
export declare const VALID_FEISHU_EMOJI_TYPES: ReadonlySet<string>;
/**
 * Add an emoji reaction to a Feishu message.
 *
 * @param params.cfg       - Plugin configuration with Feishu credentials.
 * @param params.messageId - The message to react to.
 * @param params.emojiType - The emoji type string (e.g. "THUMBSUP").
 * @param params.accountId - Optional account identifier for multi-account setups.
 * @returns An object containing the platform-assigned reaction ID.
 */
export declare function addReactionFeishu(params: {
    cfg: OpenClawConfig;
    messageId: string;
    emojiType: string;
    accountId?: string;
}): Promise<{
    reactionId: string;
}>;
/**
 * Remove a specific reaction from a Feishu message by its reaction ID.
 *
 * Unlike the outbound module's `removeReaction` (which looks up the
 * reaction by emoji type), this function takes the exact reaction ID
 * for direct deletion.
 *
 * @param params.cfg        - Plugin configuration with Feishu credentials.
 * @param params.messageId  - The message the reaction belongs to.
 * @param params.reactionId - The platform-assigned reaction ID to delete.
 * @param params.accountId  - Optional account identifier for multi-account setups.
 */
export declare function removeReactionFeishu(params: {
    cfg: OpenClawConfig;
    messageId: string;
    reactionId: string;
    accountId?: string;
}): Promise<void>;
/**
 * List reactions on a Feishu message, optionally filtered by emoji type.
 *
 * Paginates through all results and returns a flat array of
 * {@link FeishuReaction} objects.
 *
 * @param params.cfg       - Plugin configuration with Feishu credentials.
 * @param params.messageId - The message whose reactions to list.
 * @param params.emojiType - Optional emoji type filter (e.g. "THUMBSUP").
 *                           When omitted, all reaction types are returned.
 * @param params.accountId - Optional account identifier for multi-account setups.
 * @returns An array of reactions matching the criteria.
 */
export declare function listReactionsFeishu(params: {
    cfg: OpenClawConfig;
    messageId: string;
    emojiType?: string;
    accountId?: string;
}): Promise<FeishuReaction[]>;
