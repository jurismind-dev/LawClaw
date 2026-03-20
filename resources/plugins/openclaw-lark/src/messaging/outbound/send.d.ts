/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Message sending for the Lark/Feishu channel plugin.
 */
import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { FeishuSendResult } from '../types';
import type { MentionInfo } from '../types';
/**
 * Parameters for sending a text / post message.
 */
export interface SendFeishuMessageParams {
    cfg: ClawdbotConfig;
    /** Target identifier (chat_id, open_id, or user_id). */
    to: string;
    /** Message text content (supports Feishu markdown subset). */
    text: string;
    /** When set, the message is sent as a threaded reply. */
    replyToMessageId?: string;
    /** Optional mention targets to prepend to the message. */
    mentions?: MentionInfo[];
    /** Optional account identifier for multi-account setups. */
    accountId?: string;
    /** When true, the reply appears in the thread instead of main chat. */
    replyInThread?: boolean;
    /**
     * Optional multi-locale texts for i18n post messages.
     * When provided, builds a multi-locale post structure (e.g. { zh_cn: ..., en_us: ... })
     * and the `text` field is ignored. Feishu client auto-selects locale based on user language.
     */
    i18nTexts?: Record<string, string>;
}
/**
 * Parameters for sending an interactive card message.
 */
export interface SendFeishuCardParams {
    cfg: ClawdbotConfig;
    /** Target identifier (chat_id, open_id, or user_id). */
    to: string;
    /** The full interactive card JSON payload. */
    card: Record<string, unknown>;
    /** When set, the card is sent as a threaded reply. */
    replyToMessageId?: string;
    /** Optional account identifier for multi-account setups. */
    accountId?: string;
    /** When true, the reply appears in the thread instead of main chat. */
    replyInThread?: boolean;
}
/**
 * Send a text message (rendered as a Feishu "post" with markdown support)
 * to a chat or user.
 *
 * The message text is wrapped in Feishu's post format using the `md` tag
 * for rich rendering. If `replyToMessageId` is provided, the message is
 * sent as a threaded reply; otherwise it is sent as a new message using
 * the appropriate `receive_id_type`.
 *
 * Markdown tables in the text are automatically converted to the format
 * supported by Feishu via the runtime's table converter when available.
 *
 * @param params - See {@link SendFeishuMessageParams}.
 * @returns The send result containing the new message ID.
 */
export declare function sendMessageFeishu(params: SendFeishuMessageParams): Promise<FeishuSendResult>;
/**
 * Send an interactive card message to a chat or user.
 *
 * @param params - See {@link SendFeishuCardParams}.
 * @returns The send result containing the new message ID.
 */
export declare function sendCardFeishu(params: SendFeishuCardParams): Promise<FeishuSendResult>;
/**
 * Update (PATCH) the content of an existing interactive card message.
 *
 * Only messages originally sent by the bot can be updated. The card
 * must have been created with `"update_multi": true` in its config if
 * all recipients should see the update.
 *
 * @param params.cfg       - Plugin configuration.
 * @param params.messageId - The card message ID to update.
 * @param params.card      - The new card content.
 * @param params.accountId - Optional account identifier.
 */
export declare function updateCardFeishu(params: {
    cfg: ClawdbotConfig;
    messageId: string;
    card: Record<string, unknown>;
    accountId?: string;
}): Promise<void>;
/**
 * Build a simple Feishu Interactive Message Card containing a single
 * markdown element.
 *
 * This is a convenience wrapper for the most common card layout: a
 * wide-screen card with one markdown block.
 *
 * @param text - The markdown text to render in the card.
 * @returns A card JSON object ready to be sent via {@link sendCardFeishu}.
 */
export declare function buildMarkdownCard(text: string): Record<string, unknown>;
/**
 * Build an i18n-aware Feishu Interactive Message Card containing a single
 * markdown element with per-locale content.
 *
 * Uses the CardKit v2 `i18n_content` field so the Feishu client
 * auto-selects the locale matching the user's language setting.
 *
 * @param i18nTexts - A map of locale to markdown text (e.g. { zh_cn: '...', en_us: '...' }).
 * @returns A card JSON object ready to be sent via {@link sendCardFeishu}.
 */
export declare function buildI18nMarkdownCard(i18nTexts: Record<string, string>): Record<string, unknown>;
/**
 * Build a markdown card and send it in one step.
 *
 * If mention targets are provided, they are prepended to the markdown
 * content using the card mention syntax.
 *
 * @param params.cfg              - Plugin configuration.
 * @param params.to               - Target identifier.
 * @param params.text             - Markdown content for the card.
 * @param params.replyToMessageId - Optional message ID for threaded reply.
 * @param params.mentions         - Optional mention targets.
 * @param params.accountId        - Optional account identifier.
 * @returns The send result containing the new message ID.
 */
export declare function sendMarkdownCardFeishu(params: {
    cfg: ClawdbotConfig;
    to: string;
    text: string;
    replyToMessageId?: string;
    mentions?: MentionInfo[];
    accountId?: string;
    replyInThread?: boolean;
}): Promise<FeishuSendResult>;
/**
 * Edit the content of an existing message.
 *
 * Updates the message body via the IM message update API. Only
 * messages sent by the bot can be edited.
 *
 * @param params.cfg       - Plugin configuration.
 * @param params.messageId - The message ID to edit.
 * @param params.text      - The new message text.
 * @param params.accountId - Optional account identifier.
 */
export declare function editMessageFeishu(params: {
    cfg: ClawdbotConfig;
    messageId: string;
    text: string;
    accountId?: string;
}): Promise<void>;
