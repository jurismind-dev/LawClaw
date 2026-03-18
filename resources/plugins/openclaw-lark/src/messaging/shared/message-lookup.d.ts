/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Message fetching for the Lark/Feishu channel plugin.
 *
 * Shared between inbound (reaction handler, enrich) and outbound modules.
 * Extracted from `outbound/fetch.ts` to eliminate inbound→outbound
 * dependency inversion.
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
/**
 * Normalised information about a Feishu message, returned by
 * {@link getMessageFeishu}.
 */
export interface FeishuMessageInfo {
    /** Unique Feishu message ID. */
    messageId: string;
    /** Chat ID where the message lives. */
    chatId: string;
    /** Chat type ("p2p" or "group"), when available in the API response. */
    chatType?: string;
    /** Open ID of the sender (if available). */
    senderId?: string;
    /** Display name of the sender (resolved from user-name cache). */
    senderName?: string;
    /** Feishu sender type: "user" for human users, "app" for bots/apps. */
    senderType?: string;
    /** The parsed text / content of the message. */
    content: string;
    /** Feishu content type indicator (text, post, image, interactive, ...). */
    contentType: string;
    /** Unix-millisecond timestamp of when the message was created. */
    createTime?: number;
    /** Thread ID if the message belongs to a thread (omt_xxx format). */
    threadId?: string;
}
/**
 * Retrieve a single message by its ID from the Feishu IM API.
 *
 * Returns a normalised {@link FeishuMessageInfo} object, or `null` if the
 * message cannot be found or the API returns an error.
 *
 * @param params.cfg       - Plugin configuration with Feishu credentials.
 * @param params.messageId - The message ID to fetch.
 * @param params.accountId - Optional account identifier for multi-account setups.
 */
export declare function getMessageFeishu(params: {
    cfg: ClawdbotConfig;
    messageId: string;
    accountId?: string;
    /** When true, merge_forward content is recursively expanded via API. */
    expandForward?: boolean;
}): Promise<FeishuMessageInfo | null>;
