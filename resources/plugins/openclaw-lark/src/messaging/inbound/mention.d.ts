/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * @mention utilities for the Lark/Feishu channel plugin.
 *
 * All logic is based on `MentionInfo[]` from `MessageContext.mentions`.
 * Provides:
 * - Derive helpers: `mentionedBot()`, `nonBotMentions()`
 * - Format helpers for outbound text and card messages.
 */
import type { MentionInfo, MessageContext } from '../types';
export type { MentionInfo } from '../types';
/** Whether the bot was @-mentioned. */
export declare function mentionedBot(ctx: MessageContext): boolean;
/** All non-bot mentions. */
export declare function nonBotMentions(ctx: MessageContext): MentionInfo[];
/**
 * Remove all @mention placeholder keys from the message text.
 */
export declare function extractMessageBody(text: string, allMentionKeys: string[]): string;
/**
 * Format a mention for a Feishu text / post message.
 * @returns e.g. `<at user_id="ou_xxx">Alice</at>`
 */
export declare function formatMentionForText(target: MentionInfo): string;
/** Format an @everyone mention for text / post. */
export declare function formatMentionAllForText(): string;
/**
 * Format a mention for a Feishu Interactive Card.
 * @returns e.g. `<at id=ou_xxx></at>`
 */
export declare function formatMentionForCard(target: MentionInfo): string;
/** Format an @everyone mention for card. */
export declare function formatMentionAllForCard(): string;
/** Prepend @mention tags (text format) to a message body. */
export declare function buildMentionedMessage(targets: MentionInfo[], message: string): string;
/** Prepend @mention tags (card format) to card markdown content. */
export declare function buildMentionedCardContent(targets: MentionInfo[], message: string): string;
